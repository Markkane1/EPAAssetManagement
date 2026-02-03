import { CounterModel } from '../../../models/counter.model';
import { OfficeModel } from '../../../models/office.model';
import type { ClientSession } from 'mongoose';

const TYPE_PREFIX: Record<string, string> = {
  ISSUE: 'ISS',
  RETURN: 'RET',
  TRANSFER: 'TRF',
  MAINTENANCE: 'MNT',
  DISPOSAL: 'DSP',
  INCIDENT: 'INC',
};

function deriveOfficeCode(name?: string | null) {
  if (!name) return 'OFF';
  const cleaned = name.replace(/[^A-Za-z0-9 ]/g, ' ').trim();
  const parts = cleaned.split(/\s+/).filter(Boolean);
  if (parts.length === 0) return 'OFF';
  if (parts.length === 1) return parts[0].slice(0, 3).toUpperCase();
  const initials = parts.map((part) => part[0]).join('');
  return initials.slice(0, 4).toUpperCase();
}

export async function getOfficeCode(officeId: string, session?: ClientSession) {
  const office = await OfficeModel.findById(officeId).session(session || null);
  if (!office) return 'OFF';
  const codeValue = (office as any).code;
  const explicit = typeof codeValue === 'string' ? codeValue.trim().toUpperCase() : '';
  return explicit || deriveOfficeCode(office.name);
}

export async function generateReference(recordType: string, officeId: string, session?: ClientSession) {
  const prefix = TYPE_PREFIX[recordType] || 'REC';
  const officeCode = await getOfficeCode(officeId, session);
  const year = new Date().getFullYear();
  const key = `${officeCode}:${recordType}:${year}`;

  const counter = await CounterModel.findOneAndUpdate(
    { key },
    { $inc: { seq: 1 } },
    { new: true, upsert: true, setDefaultsOnInsert: true, session }
  );

  const seq = String(counter.seq).padStart(6, '0');
  return `${prefix}-${officeCode}-${year}-${seq}`;
}
