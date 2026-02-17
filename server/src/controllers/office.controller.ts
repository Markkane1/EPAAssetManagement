import { Request, Response, NextFunction } from 'express';
import { OfficeModel } from '../models/office.model';
import { mapFields } from '../utils/mapFields';
import type { AuthRequest } from '../middleware/auth';
import { escapeRegex, readPagination } from '../utils/requestParsing';

const fieldMap = {
  name: 'name',
  division: 'division',
  district: 'district',
  address: 'address',
  contactNumber: 'contact_number',
  type: 'type',
  parentOfficeId: 'parent_office_id',
  isActive: 'is_active',
};

const PAKISTAN_PHONE_REGEX = /^(?:\+92|0)(?:3\d{9}|[1-9]\d{1,2}\d{6,8})$/;
const OBJECT_ID_REGEX = /^[a-f\d]{24}$/i;
const OFFICE_TYPES = new Set(['HEAD_OFFICE', 'DIRECTORATE', 'DISTRICT_OFFICE', 'DISTRICT_LAB']);
const SINGLE_OFFICE_PER_DISTRICT_TYPES = new Set(['DISTRICT_OFFICE', 'DISTRICT_LAB']);

function asRecord(value: unknown): Record<string, unknown> | null {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return null;
  return value as Record<string, unknown>;
}

function readParamId(req: Request, key: string) {
  const raw = req.params?.[key];
  if (Array.isArray(raw)) return String(raw[0] || '').trim();
  return String(raw || '').trim();
}

const buildPayload = (body: Record<string, unknown>) => {
  const payload = mapFields(body, fieldMap);
  Object.values(fieldMap).forEach((dbKey) => {
    if (body[dbKey] !== undefined) {
      payload[dbKey] = body[dbKey];
    }
  });
  if (payload.parent_office_id === '') {
    payload.parent_office_id = null;
  }

  if (body.capabilities !== undefined) {
    payload.capabilities = body.capabilities;
  }
  return payload;
};

function asTrimmedString(value: unknown) {
  return String(value ?? '').trim();
}

function normalizePhone(value: unknown) {
  return asTrimmedString(value).replace(/[\s-]/g, '');
}

function toIdString(value: unknown) {
  if (value === null || value === undefined) return '';
  if (typeof value === 'string') return value.trim();
  if (typeof value === 'object' && value !== null) {
    const asRecordValue = value as { toHexString?: () => string; toString?: () => string };
    if (typeof asRecordValue.toHexString === 'function') {
      return asRecordValue.toHexString();
    }
    if (typeof asRecordValue.toString === 'function') {
      return asRecordValue.toString();
    }
  }
  return String(value).trim();
}

function asBoolean(value: unknown, fallback: boolean) {
  if (value === undefined || value === null) return fallback;
  if (typeof value === 'boolean') return value;
  const normalized = String(value).trim().toLowerCase();
  if (normalized === 'true') return true;
  if (normalized === 'false') return false;
  return fallback;
}

async function validateSingleActiveHeadOffice(isActive: boolean, excludeOfficeId?: string) {
  if (!isActive) return null;
  const filter: Record<string, unknown> = {
    type: 'HEAD_OFFICE',
    is_active: { $ne: false },
  };
  if (excludeOfficeId) {
    filter._id = { $ne: excludeOfficeId };
  }
  const existing = await OfficeModel.exists(filter);
  if (existing) {
    return 'Only one active Head Office is allowed';
  }
  return null;
}

async function validateHierarchy(type: string, parentOfficeId: string) {
  if (type === 'HEAD_OFFICE') {
    if (parentOfficeId) {
      return 'Head Office cannot have a parent office';
    }
    return null;
  }

  if (type === 'DIRECTORATE') {
    if (!parentOfficeId) {
      return 'Directorate must be linked to Head Office';
    }
    if (!OBJECT_ID_REGEX.test(parentOfficeId)) {
      return 'Head Office reference is invalid';
    }
    const parent = await OfficeModel.findOne(
      { _id: parentOfficeId, type: 'HEAD_OFFICE', is_active: { $ne: false } },
      { _id: 1 }
    ).lean();
    if (!parent) {
      return 'Directorate parent must be an active Head Office';
    }
    return null;
  }

  if (parentOfficeId) {
    return 'Only Directorates can have a parent office';
  }
  return null;
}

