import { Request, Response, NextFunction } from 'express';
import bcrypt from 'bcryptjs';
import crypto from 'crypto';
import { createCrudController } from './crudController';
import { employeeRepository } from '../repositories/employee.repository';
import { UserModel } from '../models/user.model';
import { mapFields } from '../utils/mapFields';
import { EmployeeModel } from '../models/employee.model';
import { OfficeModel } from '../models/office.model';
import { OfficeSubLocationModel } from '../models/officeSubLocation.model';
import { AuthRequest } from '../middleware/auth';
import { hasRoleCapability, normalizeRoles, resolveActiveRole } from '../utils/roles';
import { getRequestContext } from '../utils/scope';
import { logAudit } from '../modules/records/services/audit.service';
import { createBulkNotifications, resolveNotificationRecipientsByOffice } from '../services/notification.service';

const fieldMap = {
  firstName: 'first_name',
  lastName: 'last_name',
  jobTitle: 'job_title',
  hireDate: 'hire_date',
  directorateId: 'directorate_id',
  locationId: 'location_id',
  defaultSubLocationId: 'default_sub_location_id',
  allowedSubLocationIds: 'allowed_sub_location_ids',
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
    defaultSubLocationId: 'default_sub_location_id',
    allowedSubLocationIds: 'allowed_sub_location_ids',
    isActive: 'is_active',
  },
});

const generateTempPassword = () => `Temp-${crypto.randomBytes(6).toString('hex')}`;

function clampInt(value: unknown, fallback: number, min: number, max: number) {
  const parsed = Number.parseInt(String(value ?? ''), 10);
  if (Number.isNaN(parsed)) return fallback;
  return Math.min(max, Math.max(min, parsed));
}

function readPagination(query: Record<string, unknown>) {
  const limit = clampInt(query.limit, 1000, 1, 2000);
  const page = clampInt(query.page, 1, 1, 100000);
  const skip = (page - 1) * limit;
  return { limit, skip };
}

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

function normalizeObjectIdValue(value: unknown) {
  if (value === null || value === undefined || value === '') return null;
  const id = String(value).trim();
  if (!id) return null;
  if (!/^[0-9a-fA-F]{24}$/.test(id)) {
    throw new Error('Invalid ObjectId');
  }
  return id;
}

function normalizeSubLocationIdList(value: unknown): string[] {
  if (value === null || value === undefined || value === '') return [];
  if (!Array.isArray(value)) {
    throw new Error('allowedSubLocationIds must be an array');
  }
  const unique = new Set<string>();
  for (const entry of value) {
    const normalized = normalizeObjectIdValue(entry);
    if (normalized) unique.add(normalized);
  }
  return Array.from(unique);
}

async function resolveValidatedSectionScope(params: {
  locationId: string | null;
  defaultSubLocationId: unknown;
  allowedSubLocationIds: unknown;
}) {
  const { locationId } = params;
  const defaultSubLocationId = normalizeObjectIdValue(params.defaultSubLocationId);
  const allowedSubLocationIds = normalizeSubLocationIdList(params.allowedSubLocationIds);

  if (!locationId) {
    if (defaultSubLocationId || allowedSubLocationIds.length > 0) {
      throw new Error('locationId is required when assigning room/section scope');
    }
    return {
      defaultSubLocationId: null as string | null,
      allowedSubLocationIds: [] as string[],
    };
  }

  const mergedAllowed = new Set<string>(allowedSubLocationIds);
  if (defaultSubLocationId) mergedAllowed.add(defaultSubLocationId);
  const mergedIds = Array.from(mergedAllowed);

  if (mergedIds.length === 0) {
    return {
      defaultSubLocationId: null,
      allowedSubLocationIds: [],
    };
  }

  const matchedRows = await OfficeSubLocationModel.find(
    { _id: { $in: mergedIds }, office_id: locationId, is_active: { $ne: false } },
    { _id: 1 }
  )
    .lean();
  const matchedIdSet = new Set(matchedRows.map((row: any) => String(row._id)));
  if (matchedIdSet.size !== mergedIds.length) {
    throw new Error('Selected room/section is not valid for this office');
  }

  return {
    defaultSubLocationId,
    allowedSubLocationIds: mergedIds,
  };
}

function readParam(req: Request, key: string) {
  const raw = req.params?.[key];
  if (Array.isArray(raw)) return String(raw[0] || '').trim();
  return String(raw || '').trim();
}

