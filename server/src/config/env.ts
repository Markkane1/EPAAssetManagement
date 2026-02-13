import dotenv from 'dotenv';
import fs from 'fs';
import path from 'path';

const cwd = process.cwd();
const rootEnvPath = path.resolve(cwd, '.env');
const serverEnvPath = path.resolve(cwd, 'server', '.env');

if (fs.existsSync(rootEnvPath)) {
  dotenv.config({ path: rootEnvPath });
}
if (fs.existsSync(serverEnvPath)) {
  dotenv.config({ path: serverEnvPath, override: true });
}
if (!fs.existsSync(rootEnvPath) && !fs.existsSync(serverEnvPath)) {
  dotenv.config();
}

function assertSecret(name: string, value: string | undefined) {
  const normalized = (value || '').trim();
  if (!normalized) {
    throw new Error(`${name} is required`);
  }
  if (normalized === 'change-me' || normalized === 'Admin123!') {
    throw new Error(`${name} must not use default placeholder values`);
  }
  if (normalized.length < 32) {
    throw new Error(`${name} must be at least 32 characters`);
  }
  return normalized;
}

const nodeEnv = process.env.NODE_ENV || 'development';
const seedSuperAdmin = process.env.SEED_SUPER_ADMIN === 'true';
const superAdminEmail = process.env.SUPER_ADMIN_EMAIL || '';
const superAdminPassword = process.env.SUPER_ADMIN_PASSWORD || '';

if (seedSuperAdmin) {
  if (!superAdminEmail.trim()) {
    throw new Error('SUPER_ADMIN_EMAIL is required when SEED_SUPER_ADMIN=true');
  }
  if (!superAdminPassword.trim()) {
    throw new Error('SUPER_ADMIN_PASSWORD is required when SEED_SUPER_ADMIN=true');
  }
  if (superAdminPassword === 'Admin123!') {
    throw new Error('SUPER_ADMIN_PASSWORD must not use the default value');
  }
}

export const env = {
  nodeEnv,
  port: Number(process.env.PORT || 5000),
  mongoUri: process.env.MONGO_URI || 'mongodb://127.0.0.1:27017/ams',
  jwtSecret: assertSecret('JWT_SECRET', process.env.JWT_SECRET),
  jwtExpiresIn: process.env.JWT_EXPIRES_IN || '7d',
  corsOrigin: process.env.CORS_ORIGIN || 'http://localhost:5173',
  seedSuperAdmin,
  superAdminEmail,
  superAdminPassword,
};
