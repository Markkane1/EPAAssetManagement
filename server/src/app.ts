import express from 'express';
import cors from 'cors';
import helmet from 'helmet';
import morgan from 'morgan';
import path from 'path';
import fs from 'fs';
import { env } from './config/env';
import routes from './routes';
import { errorHandler } from './middleware/errorHandler';

export function createApp() {
  const app = express();

  const allowedOrigins = env.corsOrigin
    .split(',')
    .map((value) => value.trim())
    .filter(Boolean);
  const isDev = process.env.NODE_ENV !== 'production';

  app.use(
    cors({
      origin(origin, callback) {
        if (!origin || allowedOrigins.includes('*') || isDev) {
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
  app.use(express.json({ limit: '2mb' }));
  app.use(morgan('dev'));

  const uploadsDir = path.resolve(process.cwd(), 'uploads');
  if (!fs.existsSync(uploadsDir)) {
    fs.mkdirSync(uploadsDir, { recursive: true });
  }
  app.use('/uploads', express.static(uploadsDir));

  app.get('/health', (_req, res) => {
    res.json({ status: 'ok' });
  });

  app.use('/api', routes);

  app.use(errorHandler);

  return app;
}
