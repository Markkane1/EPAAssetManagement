import express from 'express';
import cors from 'cors';
import helmet from 'helmet';
import morgan from 'morgan';
import cookieParser from 'cookie-parser';
import compression from 'compression';
import mongoSanitize from 'express-mongo-sanitize';
import { clean as cleanXssPayload } from 'xss-clean/lib/xss';
import { env } from './config/env';
import routes from './routes';
import { errorHandler } from './middleware/errorHandler';
import { applyCachePolicy } from './middleware/cachePolicy';
import { observeRequestMetrics } from './middleware/requestMetrics';

function compressionFilter(req: express.Request, res: express.Response) {
  const contentType = String(res.getHeader('Content-Type') || '').toLowerCase();
  if (
    contentType.includes('application/pdf')
    || contentType.startsWith('image/')
    || contentType.includes('application/zip')
    || contentType.includes('application/gzip')
    || contentType.includes('font/')
  ) {
    return false;
  }
  return compression.filter(req, res);
}

const mongoSanitizeHelper = mongoSanitize as typeof mongoSanitize & {
  sanitize: (target: unknown, options?: { replaceWith?: string; allowDots?: boolean; dryRun?: boolean }) => unknown;
};

function replaceObjectContents(
  target: Record<string, unknown>,
  source: Record<string, unknown>
) {
  for (const key of Object.keys(target)) {
    delete target[key];
  }
  Object.assign(target, source);
}

function sanitizeXssValue(value: unknown) {
  return cleanXssPayload(value);
}

function sanitizeStringValue(value: string) {
  return value
    .replace(/\u0000/g, '')
    .replace(/\r\n?/g, ' ')
    .replace(/\bjavascript\s*:/gi, '')
    .replace(/\bon[a-z]+\s*=/gi, '')
    .trim();
}

function sanitizeRequestValue(value: unknown): unknown {
  if (typeof value === 'string') {
    return sanitizeStringValue(sanitizeXssValue(value) as string);
  }
  if (Array.isArray(value)) {
    return value.map((entry) => sanitizeRequestValue(entry));
  }
  if (value && typeof value === 'object') {
    return Object.fromEntries(
      Object.entries(value as Record<string, unknown>).map(([key, entry]) => [
        key,
        sanitizeRequestValue(entry),
      ])
    );
  }
  return value;
}

function sanitizeXssRequest(req: express.Request) {
  if (req.body !== undefined) {
    req.body = sanitizeRequestValue(req.body);
  }
  if (req.params && typeof req.params === 'object') {
    const sanitized = sanitizeRequestValue(req.params);
    if (sanitized && typeof sanitized === 'object' && !Array.isArray(sanitized)) {
      replaceObjectContents(req.params as Record<string, unknown>, sanitized as Record<string, unknown>);
    }
  }
  if (req.query && typeof req.query === 'object') {
    const queryObject = req.query as Record<string, unknown>;
    const sanitized = sanitizeRequestValue(queryObject);
    if (sanitized && typeof sanitized === 'object' && !Array.isArray(sanitized)) {
      replaceObjectContents(queryObject, sanitized as Record<string, unknown>);
    }
  }
}

function sanitizeNoSqlRequest(req: express.Request) {
  const options = {
    replaceWith: '_',
    allowDots: false,
  };
  if (req.body && typeof req.body === 'object') {
    mongoSanitizeHelper.sanitize(req.body, options);
  }
  if (req.params && typeof req.params === 'object') {
    mongoSanitizeHelper.sanitize(req.params, options);
  }
  if (req.query && typeof req.query === 'object') {
    mongoSanitizeHelper.sanitize(req.query as Record<string, unknown>, options);
  }
}

export function createApp() {
  const app = express();
  app.disable('x-powered-by');
  app.set('etag', 'strong');
  app.set('trust proxy', env.trustProxy);

  const normalizeOrigin = (value: string) => value.trim().replace(/\/+$/, '');
  const parseAllowedOrigins = (value: string) =>
    value
      .split(',')
      .map((entry) => normalizeOrigin(entry))
      .filter(Boolean);
  const isLoopbackOrigin = (originValue: string) => {
    try {
      const parsed = new URL(originValue);
      return ['localhost', '127.0.0.1', '[::1]'].includes(parsed.hostname);
    } catch {
      return false;
    }
  };

  const allowedOrigins = parseAllowedOrigins(env.corsOrigin);
  const allowAllOrigins = allowedOrigins.includes('*');
  const allowAnyLoopbackOrigin = allowedOrigins.some((entry) => isLoopbackOrigin(entry));

  app.use(
    cors({
      origin(origin, callback) {
        if (!origin || allowAllOrigins) {
          return callback(null, true);
        }
        const normalized = normalizeOrigin(origin);
        if (allowedOrigins.includes(normalized)) {
          return callback(null, true);
        }
        if (allowAnyLoopbackOrigin && isLoopbackOrigin(normalized)) {
          return callback(null, true);
        }
        // Do not throw; throwing here becomes a 500 and hides the real CORS cause.
        return callback(null, false);
      },
      credentials: true,
      optionsSuccessStatus: 204,
    })
  );
  app.use(
    helmet({
      contentSecurityPolicy: {
        directives: {
          defaultSrc: ["'self'"],
          baseUri: ["'self'"],
          connectSrc: ["'self'"],
          fontSrc: ["'self'", 'data:'],
          frameAncestors: ["'none'"],
          imgSrc: ["'self'", 'data:', 'blob:'],
          objectSrc: ["'none'"],
          scriptSrc: ["'self'", "'unsafe-inline'"],
          styleSrc: ["'self'", "'unsafe-inline'"],
          upgradeInsecureRequests: env.nodeEnv === 'production' ? [] : null,
        },
      },
      crossOriginEmbedderPolicy: false,
      crossOriginResourcePolicy: { policy: 'same-site' },
      referrerPolicy: { policy: 'no-referrer' },
      hsts:
        env.nodeEnv === 'production'
          ? {
              maxAge: 60 * 60 * 24 * 180,
              includeSubDomains: true,
              preload: false,
            }
          : false,
    })
  );
  app.use(cookieParser());
  app.use(
    compression({
      filter: compressionFilter,
      threshold: env.compressionThresholdBytes,
      level: env.compressionLevel,
    })
  );
  app.use(express.json({ limit: env.httpJsonLimit }));
  app.use(express.urlencoded({ extended: false, limit: env.httpUrlEncodedLimit, parameterLimit: 200 }));
  app.use(
    (req, _res, next) => {
      sanitizeNoSqlRequest(req);
      next();
    }
  );
  app.use((req, _res, next) => {
    sanitizeXssRequest(req);
    next();
  });
  app.use(observeRequestMetrics);
  if (env.nodeEnv !== 'test') {
    app.use(morgan('dev'));
  }
  app.use(applyCachePolicy);
  app.use((_req, res, next) => {
    res.setHeader('X-XSS-Protection', '0');
    next();
  });

  app.get('/health', (_req, res) => {
    res.json({ status: 'ok' });
  });

  app.use('/api', routes);

  app.use((_req, res) => {
    res.status(404).json({ message: 'Not found' });
  });

  app.use(errorHandler);

  return app;
}
