import { Request, Response, NextFunction } from 'express';
import { AssignmentModel } from '../models/assignment.model';
import { AssetItemModel } from '../models/assetItem.model';
import { mapFields } from '../utils/mapFields';

const fieldMap = {
  assetItemId: 'asset_item_id',
  employeeId: 'employee_id',
  assignedDate: 'assigned_date',
  expectedReturnDate: 'expected_return_date',
  returnedDate: 'returned_date',
  isActive: 'is_active',
};

function buildPayload(body: Record<string, unknown>) {
  const payload = mapFields(body, fieldMap);
  Object.values(fieldMap).forEach((dbKey) => {
    if (body[dbKey] !== undefined) {
      payload[dbKey] = body[dbKey];
    }
  });
  if (body.notes !== undefined) payload.notes = body.notes;
  return payload;
}

export const assignmentController = {
  list: async (_req: Request, res: Response, next: NextFunction) => {
    try {
      const assignments = await AssignmentModel.find().sort({ assigned_date: -1 });
      res.json(assignments);
    } catch (error) {
      next(error);
    }
  },
  getById: async (req: Request, res: Response, next: NextFunction) => {
    try {
      const assignment = await AssignmentModel.findById(req.params.id);
      if (!assignment) return res.status(404).json({ message: 'Not found' });
      return res.json(assignment);
    } catch (error) {
      next(error);
    }
  },
  getByEmployee: async (req: Request, res: Response, next: NextFunction) => {
    try {
      const assignments = await AssignmentModel.find({ employee_id: req.params.employeeId }).sort({ assigned_date: -1 });
      res.json(assignments);
    } catch (error) {
      next(error);
    }
  },
  getByAssetItem: async (req: Request, res: Response, next: NextFunction) => {
    try {
      const assignments = await AssignmentModel.find({ asset_item_id: req.params.assetItemId }).sort({ assigned_date: -1 });
      res.json(assignments);
    } catch (error) {
      next(error);
    }
  },
  create: async (req: Request, res: Response, next: NextFunction) => {
    try {
      const payload = buildPayload(req.body);
      if (payload.is_active === undefined) payload.is_active = true;
      const assignment = await AssignmentModel.create(payload);

      if (payload.asset_item_id) {
        await AssetItemModel.findByIdAndUpdate(payload.asset_item_id, {
          assignment_status: 'Assigned',
          item_status: 'Assigned',
        });
      }

      res.status(201).json(assignment);
    } catch (error) {
      next(error);
    }
  },
  update: async (req: Request, res: Response, next: NextFunction) => {
    try {
      const payload = buildPayload(req.body);
      const assignment = await AssignmentModel.findByIdAndUpdate(req.params.id, payload, { new: true });
      if (!assignment) return res.status(404).json({ message: 'Not found' });
      return res.json(assignment);
    } catch (error) {
      next(error);
    }
  },
  returnAsset: async (req: Request, res: Response, next: NextFunction) => {
    try {
      const { returnDate } = req.body as { returnDate: string };
      const assignment = await AssignmentModel.findById(req.params.id);
      if (!assignment) return res.status(404).json({ message: 'Not found' });

      assignment.returned_date = returnDate;
      assignment.is_active = false;
      await assignment.save();

      await AssetItemModel.findByIdAndUpdate(assignment.asset_item_id, {
        assignment_status: 'Unassigned',
        item_status: 'Available',
      });

      res.json(assignment);
    } catch (error) {
      next(error);
    }
  },
  reassign: async (req: Request, res: Response, next: NextFunction) => {
    try {
      const { newEmployeeId, notes } = req.body as { newEmployeeId: string; notes?: string };
      const assignment = await AssignmentModel.findByIdAndUpdate(
        req.params.id,
        {
          employee_id: newEmployeeId,
          notes: notes || null,
          assigned_date: new Date().toISOString().split('T')[0],
        },
        { new: true }
      );
      if (!assignment) return res.status(404).json({ message: 'Not found' });
      res.json(assignment);
    } catch (error) {
      next(error);
    }
  },
  remove: async (req: Request, res: Response, next: NextFunction) => {
    try {
      const assignment = await AssignmentModel.findByIdAndDelete(req.params.id);
      if (!assignment) return res.status(404).json({ message: 'Not found' });
      return res.status(204).send();
    } catch (error) {
      next(error);
    }
  },
};
