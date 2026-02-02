import { createApp } from './app';
import { connectDatabase } from './config/db';
import { env } from './config/env';
import { ensureSuperAdmin } from './services/seedAdmin';

async function start() {
  await connectDatabase();
  await ensureSuperAdmin({
    email: env.superAdminEmail,
    password: env.superAdminPassword,
  });
  const app = createApp();
  app.listen(env.port, () => {
    console.log(`Server listening on port ${env.port}`);
  });
}

start().catch((error) => {
  console.error('Failed to start server:', error);
  process.exit(1);
});