export const employeeController = {
  ...baseController,
  list: async (req: AuthRequest, res: Response, next: NextFunction) => {
    try {
      const user = req.user;
      if (!user) {
        return res.status(401).json({ message: 'Unauthorized' });
      }
      const { limit, skip } = readPagination(req.query as Record<string, unknown>);
      const isGlobal = user.role === 'org_admin' || user.isOrgAdmin;
      const locationId = user.locationId ? String(user.locationId) : null;

      if (!isGlobal && !locationId) {
        return res.status(403).json({ message: 'User is not assigned to an office' });
      }

      const query = isGlobal ? {} : { location_id: locationId };
      const employees = await EmployeeModel.find(query)
        .sort({ created_at: -1 })
        .skip(skip)
        .limit(limit)
        .lean();
      return res.json(employees);
    } catch (error) {
      next(error);
    }
  },
  getById: async (req: AuthRequest, res: Response, next: NextFunction) => {
    try {
      const user = req.user;
      if (!user) {
        return res.status(401).json({ message: 'Unauthorized' });
      }
      const employee = await EmployeeModel.findById(readParam(req, 'id')).lean();
      if (!employee) return res.status(404).json({ message: 'Not found' });

      const isGlobal = user.role === 'org_admin' || user.isOrgAdmin;
      if (!isGlobal) {
        if (!user.locationId) {
          return res.status(403).json({ message: 'User is not assigned to an office' });
        }
        if (String((employee as { location_id?: unknown }).location_id || '') !== String(user.locationId)) {
          return res.status(403).json({ message: 'Access restricted to assigned office' });
        }
      }
      return res.json(employee);
    } catch (error) {
      next(error);
    }
  },
  create: async (req: Request, res: Response, next: NextFunction) => {
    try {
      const authReq = req as AuthRequest;
      const authUser = authReq.user;
      if (!authUser) {
        return res.status(401).json({ message: 'Unauthorized' });
      }
      const canManage = authUser.role === 'org_admin' || authUser.role === 'office_head';
      if (!canManage) {
        return res.status(403).json({ message: 'Access denied' });
      }
      const payload = buildPayload(req.body);
      const email = String(payload.email || '').trim().toLowerCase();
      if (!email) {
        return res.status(400).json({ message: 'Email is required' });
      }

      const firstName = payload.first_name ? String(payload.first_name) : null;
      const lastName = payload.last_name ? String(payload.last_name) : null;
      const isGlobal = authUser.role === 'org_admin' || authUser.isOrgAdmin;
      const locationId = payload.location_id ? String(payload.location_id) : null;
      if (!isGlobal) {
        if (!authUser.locationId) {
          return res.status(403).json({ message: 'User is not assigned to an office' });
        }
        if (locationId && String(locationId) !== String(authUser.locationId)) {
          return res.status(403).json({ message: 'Access restricted to assigned office' });
        }
        payload.location_id = authUser.locationId;
      }
      try {
        const sectionScope = await resolveValidatedSectionScope({
          locationId: payload.location_id ? String(payload.location_id) : null,
          defaultSubLocationId: payload.default_sub_location_id,
          allowedSubLocationIds: payload.allowed_sub_location_ids,
        });
        payload.default_sub_location_id = sectionScope.defaultSubLocationId;
        payload.allowed_sub_location_ids = sectionScope.allowedSubLocationIds;
      } catch (validationError) {
        return res.status(400).json({ message: (validationError as Error).message });
      }

      const providedPassword =
        typeof req.body.userPassword === 'string' && req.body.userPassword.trim()
          ? req.body.userPassword.trim()
          : null;

      let user = await UserModel.findOne({ email });
      let tempPassword: string | undefined;

      if (user) {
        const normalizedRoles = normalizeRoles(user.roles, user.role);
        if (hasRoleCapability(normalizedRoles, ['org_admin'])) {
          return res.status(400).json({ message: 'Cannot link employee to org admin account' });
        }
        const mergedRoles = normalizeRoles([...normalizedRoles, 'employee'], 'employee');
        const activeRole = resolveActiveRole(user.active_role || user.role, mergedRoles);
        user.role = activeRole;
        user.roles = mergedRoles;
        user.active_role = activeRole;
        if (!user.location_id || hasRoleCapability(mergedRoles, ['employee'])) {
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
          roles: ['employee'],
          active_role: 'employee',
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
  update: async (req: AuthRequest, res: Response, next: NextFunction) => {
    try {
      const user = req.user;
      if (!user) {
        return res.status(401).json({ message: 'Unauthorized' });
      }
      const canManage = user.role === 'org_admin' || user.role === 'office_head';
      if (!canManage) {
        return res.status(403).json({ message: 'Access denied' });
      }
      const employeeId = readParam(req, 'id');
      const existing = await EmployeeModel.findById(employeeId);
      if (!existing) return res.status(404).json({ message: 'Not found' });

      const isGlobal = user.role === 'org_admin' || user.isOrgAdmin;
      if (!isGlobal) {
        if (!user.locationId) {
          return res.status(403).json({ message: 'User is not assigned to an office' });
        }
        if (String(existing.location_id || '') !== String(user.locationId)) {
          return res.status(403).json({ message: 'Access restricted to assigned office' });
        }
      }

      const payload = buildPayload(req.body);
      if (!isGlobal) {
        const nextLocationId = payload.location_id ? String(payload.location_id) : null;
        if (nextLocationId && String(nextLocationId) !== String(user.locationId)) {
          return res.status(403).json({ message: 'Access restricted to assigned office' });
        }
        payload.location_id = user.locationId;
      }

      const previousLocationId = existing.location_id ? String(existing.location_id) : null;
      const nextLocationId = payload.location_id ? String(payload.location_id) : previousLocationId;
      const locationChanged = previousLocationId !== nextLocationId;

      if (locationChanged && payload.default_sub_location_id === undefined) {
        payload.default_sub_location_id = null;
      }
      if (locationChanged && payload.allowed_sub_location_ids === undefined) {
        payload.allowed_sub_location_ids = [];
      }

      try {
        const sectionScope = await resolveValidatedSectionScope({
          locationId: nextLocationId,
          defaultSubLocationId:
            payload.default_sub_location_id !== undefined
              ? payload.default_sub_location_id
              : existing.default_sub_location_id,
          allowedSubLocationIds:
            payload.allowed_sub_location_ids !== undefined
              ? payload.allowed_sub_location_ids
              : existing.allowed_sub_location_ids,
        });
        payload.default_sub_location_id = sectionScope.defaultSubLocationId;
        payload.allowed_sub_location_ids = sectionScope.allowedSubLocationIds;
      } catch (validationError) {
        return res.status(400).json({ message: (validationError as Error).message });
      }

      const updated = await employeeRepository.updateById(employeeId, payload);
      if (!updated) return res.status(404).json({ message: 'Not found' });
      if (payload.location_id && existing.user_id) {
        await UserModel.findByIdAndUpdate(existing.user_id, { location_id: payload.location_id });
      }
      return res.json(updated);
    } catch (error) {
      next(error);
    }
  },
  remove: async (req: AuthRequest, res: Response, next: NextFunction) => {
    try {
      const user = req.user;
      if (!user) {
        return res.status(401).json({ message: 'Unauthorized' });
      }
      const canManage = user.role === 'org_admin' || user.role === 'office_head';
      if (!canManage) {
        return res.status(403).json({ message: 'Access denied' });
      }
      const existing = await EmployeeModel.findById(readParam(req, 'id'));
      if (!existing) return res.status(404).json({ message: 'Not found' });

      const isGlobal = user.role === 'org_admin' || user.isOrgAdmin;
      if (!isGlobal) {
        if (!user.locationId) {
          return res.status(403).json({ message: 'User is not assigned to an office' });
        }
        if (String(existing.location_id || '') !== String(user.locationId)) {
          return res.status(403).json({ message: 'Access restricted to assigned office' });
        }
      }

      existing.is_active = false;
      await existing.save();
      return res.status(200).json(existing);
    } catch (error) {
      next(error);
    }
  },
  transfer: async (req: AuthRequest, res: Response, next: NextFunction) => {
    try {
      const user = req.user;
      if (!user) {
        return res.status(401).json({ message: 'Unauthorized' });
      }

      const canTransferAcrossOffices = user.role === 'org_admin' || Boolean(user.isOrgAdmin);
      if (!canTransferAcrossOffices) {
        return res.status(403).json({ message: 'Access denied' });
      }

      const newOfficeId = typeof req.body?.newOfficeId === 'string' ? req.body.newOfficeId.trim() : '';
      const reason =
        typeof req.body?.reason === 'string' && req.body.reason.trim() ? req.body.reason.trim() : null;
      if (!newOfficeId) {
        return res.status(400).json({ message: 'newOfficeId is required' });
      }
      if (!/^[0-9a-fA-F]{24}$/.test(newOfficeId)) {
        return res.status(400).json({ message: 'newOfficeId is invalid' });
      }

      const employee = await EmployeeModel.findById(readParam(req, 'id'));
      if (!employee) {
        return res.status(404).json({ message: 'Not found' });
      }

      const destinationOffice = (await OfficeModel.findById(newOfficeId, { _id: 1, is_active: 1 }).lean()) as
        | { is_active?: boolean }
        | null;
      if (!destinationOffice) {
        return res.status(404).json({ message: 'Office not found' });
      }
      if (destinationOffice.is_active === false) {
        return res.status(400).json({ message: 'Destination office is inactive' });
      }

      const previousOfficeId = employee.location_id ? String(employee.location_id) : null;
      if (previousOfficeId === newOfficeId) {
        return res.status(400).json({ message: 'Employee already belongs to the selected office' });
      }

      employee.location_id = newOfficeId;
      employee.default_sub_location_id = null;
      employee.allowed_sub_location_ids = [];
      employee.transferred_at = new Date();
      employee.transferred_from_office_id = previousOfficeId;
      employee.transferred_to_office_id = newOfficeId;
      employee.transfer_reason = reason;
      await employee.save();

      if (employee.user_id) {
        await UserModel.findByIdAndUpdate(employee.user_id, { location_id: newOfficeId });
      }

      const ctx = await getRequestContext(req);
      await logAudit({
        ctx,
        action: 'EMPLOYEE_TRANSFER',
        entityType: 'Employee',
        entityId: employee.id,
        officeId: newOfficeId,
        diff: {
          transferred_from_office_id: previousOfficeId,
          transferred_to_office_id: newOfficeId,
          transfer_reason: reason,
          transferred_at: employee.transferred_at,
          linked_user_id: employee.user_id ? String(employee.user_id) : null,
        },
      });

      const officeIds = [previousOfficeId, newOfficeId]
        .map((officeId) => String(officeId || '').trim())
        .filter((officeId) => /^[0-9a-fA-F]{24}$/.test(officeId));
      const recipients = await resolveNotificationRecipientsByOffice({
        officeIds,
        includeOrgAdmins: true,
        includeRoles: ['office_head', 'caretaker'],
        includeUserIds: employee.user_id ? [String(employee.user_id)] : [],
        excludeUserIds: [user.userId],
      });
      if (recipients.length > 0) {
        await createBulkNotifications(
          recipients.map((recipientUserId) => ({
            recipientUserId,
            officeId: newOfficeId,
            type: 'EMPLOYEE_TRANSFERRED',
            title: 'Employee Transferred',
            message: `${String(employee.first_name || '')} ${String(employee.last_name || '')}`.trim()
              ? `${String(employee.first_name || '')} ${String(employee.last_name || '')}`.trim() +
                ' was transferred to a new office.'
              : `Employee ${employee.id} was transferred to a new office.`,
            entityType: 'Employee',
            entityId: employee.id,
            dedupeWindowHours: 12,
          }))
        );
      }

      return res.json(employee);
    } catch (error) {
      next(error);
    }
  },
  getByDirectorate: async (req: Request, res: Response, next: NextFunction) => {
    try {
      const authReq = req as AuthRequest;
      const user = authReq.user;
      if (!user) {
        return res.status(401).json({ message: 'Unauthorized' });
      }
      const { limit, skip } = readPagination(req.query as Record<string, unknown>);
      const isGlobal = user.role === 'org_admin' || user.isOrgAdmin;
      const locationId = user.locationId ? String(user.locationId) : null;
      if (!isGlobal && !locationId) {
        return res.status(403).json({ message: 'User is not assigned to an office' });
      }

      const filter: Record<string, unknown> = {
        directorate_id: readParam(req, 'directorateId'),
      };
      if (!isGlobal && locationId) {
        filter.location_id = locationId;
      }
      const employees = await EmployeeModel.find(filter)
        .sort({ created_at: -1 })
        .skip(skip)
        .limit(limit)
        .lean();
      res.json(employees);
    } catch (error) {
      next(error);
    }
  },
};


