import bcrypt from 'bcryptjs';
import { UserModel } from '../models/user.model';

type AdminSeedConfig = {
  email: string;
  password: string;
  firstName?: string;
  lastName?: string;
};

export async function ensureSuperAdmin(config: AdminSeedConfig) {
  const existing = await UserModel.findOne({ email: config.email.toLowerCase() });
  if (existing) {
    const needsRoleUpdate =
      existing.role !== 'org_admin'
      || !Array.isArray(existing.roles)
      || !existing.roles.includes('org_admin')
      || existing.active_role !== 'org_admin';
    if (needsRoleUpdate) {
      existing.role = 'org_admin';
      existing.roles = ['org_admin'];
      existing.active_role = 'org_admin';
      await existing.save();
    }
    return;
  }

  const passwordHash = await bcrypt.hash(config.password, 10);
  await UserModel.create({
    email: config.email,
    password_hash: passwordHash,
    first_name: config.firstName || 'Super',
    last_name: config.lastName || 'Admin',
    role: 'org_admin',
    roles: ['org_admin'],
    active_role: 'org_admin',
  });
}
