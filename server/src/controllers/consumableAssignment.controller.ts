import { Request, Response, NextFunction } from 'express';
import { ConsumableAssignmentModel } from '../models/consumableAssignment.model';
import { ConsumableModel } from '../models/consumable.model';
import { EmployeeModel } from '../models/employee.model';
import { UserModel } from '../models/user.model';
import { mapFields } from '../utils/mapFields';
import type { AuthRequest } from '../middleware/auth';

const fieldMap = {
  consumableId: 'consumable_id',
  assigneeType: 'assignee_type',
  assigneeId: 'assignee_id',
  receivedByEmployeeId: 'received_by_employee_id',
  assignedDate: 'assigned_date',
};

function clampInt(value: unknown, fallback: number, min: number, max: number) {
  const parsed = Number.parseInt(String(value ?? ''), 10);
  if (Number.isNaN(parsed)) return fallback;
  return Math.min(max, Math.max(min, parsed));
}

function buildPayload(body: Record<string, unknown>) {
  const payload = mapFields(body, fieldMap);
  Object.values(fieldMap).forEach((dbKey) => {
    if (body[dbKey] !== undefined) {
      payload[dbKey] = body[dbKey];
    }
  });
  if (body.quantity !== undefined) payload.quantity = body.quantity;
  if (body.inputQuantity !== undefined) payload.input_quantity = body.inputQuantity;
  if (body.inputUnit !== undefined) payload.input_unit = body.inputUnit;
  if (body.notes !== undefined) payload.notes = body.notes;
  return payload;
}

