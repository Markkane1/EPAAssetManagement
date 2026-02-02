import { Request, Response, NextFunction } from 'express';
import bcrypt from 'bcryptjs';
import crypto from 'crypto';
import { createCrudController } from './crudController';
import { employeeRepository } from '../repositories/employee.repository';
import { UserModel } from '../models/user.model';
import { mapFields } from '../utils/mapFields';

const fieldMap = {
  firstName: 'first_name',
  lastName: 'last_name',
  jobTitle: 'job_title',
  hireDate: 'hire_date',
  directorateId: 'directorate_id',
  locationId: 'location_id',
  isActive: 'is_active',
};

const baseController = createCrudController({
  repository: employeeRepository,
  createMap: fieldMap,
  updateMap: {
    firstName: 'first_name',
    lastName: 'last_name',
    jobTitle: 'job_title',
    hireDate: 'hire_date',
    directorateId: 'directorate_id',
    locationId: 'location_id',
    isActive: 'is_active',
  },
});

const normalizeRole = (role?: string | null) => {
  if (role === 'manager') return 'admin';
  if (role === 'location_admin') return 'location_admin';
  return role || 'user';
};

const generateTempPassword = () => `Temp-${crypto.randomBytes(6).toString('hex')}`;

function buildPayload(body: Record<string, unknown>) {
  const payload = mapFields(body, fieldMap);
  Object.values(fieldMap).forEach((dbKey) => {
    if (body[dbKey] !== undefined) {
      payload[dbKey] = body[dbKey];
    }
  });
  if (body.email !== undefined) payload.email = body.email;
  return payload;
}

export const employeeController = {
  ...baseController,
  create: async (req: Request, res: Response, next: NextFunction) => {
    try {
      const payload = buildPayload(req.body);
      const email = String(payload.email || '').trim().toLowerCase();
      if (!email) {
        return res.status(400).json({ message: 'Email is required' });
      }

      const firstName = payload.first_name ? String(payload.first_name) : null;
      const lastName = payload.last_name ? String(payload.last_name) : null;
      const locationId = payload.location_id ? String(payload.location_id) : null;
      const providedPassword =
        typeof req.body.userPassword === 'string' && req.body.userPassword.trim()
          ? req.body.userPassword.trim()
          : null;

      let user = await UserModel.findOne({ email });
      let tempPassword: string | undefined;

      if (user) {
        const normalizedRole = normalizeRole(user.role);
        if (normalizedRole === 'super_admin') {
          return res.status(400).json({ message: 'Cannot link employee to super admin account' });
        }
        if (normalizedRole === 'user' || normalizedRole === 'viewer' || normalizedRole === 'employee') {
          user.role = 'employee';
        }
        if (!user.location_id || user.role === 'employee') {
          user.location_id = locationId;
        }
        if (!user.first_name && firstName) user.first_name = firstName;
        if (!user.last_name && lastName) user.last_name = lastName;
        await user.save();
      } else {
        const password = providedPassword || generateTempPassword();
        const passwordHash = await bcrypt.hash(password, 10);
        user = await UserModel.create({
          email,
          password_hash: passwordHash,
          first_name: firstName,
          last_name: lastName,
          role: 'employee',
          location_id: locationId,
        });
        if (!providedPassword) {
          tempPassword = password;
        }
      }

      payload.email = email;
      payload.user_id = user.id;

      const employee = await employeeRepository.create(payload);
      return res.status(201).json({
        ...employee.toObject(),
        tempPassword,
      });
    } catch (error) {
      next(error);
    }
  },
  getByDirectorate: async (req: Request, res: Response, next: NextFunction) => {
    try {
      const employees = await employeeRepository.findAll();
      const filtered = employees.filter((employee: any) =>
        employee.directorate_id?.toString() === req.params.directorateId
      );
      res.json(filtered);
    } catch (error) {
      next(error);
    }
  },
};