async function validateDistrictTypeUniqueness(type: string, district: string, excludeOfficeId?: string) {
  if (!SINGLE_OFFICE_PER_DISTRICT_TYPES.has(type)) return null;
  const filter: Record<string, unknown> = {
    type,
    district: new RegExp(`^${escapeRegex(district)}$`, 'i'),
  };
  if (excludeOfficeId) {
    filter._id = { $ne: excludeOfficeId };
  }
  const existing = await OfficeModel.exists(filter);
  if (!existing) return null;
  if (type === 'DISTRICT_OFFICE') {
    return `Only one District Office is allowed in district "${district}"`;
  }
  return `Only one District Lab is allowed in district "${district}"`;
}

function validateCreatePayload(payload: Record<string, unknown>) {
  const name = asTrimmedString(payload.name);
  const division = asTrimmedString(payload.division);
  const district = asTrimmedString(payload.district);
  const address = asTrimmedString(payload.address);
  const contactNumber = normalizePhone(payload.contact_number);
  const type = asTrimmedString(payload.type);

  if (!name) return 'Office name is required';
  if (!division) return 'Division is required';
  if (!district) return 'District is required';
  if (!address) return 'Address is required';
  if (!contactNumber) return 'Contact number is required';
  if (!PAKISTAN_PHONE_REGEX.test(contactNumber)) {
    return 'Contact number must be in Pakistani format';
  }
  if (!type || !OFFICE_TYPES.has(type)) {
    return 'Office type is required';
  }

  payload.name = name;
  payload.division = division;
  payload.district = district;
  payload.address = address;
  payload.contact_number = contactNumber;
  payload.type = type;
  return null;
}

function validateUpdatePayload(payload: Record<string, unknown>) {
  if (payload.name !== undefined) {
    const name = asTrimmedString(payload.name);
    if (!name) return 'Office name is required';
    payload.name = name;
  }
  if (payload.division !== undefined) {
    const division = asTrimmedString(payload.division);
    if (!division) return 'Division is required';
    payload.division = division;
  }
  if (payload.district !== undefined) {
    const district = asTrimmedString(payload.district);
    if (!district) return 'District is required';
    payload.district = district;
  }
  if (payload.address !== undefined) {
    const address = asTrimmedString(payload.address);
    if (!address) return 'Address is required';
    payload.address = address;
  }
  if (payload.contact_number !== undefined) {
    const contactNumber = normalizePhone(payload.contact_number);
    if (!contactNumber) return 'Contact number is required';
    if (!PAKISTAN_PHONE_REGEX.test(contactNumber)) {
      return 'Contact number must be in Pakistani format';
    }
    payload.contact_number = contactNumber;
  }
  if (payload.type !== undefined) {
    const type = asTrimmedString(payload.type);
    if (!OFFICE_TYPES.has(type)) return 'Office type is required';
    payload.type = type;
  }
  return null;
}