export const consumableAssignmentController = {
  list: async (req: AuthRequest, res: Response, next: NextFunction) => {
    try {
      const { consumableId, assigneeId } = req.query as {
        consumableId?: string;
        assigneeId?: string;
      };
      const limit = clampInt((req.query as Record<string, unknown>).limit, 500, 1, 2000);
      const page = clampInt((req.query as Record<string, unknown>).page, 1, 1, 100000);
      const skip = (page - 1) * limit;
      const filter: Record<string, unknown> = {};
      if (consumableId) filter.consumable_id = consumableId;
      if (assigneeId) filter.assignee_id = assigneeId;

      if (req.user?.role === 'directorate_head') {
        const directorateHead = await EmployeeModel.findOne(
          { email: req.user.email },
          { directorate_id: 1 }
        ).lean();
        const directorateId = (directorateHead as { directorate_id?: unknown } | null)?.directorate_id;
        if (!directorateId) return res.json([]);
        const employeeIds = await EmployeeModel.distinct('_id', { directorate_id: directorateId });
        filter.assignee_type = 'employee';
        filter.assignee_id = { $in: employeeIds };
      } else if (req.user?.role === 'location_admin') {
        const user = await UserModel.findById(req.user.userId, { location_id: 1 }).lean();
        const locationId = (user as { location_id?: unknown } | null)?.location_id;
        if (!locationId) return res.json([]);
        const employeeIds = await EmployeeModel.distinct('_id', { location_id: locationId });
        filter.$or = [
          { assignee_type: 'location', assignee_id: locationId },
          { assignee_type: 'employee', assignee_id: { $in: employeeIds } },
        ];
      }

      const items = await ConsumableAssignmentModel.find(filter)
        .sort({ assigned_date: -1, created_at: -1 })
        .skip(skip)
        .limit(limit)
        .lean();
      res.json(items);
    } catch (error) {
      next(error);
    }
  },
  transferBatch: async (req: AuthRequest, res: Response, next: NextFunction) => {
    try {
      const userId = req.user?.userId;
      if (!userId) return res.status(401).json({ message: 'Unauthorized' });

      const {
        fromLocationId,
        toLocationId,
        assignedDate,
        notes,
        receivedByEmployeeId,
        items,
      } = req.body as {
        fromLocationId?: string;
        toLocationId?: string;
        assignedDate?: string;
        notes?: string;
        receivedByEmployeeId?: string;
        items?: Array<{
          consumableId?: string;
          quantity?: number;
          inputQuantity?: number;
          inputUnit?: string;
        }>;
      };

      if (!fromLocationId || !toLocationId || !assignedDate) {
        return res.status(400).json({ message: 'From location, to location, and date are required' });
      }
      if (fromLocationId === toLocationId) {
        return res.status(400).json({ message: 'Source and destination locations must be different' });
      }
      if (!items || !Array.isArray(items) || items.length === 0) {
        return res.status(400).json({ message: 'At least one consumable item is required' });
      }
      if (!receivedByEmployeeId) {
        return res.status(400).json({ message: 'Received by employee is required for location transfers' });
      }

      if (req.user?.role === 'location_admin') {
        const user = await UserModel.findById(userId);
        if (!user?.location_id) {
          return res.status(403).json({ message: 'Location admin must be linked to a location' });
        }
        if (String(user.location_id) !== String(fromLocationId)) {
          return res.status(403).json({ message: 'Forbidden' });
        }
      }

      const receiver = await EmployeeModel.findById(receivedByEmployeeId);
      if (!receiver) {
        return res.status(404).json({ message: 'Receiving employee not found' });
      }
      if (String(receiver.location_id) !== String(toLocationId)) {
        return res.status(400).json({ message: 'Receiving employee must belong to the destination location' });
      }

      const createdAssignments = [];

      for (const item of items) {
        const consumableId = item.consumableId;
        const quantity = Number(item.quantity);
        if (!consumableId) {
          return res.status(400).json({ message: 'Consumable is required' });
        }
        if (!Number.isFinite(quantity) || quantity <= 0) {
          return res.status(400).json({ message: 'Quantity must be greater than 0' });
        }

        const consumable = await ConsumableModel.findById(consumableId);
        if (!consumable) {
          return res.status(404).json({ message: 'Consumable not found' });
        }

        const employeeIds = await EmployeeModel.find({ location_id: fromLocationId }).distinct('_id');
        const sourceAssignments = await ConsumableAssignmentModel.find({
          consumable_id: consumableId,
          $or: [
            { assignee_type: 'location', assignee_id: fromLocationId },
            { assignee_type: 'employee', assignee_id: { $in: employeeIds } },
          ],
        }).sort({ assigned_date: 1, created_at: 1 });

        const available = sourceAssignments.reduce((sum, assignment) => sum + Number(assignment.quantity || 0), 0);
        if (available < quantity) {
          return res.status(400).json({ message: `Insufficient quantity for ${consumable.name}` });
        }

        let remaining = quantity;
        for (const assignment of sourceAssignments) {
          if (remaining <= 0) break;
          const currentQty = Number(assignment.quantity || 0);
          if (currentQty <= remaining) {
            remaining -= currentQty;
            await ConsumableAssignmentModel.findByIdAndDelete(assignment.id);
          } else {
            const nextQty = currentQty - remaining;
            remaining = 0;
            await ConsumableAssignmentModel.findByIdAndUpdate(assignment.id, { quantity: nextQty });
          }
        }

        const created = await ConsumableAssignmentModel.create({
          consumable_id: consumableId,
          assignee_type: 'location',
          assignee_id: toLocationId,
          received_by_employee_id: receivedByEmployeeId,
          quantity,
          input_quantity: item.inputQuantity ?? quantity,
          input_unit: item.inputUnit ?? consumable.unit,
          assigned_date: assignedDate,
          notes: notes ?? null,
        });
        createdAssignments.push(created);
      }

      res.status(201).json(createdAssignments);
    } catch (error) {
      next(error);
    }
  },
  create: async (req: AuthRequest, res: Response, next: NextFunction) => {
    try {
      if (req.user?.role === 'location_admin') {
        return res.status(403).json({ message: 'Forbidden' });
      }
      const payload = buildPayload(req.body);
      const quantity = Number(payload.quantity);
      if (!payload.consumable_id || !payload.assignee_type || !payload.assignee_id || !payload.assigned_date) {
        return res.status(400).json({ message: 'Missing required fields' });
      }
      if (payload.assignee_type === 'location' && !payload.received_by_employee_id) {
        return res.status(400).json({ message: 'Received by employee is required for location assignments' });
      }
      if (!Number.isFinite(quantity) || quantity <= 0) {
        return res.status(400).json({ message: 'Quantity must be greater than 0' });
      }

      const consumable = await ConsumableModel.findById(payload.consumable_id);
      if (!consumable) return res.status(404).json({ message: 'Consumable not found' });

      if (req.user?.role === 'directorate_head') {
        const user = await UserModel.findById(req.user.userId);
        if (!user) return res.status(401).json({ message: 'Unauthorized' });
        const directorateHead = await EmployeeModel.findOne({ email: req.user.email });
        if (!directorateHead?.directorate_id) {
          return res.status(403).json({ message: 'Directorate head must be linked to a directorate' });
        }
        if (payload.assignee_type !== 'employee') {
          return res.status(403).json({ message: 'Directorate head can assign to employees only' });
        }
        const employee = await EmployeeModel.findById(payload.assignee_id);
        if (!employee || String(employee.directorate_id) !== String(directorateHead.directorate_id)) {
          return res.status(403).json({ message: 'Employee is not in your directorate' });
        }
      }

      if (payload.assignee_type === 'location' && payload.received_by_employee_id) {
        const receiver = await EmployeeModel.findById(payload.received_by_employee_id);
        if (!receiver) {
          return res.status(404).json({ message: 'Receiving employee not found' });
        }
        if (String(receiver.location_id) !== String(payload.assignee_id)) {
          return res.status(400).json({ message: 'Receiving employee must belong to the selected location' });
        }
      }

      if (payload.assignee_type === 'employee') {
        payload.received_by_employee_id = null;
      }

      if (consumable.available_quantity < quantity) {
        return res.status(400).json({ message: 'Insufficient available quantity' });
      }

      const assignment = await ConsumableAssignmentModel.create({
        ...payload,
        quantity,
        input_quantity: payload.input_quantity ?? quantity,
        input_unit: payload.input_unit ?? consumable.unit,
      });

      consumable.available_quantity = Number(consumable.available_quantity) - quantity;
      await consumable.save();

      res.status(201).json(assignment);
    } catch (error) {
      next(error);
    }
  },
  remove: async (req: Request, res: Response, next: NextFunction) => {
    try {
      if ((req as AuthRequest).user?.role === 'location_admin') {
        return res.status(403).json({ message: 'Forbidden' });
      }
      const assignment = await ConsumableAssignmentModel.findByIdAndDelete(req.params.id);
      if (!assignment) return res.status(404).json({ message: 'Not found' });

      const consumable = await ConsumableModel.findById(assignment.consumable_id);
      if (consumable) {
        const nextAvailable = Number(consumable.available_quantity) + Number(assignment.quantity);
        consumable.available_quantity = Math.min(nextAvailable, Number(consumable.total_quantity));
        await consumable.save();
      }

      return res.status(204).send();
    } catch (error) {
      next(error);
    }
  },
};
