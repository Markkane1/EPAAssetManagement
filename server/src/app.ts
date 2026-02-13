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

  const allowedOrigins = env.corsOrigin
    .split(',')
    .map((value) => value.trim())
    .filter(Boolean);

  app.use(
    cors({
      origin(origin, callback) {
        if (!origin || allowedOrigins.includes('*')) {
          return callback(null, true);
        }
        if (allowedOrigins.includes(origin)) {
          return callback(null, true);
        }
        return callback(new Error('Not allowed by CORS'));
      },
      credentials: true,
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
