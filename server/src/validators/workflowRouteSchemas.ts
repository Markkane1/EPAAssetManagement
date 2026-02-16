import { z } from 'zod';

const OBJECT_ID_REGEX = /^[a-f\d]{24}$/i;
const emptyStringToUndefined = (value: unknown) =>
  typeof value === 'string' && value.trim() === '' ? undefined : value;

const optionalObjectId = z.preprocess(
  emptyStringToUndefined,
  z.string().trim().regex(OBJECT_ID_REGEX, 'Invalid id').optional()
);

const optionalTrimmedString = z.preprocess(emptyStringToUndefined, z.string().trim().optional());

const optionalPositiveInt = z.preprocess(
  emptyStringToUndefined,
  z.coerce.number().int().positive().optional()
);

export const idParamSchema = z.object({
  id: z.string().trim().regex(OBJECT_ID_REGEX, 'Invalid id'),
});

export const requisitionLineParamSchema = z.object({
  id: z.string().trim().regex(OBJECT_ID_REGEX, 'Invalid requisition id'),
  lineId: z.string().trim().regex(OBJECT_ID_REGEX, 'Invalid requisition line id'),
});

export const employeeIdParamSchema = z.object({
  employeeId: z.string().trim().regex(OBJECT_ID_REGEX, 'Invalid employee id'),
});

export const assetItemIdParamSchema = z.object({
  assetItemId: z.string().trim().regex(OBJECT_ID_REGEX, 'Invalid asset item id'),
});

export const officeIdParamSchema = z.object({
  officeId: z.string().trim().regex(OBJECT_ID_REGEX, 'Invalid office id'),
});

export const assignmentListQuerySchema = z
  .object({
    page: optionalPositiveInt,
    limit: optionalPositiveInt,
  })
  .passthrough();

export const transferListQuerySchema = assignmentListQuerySchema;

export const requisitionListQuerySchema = z
  .object({
    page: optionalPositiveInt,
    limit: optionalPositiveInt,
    officeId: optionalObjectId,
    status: optionalTrimmedString,
    fileNumber: optionalTrimmedString,
    from: optionalTrimmedString,
    to: optionalTrimmedString,
  })
  .passthrough();

export const returnRequestListQuerySchema = z
  .object({
    page: optionalPositiveInt,
    limit: optionalPositiveInt,
    officeId: optionalObjectId,
    employeeId: optionalObjectId,
    status: optionalTrimmedString,
    from: optionalTrimmedString,
    to: optionalTrimmedString,
  })
  .passthrough();
