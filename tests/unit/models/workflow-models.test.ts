import { describe, expect, it } from "vitest";
import { Types } from "mongoose";
import { setupInMemoryMongo } from "./_mongo";

import { AssignmentModel } from "../../../server/src/models/assignment.model";
import { OfficeSubLocationModel } from "../../../server/src/models/officeSubLocation.model";
import { ProjectModel } from "../../../server/src/models/project.model";
import { RequisitionModel } from "../../../server/src/models/requisition.model";
import { RequisitionLineModel } from "../../../server/src/models/requisitionLine.model";
import { ReturnRequestModel } from "../../../server/src/models/returnRequest.model";

setupInMemoryMongo();

const oid = () => new Types.ObjectId();

describe("workflow mongoose models", () => {
  describe("ProjectModel", () => {
    const buildValid = () => ({
      name: "Project A",
      start_date: "2026-01-01",
      end_date: "2026-12-31",
    });

    it("should validate a project with valid ordered date strings and populate defaults", async () => {
      const doc = new ProjectModel(buildValid());
      await expect(doc.validate()).resolves.toBeUndefined();
      expect(doc.is_active).toBe(true);
    });

    it("should require name, start_date, and end_date", async () => {
      for (const field of ["name", "start_date", "end_date"]) {
        const data = buildValid();
        delete data[field as keyof typeof data];
        const error = await new ProjectModel(data).validate().catch((err) => err as any);
        expect(error?.name).toBe("ValidationError");
        expect(error?.errors?.[field]).toBeTruthy();
      }
    });

    it("should reject invalid date strings and end dates that are not later than start dates", async () => {
      await expect(
        new ProjectModel({ ...buildValid(), start_date: "bad-date" }).validate()
      ).rejects.toMatchObject({ name: "ValidationError" });

      await expect(
        new ProjectModel({ ...buildValid(), end_date: "2026-01-01" }).validate()
      ).rejects.toMatchObject({ name: "ValidationError" });
    });
  });

  describe("OfficeSubLocationModel", () => {
    it("should require office_id and name and default is_active to true", async () => {
      const doc = new OfficeSubLocationModel({ office_id: oid(), name: "Section A" });
      await expect(doc.validate()).resolves.toBeUndefined();
      expect(doc.is_active).toBe(true);

      await expect(new OfficeSubLocationModel({ name: "Section A" }).validate()).rejects.toMatchObject({
        name: "ValidationError",
      });
      await expect(new OfficeSubLocationModel({ office_id: oid() }).validate()).rejects.toMatchObject({
        name: "ValidationError",
      });
    });

    it("should reject duplicate office/name combinations through the unique index", async () => {
      await OfficeSubLocationModel.syncIndexes();
      const officeId = oid();
      await OfficeSubLocationModel.create({ office_id: officeId, name: "Section A" });
      await expect(
        OfficeSubLocationModel.create({ office_id: officeId, name: "Section A" })
      ).rejects.toBeTruthy();
    });
  });

  describe("AssignmentModel", () => {
    const baseAssignment = () => ({
      asset_item_id: oid(),
      assigned_to_type: "EMPLOYEE",
      assigned_to_id: oid(),
      employee_id: null as Types.ObjectId | null,
      requisition_id: oid(),
      requisition_line_id: oid(),
      assigned_date: new Date("2026-03-06T00:00:00.000Z"),
    });

    it("should require the core assignment fields", async () => {
      const fields = [
        "asset_item_id",
        "assigned_to_type",
        "assigned_to_id",
        "requisition_id",
        "requisition_line_id",
        "assigned_date",
      ];

      for (const field of fields) {
        const payload = baseAssignment();
        if (field === "employee_id") {
          continue;
        }
        delete payload[field as keyof typeof payload];
        const error = await new AssignmentModel(payload).validate().catch((err) => err as any);
        expect(error?.name).toBe("ValidationError");
        expect(error?.errors?.[field]).toBeTruthy();
      }
    });

    it("should require employee_id to match assigned_to_id for EMPLOYEE assignments", async () => {
      const assignedToId = oid();
      await expect(
        new AssignmentModel({ ...baseAssignment(), assigned_to_id: assignedToId, employee_id: null }).validate()
      ).rejects.toMatchObject({ name: "ValidationError" });

      await expect(
        new AssignmentModel({ ...baseAssignment(), assigned_to_id: assignedToId, employee_id: oid() }).validate()
      ).rejects.toMatchObject({ name: "ValidationError" });

      const validDoc = new AssignmentModel({
        ...baseAssignment(),
        assigned_to_id: assignedToId,
        employee_id: assignedToId,
      });
      await expect(validDoc.validate()).resolves.toBeUndefined();
    });

    it("should require employee_id to be null for SUB_LOCATION assignments", async () => {
      await expect(
        new AssignmentModel({
          ...baseAssignment(),
          assigned_to_type: "SUB_LOCATION",
          employee_id: oid(),
        }).validate()
      ).rejects.toMatchObject({ name: "ValidationError" });

      const validDoc = new AssignmentModel({
        ...baseAssignment(),
        assigned_to_type: "SUB_LOCATION",
        assigned_to_id: oid(),
        employee_id: null,
      });
      await expect(validDoc.validate()).resolves.toBeUndefined();
    });

    it("should derive is_active from status in the pre-save hook", async () => {
      const openDoc = await AssignmentModel.create({
        ...baseAssignment(),
        assigned_to_id: oid(),
        employee_id: undefined,
        assigned_to_type: "SUB_LOCATION",
        status: "ISSUED",
      });
      expect(openDoc.is_active).toBe(true);

      const closedDoc = await AssignmentModel.create({
        ...baseAssignment(),
        assigned_to_id: oid(),
        employee_id: undefined,
        assigned_to_type: "SUB_LOCATION",
        status: "RETURNED",
      });
      expect(closedDoc.is_active).toBe(false);
    });

    it("should reject duplicate open assignments for the same asset item due to partial unique indexes", async () => {
      await AssignmentModel.syncIndexes();
      const assetItemId = oid();
      await AssignmentModel.create({
        ...baseAssignment(),
        asset_item_id: assetItemId,
        assigned_to_id: oid(),
        employee_id: undefined,
        assigned_to_type: "SUB_LOCATION",
        status: "DRAFT",
      });

      await expect(
        AssignmentModel.create({
          ...baseAssignment(),
          asset_item_id: assetItemId,
          assigned_to_id: oid(),
          employee_id: undefined,
          assigned_to_type: "SUB_LOCATION",
          status: "ISSUED",
        })
      ).rejects.toBeTruthy();
    });
  });

  describe("RequisitionModel", () => {
    const buildValid = () => ({
      file_number: `REQ-${new Types.ObjectId().toString()}`,
      office_id: oid(),
      issuing_office_id: oid(),
      target_type: "EMPLOYEE",
      target_id: oid(),
      submitted_by_user_id: oid(),
    });

    it("should validate a minimal requisition and populate the default status", async () => {
      const doc = new RequisitionModel(buildValid());
      await expect(doc.validate()).resolves.toBeUndefined();
      expect(doc.status).toBe("SUBMITTED");
    });

    it("should require file_number, office_id, issuing_office_id, target_type, target_id, and submitted_by_user_id", async () => {
      for (const field of ["file_number", "office_id", "issuing_office_id", "target_type", "target_id", "submitted_by_user_id"]) {
        const payload = buildValid();
        delete payload[field as keyof typeof payload];
        const error = await new RequisitionModel(payload).validate().catch((err) => err as any);
        expect(error?.name).toBe("ValidationError");
        expect(error?.errors?.[field]).toBeTruthy();
      }
    });

    it("should reject invalid ObjectIds in target_id for EMPLOYEE and SUB_LOCATION targets", async () => {
      await expect(
        new RequisitionModel({ ...buildValid(), target_type: "EMPLOYEE", target_id: "bad-id" }).validate()
      ).rejects.toMatchObject({ name: "ValidationError" });

      await expect(
        new RequisitionModel({ ...buildValid(), target_type: "SUB_LOCATION", target_id: "bad-id" }).validate()
      ).rejects.toMatchObject({ name: "ValidationError" });
    });

    it("should reject duplicate file numbers", async () => {
      await RequisitionModel.syncIndexes();
      const fileNumber = `REQ-${new Types.ObjectId().toString()}`;
      await RequisitionModel.create({ ...buildValid(), file_number: fileNumber });
      await expect(
        RequisitionModel.create({ ...buildValid(), file_number: fileNumber })
      ).rejects.toBeTruthy();
    });
  });

  describe("RequisitionLineModel", () => {
    const buildMoveable = () => ({
      requisition_id: oid(),
      line_type: "MOVEABLE",
      asset_id: oid(),
      requested_name: "Desktop PC",
      requested_quantity: 2,
    });

    it("should require requisition_id, line_type, and requested_name and default quantities/status", async () => {
      const doc = new RequisitionLineModel(buildMoveable());
      await expect(doc.validate()).resolves.toBeUndefined();
      expect(doc.approved_quantity).toBe(2);
      expect(doc.fulfilled_quantity).toBe(0);
      expect(doc.status).toBe("PENDING_ASSIGNMENT");

      for (const field of ["requisition_id", "line_type", "requested_name"]) {
        const payload = buildMoveable();
        delete payload[field as keyof typeof payload];
        const error = await new RequisitionLineModel(payload).validate().catch((err) => err as any);
        expect(error?.name).toBe("ValidationError");
        expect(error?.errors?.[field]).toBeTruthy();
      }
    });

    it("should reject cross-type asset and consumable references", async () => {
      await expect(
        new RequisitionLineModel({
          ...buildMoveable(),
          line_type: "MOVEABLE",
          consumable_id: oid(),
        }).validate()
      ).rejects.toMatchObject({ name: "ValidationError" });

      await expect(
        new RequisitionLineModel({
          requisition_id: oid(),
          line_type: "CONSUMABLE",
          asset_id: oid(),
          consumable_id: oid(),
          requested_name: "Reagent",
        }).validate()
      ).rejects.toMatchObject({ name: "ValidationError" });
    });

    it("should preserve explicit approved quantities and validate minimum boundaries", async () => {
      const doc = new RequisitionLineModel({
        requisition_id: oid(),
        line_type: "CONSUMABLE",
        consumable_id: oid(),
        requested_name: "Reagent",
        requested_quantity: 3,
        approved_quantity: 1,
      });
      await expect(doc.validate()).resolves.toBeUndefined();
      expect(doc.approved_quantity).toBe(1);

      await expect(
        new RequisitionLineModel({ ...buildMoveable(), requested_quantity: 0 }).validate()
      ).rejects.toMatchObject({ name: "ValidationError" });
    });
  });

  describe("ReturnRequestModel", () => {
    const buildValid = () => ({
      employee_id: oid(),
      office_id: oid(),
      lines: [{ asset_item_id: oid() }],
    });

    it("should require employee_id, office_id, and a non-empty lines array", async () => {
      const doc = new ReturnRequestModel(buildValid());
      await expect(doc.validate()).resolves.toBeUndefined();
      expect(doc.status).toBe("SUBMITTED");

      await expect(new ReturnRequestModel({ office_id: oid(), lines: [{ asset_item_id: oid() }] }).validate()).rejects.toMatchObject({
        name: "ValidationError",
      });
      await expect(new ReturnRequestModel({ employee_id: oid(), lines: [{ asset_item_id: oid() }] }).validate()).rejects.toMatchObject({
        name: "ValidationError",
      });
      await expect(new ReturnRequestModel({ employee_id: oid(), office_id: oid(), lines: [] }).validate()).rejects.toMatchObject({
        name: "ValidationError",
      });
    });
  });
});