export const officeController = {
  list: async (req: Request, res: Response, next: NextFunction) => {
    try {
      const query = req.query as Record<string, unknown>;
      const { limit, skip } = readPagination(query, { defaultLimit: 200, maxLimit: 2000 });
      const andFilters: Record<string, unknown>[] = [];
      const search = String(query.search || '').trim();
      if (search) {
        const regex = new RegExp(escapeRegex(search), 'i');
        andFilters.push({ $or: [{ name: regex }, { code: regex }, { division: regex }, { district: regex }] });
      }
      if (query.type) {
        andFilters.push({ type: String(query.type).trim() });
      }
      if (query.isActive !== undefined) {
        const normalized = String(query.isActive).trim().toLowerCase();
        if (normalized === 'true') andFilters.push({ is_active: true });
        if (normalized === 'false') andFilters.push({ is_active: false });
      }
      const capability = String(query.capability || '').trim().toLowerCase();
      if (capability === 'chemicals') {
        andFilters.push({
          $or: [
            { 'capabilities.chemicals': true },
            {
              'capabilities.chemicals': { $exists: false },
              type: 'DISTRICT_LAB',
            },
          ],
        });
      }
      if (capability === 'consumables') {
        andFilters.push({
          $or: [
            { 'capabilities.consumables': true },
            { 'capabilities.consumables': { $exists: false } },
          ],
        });
      }
      const filter =
        andFilters.length === 0
          ? {}
          : andFilters.length === 1
            ? andFilters[0]
            : { $and: andFilters };

      const data = await OfficeModel.find(
        filter,
        {
          name: 1,
          code: 1,
          division: 1,
          district: 1,
          address: 1,
          contact_number: 1,
          type: 1,
          parent_office_id: 1,
          is_active: 1,
          capabilities: 1,
          created_at: 1,
        }
      )
        .sort({ created_at: -1 })
        .skip(skip)
        .limit(limit)
        .lean();
      res.json(data);
    } catch (error) {
      next(error);
    }
  },
  getById: async (req: Request, res: Response, next: NextFunction) => {
    try {
      const data = await OfficeModel.findById(readParamId(req, 'id')).lean();
      if (!data) return res.status(404).json({ message: 'Not found' });
      return res.json(data);
    } catch (error) {
      next(error);
    }
  },
  create: async (req: AuthRequest, res: Response, next: NextFunction) => {
    try {
      const payload = buildPayload(req.body);
      const validationError = validateCreatePayload(payload);
      if (validationError) {
        return res.status(400).json({ message: validationError });
      }
      const type = String(payload.type || '');
      const parentOfficeId = asTrimmedString(payload.parent_office_id);
      const hierarchyError = await validateHierarchy(type, parentOfficeId);
      if (hierarchyError) {
        return res.status(400).json({ message: hierarchyError });
      }
      const isActive = asBoolean(payload.is_active, true);
      const headOfficeUniquenessError = type === 'HEAD_OFFICE'
        ? await validateSingleActiveHeadOffice(isActive)
        : null;
      if (headOfficeUniquenessError) {
        return res.status(409).json({ message: headOfficeUniquenessError });
      }
      payload.parent_office_id = type === 'DIRECTORATE' ? parentOfficeId : null;
      const districtUniquenessError = await validateDistrictTypeUniqueness(type, String(payload.district || ''));
      if (districtUniquenessError) {
        return res.status(409).json({ message: districtUniquenessError });
      }
      const payloadCapabilities = asRecord(payload.capabilities);
      if (type === 'DISTRICT_LAB') {
        payload.capabilities = { ...(payloadCapabilities || {}), chemicals: true };
      } else if (payloadCapabilities) {
        payload.capabilities = { ...payloadCapabilities, chemicals: false };
      }
      const data = await OfficeModel.create(payload);
      return res.status(201).json(data.toJSON());
    } catch (error) {
      next(error);
    }
  },
  update: async (req: AuthRequest, res: Response, next: NextFunction) => {
    try {
      const officeId = readParamId(req, 'id');
      const payload = buildPayload(req.body);
      const validationError = validateUpdatePayload(payload);
      if (validationError) {
        return res.status(400).json({ message: validationError });
      }
      const existing = await OfficeModel.findById(officeId);
      if (!existing) return res.status(404).json({ message: 'Not found' });

      const effectiveType = asTrimmedString(payload.type ?? existing.type);
      const effectiveParentOfficeId = payload.parent_office_id !== undefined
        ? asTrimmedString(payload.parent_office_id)
        : toIdString(existing.parent_office_id);
      const hierarchyError = await validateHierarchy(effectiveType, effectiveParentOfficeId);
      if (hierarchyError) {
        return res.status(400).json({ message: hierarchyError });
      }
      const effectiveIsActive = asBoolean(payload.is_active, existing.is_active !== false);
      const headOfficeUniquenessError = effectiveType === 'HEAD_OFFICE'
        ? await validateSingleActiveHeadOffice(effectiveIsActive, officeId)
        : null;
      if (headOfficeUniquenessError) {
        return res.status(409).json({ message: headOfficeUniquenessError });
      }
      payload.parent_office_id = effectiveType === 'DIRECTORATE' ? effectiveParentOfficeId : null;
      const effectiveDistrict = asTrimmedString(payload.district ?? existing.district);
      const districtUniquenessError = await validateDistrictTypeUniqueness(
        effectiveType,
        effectiveDistrict,
        officeId
      );
      if (districtUniquenessError) {
        return res.status(409).json({ message: districtUniquenessError });
      }

      const payloadCapabilities = asRecord(payload.capabilities);
      const existingCapabilities = asRecord(existing.capabilities);
      if (effectiveType === 'DISTRICT_LAB') {
        payload.capabilities = {
          ...(existingCapabilities || {}),
          ...(payloadCapabilities || {}),
          chemicals: true,
        };
      } else if (payload.type !== undefined || payload.capabilities !== undefined) {
        payload.capabilities = {
          ...(existingCapabilities || {}),
          ...(payloadCapabilities || {}),
          chemicals: false,
        };
      }

      const data = await OfficeModel.findByIdAndUpdate(officeId, payload, { new: true });
      if (!data) return res.status(404).json({ message: 'Not found' });
      return res.json(data.toJSON());
    } catch (error) {
      next(error);
    }
  },
  remove: async (req: Request, res: Response, next: NextFunction) => {
    try {
      const data = await OfficeModel.findByIdAndDelete(readParamId(req, 'id'));
      if (!data) return res.status(404).json({ message: 'Not found' });
      return res.status(204).send();
    } catch (error) {
      next(error);
    }
  },
};

