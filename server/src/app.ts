import express from 'express';
import cors from 'cors';
import helmet from 'helmet';
import morgan from 'morgan';
import cookieParser from 'cookie-parser';
import compression from 'compression';
import { env } from './config/env';
import routes from './routes';
import { errorHandler } from './middleware/errorHandler';

function compressionFilter(req: express.Request, res: express.Response) {
  const contentType = String(res.getHeader('Content-Type') || '').toLowerCase();
  if (contentType.includes('application/pdf') || contentType.startsWith('image/')) {
    return false;
  }
  return compression.filter(req, res);
}

export function createApp() {
  const app = express();
  app.disable('x-powered-by');

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
  app.use(helmet());
  app.use(cookieParser());
  app.use(
    compression({
      filter: compressionFilter,
      threshold: 1024,
    })
  );
  app.use(express.json({ limit: '2mb' }));
  app.use(morgan('dev'));

  app.get('/health', (_req, res) => {
    res.json({ status: 'ok' });
  });

  app.use('/api', routes);

  app.use(errorHandler);

  return app;
}
