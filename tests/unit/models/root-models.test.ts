import { describe, expect, it } from "vitest";
import { Types } from "mongoose";
import { setupInMemoryMongo } from "./_mongo";

import { ActivityLogModel } from "../../../server/src/models/activityLog.model";
import { ApprovalMatrixRequestModel } from "../../../server/src/models/approvalMatrixRequest.model";
import { ApprovalRequestModel } from "../../../server/src/models/approvalRequest.model";
import { AssetModel } from "../../../server/src/models/asset.model";
import { AssetItemModel } from "../../../server/src/models/assetItem.model";
import { AuditLogModel } from "../../../server/src/models/auditLog.model";
import { CategoryModel } from "../../../server/src/models/category.model";
import { ConsumableModel } from "../../../server/src/models/consumable.model";
import { CounterModel } from "../../../server/src/models/counter.model";
import { DistrictModel } from "../../../server/src/models/district.model";
import { DivisionModel } from "../../../server/src/models/division.model";
import { DocumentModel } from "../../../server/src/models/document.model";
import { DocumentLinkModel } from "../../../server/src/models/documentLink.model";
import { DocumentVersionModel } from "../../../server/src/models/documentVersion.model";
import { EmployeeModel } from "../../../server/src/models/employee.model";
import { MaintenanceRecordModel } from "../../../server/src/models/maintenanceRecord.model";
import { NotificationModel } from "../../../server/src/models/notification.model";
import { OfficeModel } from "../../../server/src/models/office.model";
import { PurchaseOrderModel } from "../../../server/src/models/purchaseOrder.model";
import { RateLimitEntryModel } from "../../../server/src/models/rateLimitEntry.model";
import { RecordModel } from "../../../server/src/models/record.model";
import { RoleDelegationModel } from "../../../server/src/models/roleDelegation.model";
import { SchemeModel } from "../../../server/src/models/scheme.model";
import { StoreModel } from "../../../server/src/models/store.model";
import { SystemSettingsModel } from "../../../server/src/models/systemSettings.model";
import { TransferModel } from "../../../server/src/models/transfer.model";
import { UserModel } from "../../../server/src/models/user.model";
import { VendorModel } from "../../../server/src/models/vendor.model";

setupInMemoryMongo();

const oid = () => new Types.ObjectId();

async function expectMissingRequiredField(model: any, buildValid: () => Record<string, unknown>, field: string) {
  const data = buildValid();
  delete data[field];
  const error = await new model(data).validate().catch((err: Error) => err as any);
  expect(error?.name).toBe("ValidationError");
  expect(error?.errors?.[field]).toBeTruthy();
}

type ModelCase = {
  name: string;
  model: any;
  buildValid: () => Record<string, unknown>;
  required: string[];
  defaults?: Array<[string, unknown]>;
  unique?: () => Promise<void>;
  extra?: () => Promise<void>;
};

const rootModelCases: ModelCase[] = [
  {
    name: "ActivityLogModel",
    model: ActivityLogModel,
    buildValid: () => ({ user_id: oid(), activity_type: "LOGIN" }),
    required: ["user_id", "activity_type"],
    defaults: [["description", null], ["ip_address", null]],
  },
  {
    name: "ApprovalMatrixRequestModel",
    model: ApprovalMatrixRequestModel,
    buildValid: () => ({
      transaction_type: "TRANSFER",
      maker_user_id: oid(),
      payload_digest: "digest-1",
      requested_at: new Date(),
      required_approvals: 1,
      rule_snapshot: {
        id: "rule-1",
        transaction_type: "TRANSFER",
        required_approvals: 1,
      },
    }),
    required: [
      "transaction_type",
      "maker_user_id",
      "payload_digest",
      "requested_at",
      "required_approvals",
      "rule_snapshot",
    ],
    defaults: [["status", "Pending"]],
  },
  {
    name: "ApprovalRequestModel",
    model: ApprovalRequestModel,
    buildValid: () => ({
      record_id: oid(),
      requested_by_user_id: oid(),
      requested_at: new Date(),
    }),
    required: ["record_id", "requested_by_user_id", "requested_at"],
    defaults: [["status", "Pending"]],
  },
  {
    name: "AssetModel",
    model: AssetModel,
    buildValid: () => ({ name: "Microscope" }),
    required: ["name"],
    defaults: [["quantity", 1], ["currency", "PKR"], ["is_active", true]],
  },
  {
    name: "AssetItemModel",
    model: AssetItemModel,
    buildValid: () => ({ asset_id: oid() }),
    required: ["asset_id"],
    defaults: [["assignment_status", "Unassigned"], ["item_status", "Available"]],
  },
  {
    name: "AuditLogModel",
    model: AuditLogModel,
    buildValid: () => ({
      actor_user_id: oid(),
      office_id: oid(),
      action: "UPDATE",
      entity_type: "Asset",
      entity_id: oid(),
      timestamp: new Date(),
    }),
    required: ["actor_user_id", "office_id", "action", "entity_type", "entity_id", "timestamp"],
  },
  {
    name: "CategoryModel",
    model: CategoryModel,
    buildValid: () => ({ name: "Equipment" }),
    required: ["name"],
    defaults: [["scope", "GENERAL"], ["asset_type", "ASSET"]],
  },
  {
    name: "ConsumableModel",
    model: ConsumableModel,
    buildValid: () => ({
      name: "Printer Ink",
      unit: "bottle",
      total_quantity: 10,
      available_quantity: 8,
    }),
    required: ["name", "unit", "total_quantity", "available_quantity"],
    defaults: [["is_active", true]],
  },
  {
    name: "CounterModel",
    model: CounterModel,
    buildValid: () => ({ key: `counter-${new Types.ObjectId().toString()}` }),
    required: ["key"],
    defaults: [["seq", 0]],
    unique: async () => {
      await CounterModel.init();
      const key = `counter-${new Types.ObjectId().toString()}`;
      await CounterModel.create({ key });
      await expect(CounterModel.create({ key })).rejects.toBeTruthy();
    },
  },
  {
    name: "DivisionModel",
    model: DivisionModel,
    buildValid: () => ({ name: `Division-${new Types.ObjectId().toString()}` }),
    required: ["name"],
    defaults: [["is_active", true]],
    unique: async () => {
      await DivisionModel.syncIndexes();
      const name = `Division-${new Types.ObjectId().toString()}`;
      await DivisionModel.create({ name });
      await expect(DivisionModel.create({ name })).rejects.toBeTruthy();
    },
  },
  {
    name: "DistrictModel",
    model: DistrictModel,
    buildValid: () => ({ name: "District A", division_id: oid() }),
    required: ["name", "division_id"],
    defaults: [["is_active", true]],
    unique: async () => {
      await DistrictModel.syncIndexes();
      const divisionId = oid();
      await DistrictModel.create({ name: "District A", division_id: divisionId });
      await expect(DistrictModel.create({ name: "District A", division_id: divisionId })).rejects.toBeTruthy();
    },
  },
  {
    name: "DocumentModel",
    model: DocumentModel,
    buildValid: () => ({
      title: "Transfer Order",
      doc_type: "IssueSlip",
      office_id: oid(),
      created_by_user_id: oid(),
    }),
    required: ["title", "doc_type", "office_id", "created_by_user_id"],
    defaults: [["status", "Draft"]],
  },
  {
    name: "DocumentLinkModel",
    model: DocumentLinkModel,
    buildValid: () => ({ document_id: oid(), entity_type: "AssetItem", entity_id: oid() }),
    required: ["document_id", "entity_type", "entity_id"],
    unique: async () => {
      await DocumentLinkModel.syncIndexes();
      const payload = { document_id: oid(), entity_type: "AssetItem", entity_id: oid() };
      await DocumentLinkModel.create(payload);
      await expect(DocumentLinkModel.create(payload)).rejects.toBeTruthy();
    },
  },
  {
    name: "DocumentVersionModel",
    model: DocumentVersionModel,
    buildValid: () => ({
      document_id: oid(),
      version_no: 1,
      file_name: "file.pdf",
      mime_type: "application/pdf",
      size_bytes: 123,
      file_path: "/tmp/file.pdf",
      sha256: "abc123",
      uploaded_by_user_id: oid(),
      uploaded_at: new Date(),
    }),
    required: ["document_id", "version_no", "file_name", "mime_type", "size_bytes", "file_path", "sha256", "uploaded_by_user_id", "uploaded_at"],
    unique: async () => {
      await DocumentVersionModel.syncIndexes();
      const documentId = oid();
      const payload = {
        document_id: documentId,
        version_no: 1,
        file_name: "file.pdf",
        mime_type: "application/pdf",
        size_bytes: 123,
        file_path: "/tmp/file.pdf",
        sha256: "abc123",
        uploaded_by_user_id: oid(),
        uploaded_at: new Date(),
      };
      await DocumentVersionModel.create(payload);
      await expect(DocumentVersionModel.create({ ...payload, sha256: "different" })).rejects.toBeTruthy();
    },
  },
  {
    name: "EmployeeModel",
    model: EmployeeModel,
    buildValid: () => ({ first_name: "Test", last_name: "User", email: "employee@test.com" }),
    required: ["first_name", "last_name", "email"],
    defaults: [["is_active", true]],
  },
  {
    name: "MaintenanceRecordModel",
    model: MaintenanceRecordModel,
    buildValid: () => ({ asset_item_id: oid() }),
    required: ["asset_item_id"],
    defaults: [["maintenance_type", "Preventive"], ["maintenance_status", "Scheduled"]],
  },
  {
    name: "NotificationModel",
    model: NotificationModel,
    buildValid: () => ({
      recipient_user_id: oid(),
      office_id: oid(),
      type: "APPROVAL_REQUESTED",
      title: "Action needed",
      message: "Approve transfer",
      entity_type: "Transfer",
      entity_id: oid(),
    }),
    required: ["recipient_user_id", "office_id", "type", "title", "message", "entity_type", "entity_id"],
    defaults: [["is_read", false]],
  },
  {
    name: "OfficeModel",
    model: OfficeModel,
    buildValid: () => ({ name: "District Office North" }),
    required: ["name"],
    defaults: [["type", "DISTRICT_OFFICE"], ["is_active", true]],
  },
  {
    name: "PurchaseOrderModel",
    model: PurchaseOrderModel,
    buildValid: () => ({ order_number: "PO-001", order_date: "2026-03-06", total_amount: 1000 }),
    required: ["order_number", "order_date", "total_amount"],
    defaults: [["source_type", "procurement"], ["tax_percentage", 0]],
  },
  {
    name: "RateLimitEntryModel",
    model: RateLimitEntryModel,
    buildValid: () => ({ key: "login:127.0.0.1", window_start: new Date(), reset_at: new Date(), expires_at: new Date() }),
    required: ["key", "window_start", "reset_at", "expires_at"],
    defaults: [["count", 0]],
    unique: async () => {
      await RateLimitEntryModel.syncIndexes();
      const windowStart = new Date("2026-03-06T00:00:00.000Z");
      await RateLimitEntryModel.create({ key: "login:1", window_start: windowStart, reset_at: new Date(), expires_at: new Date() });
      await expect(RateLimitEntryModel.create({ key: "login:1", window_start: windowStart, reset_at: new Date(), expires_at: new Date() })).rejects.toBeTruthy();
    },
  },
  {
    name: "RecordModel",
    model: RecordModel,
    buildValid: () => ({ record_type: "ISSUE", reference_no: `REC-${new Types.ObjectId().toString()}`, office_id: oid(), created_by_user_id: oid() }),
    required: ["record_type", "reference_no", "office_id", "created_by_user_id"],
    defaults: [["status", "Draft"]],
    unique: async () => {
      await RecordModel.syncIndexes();
      const referenceNo = `REC-${new Types.ObjectId().toString()}`;
      const payload = { record_type: "ISSUE", reference_no: referenceNo, office_id: oid(), created_by_user_id: oid() };
      await RecordModel.create(payload);
      await expect(RecordModel.create({ ...payload, office_id: oid() })).rejects.toBeTruthy();
    },
  },
  {
    name: "RoleDelegationModel",
    model: RoleDelegationModel,
    buildValid: () => ({
      delegator_user_id: oid(),
      delegate_user_id: oid(),
      office_id: oid(),
      delegated_roles: ["office_head"],
      starts_at: new Date("2026-03-06T00:00:00.000Z"),
      ends_at: new Date("2026-03-07T00:00:00.000Z"),
    }),
    required: ["delegator_user_id", "delegate_user_id", "office_id", "starts_at", "ends_at"],
    defaults: [["status", "ACTIVE"]],
    extra: async () => {
      const doc = new RoleDelegationModel({
        delegator_user_id: oid(),
        delegate_user_id: oid(),
        office_id: oid(),
        starts_at: new Date("2026-03-06T00:00:00.000Z"),
        ends_at: new Date("2026-03-07T00:00:00.000Z"),
      });
      await expect(doc.validate()).resolves.toBeUndefined();
      expect(doc.delegated_roles).toEqual([]);
    },
  },
  {
    name: "SchemeModel",
    model: SchemeModel,
    buildValid: () => ({ project_id: oid(), name: "Water Scheme" }),
    required: ["project_id", "name"],
    defaults: [["is_active", true]],
  },
  {
    name: "StoreModel",
    model: StoreModel,
    buildValid: () => ({ name: "Main Store", code: `STORE-${new Types.ObjectId().toString().slice(0, 6)}` }),
    required: ["name", "code"],
    defaults: [["is_system", false], ["is_active", true]],
    unique: async () => {
      await StoreModel.syncIndexes();
      const code = `STORE-${new Types.ObjectId().toString().slice(0, 6)}`;
      await StoreModel.create({ name: "Main Store", code });
      await expect(StoreModel.create({ name: "Second Store", code })).rejects.toBeTruthy();
    },
  },
  {
    name: "SystemSettingsModel",
    model: SystemSettingsModel,
    buildValid: () => ({}),
    required: [],
    defaults: [["organization.name", ""], ["security.session_timeout_minutes", 30]],
  },
  {
    name: "TransferModel",
    model: TransferModel,
    buildValid: () => ({ from_office_id: oid(), to_office_id: oid(), transfer_date: new Date() }),
    required: ["from_office_id", "to_office_id", "transfer_date"],
    defaults: [["status", "REQUESTED"], ["is_active", true]],
  },
  {
    name: "UserModel",
    model: UserModel,
    buildValid: () => ({ email: `user-${new Types.ObjectId().toString()}@test.com`, password_hash: "hash123" }),
    required: ["email", "password_hash"],
    defaults: [["role", "employee"], ["is_active", true], ["token_version", 0]],
    unique: async () => {
      await UserModel.syncIndexes();
      const email = `user-${new Types.ObjectId().toString()}@test.com`;
      await UserModel.create({ email, password_hash: "hash123" });
      await expect(UserModel.create({ email, password_hash: "hash456" })).rejects.toBeTruthy();
    },
    extra: async () => {
      const doc = await UserModel.create({ email: "ADMIN@TEST.COM", password_hash: "hash123", role: "ORG_ADMIN", active_role: "OFFICE_HEAD" });
      expect(doc.email).toBe("admin@test.com");
      expect(doc.role).toBe("org_admin");
      expect(doc.active_role).toBe("office_head");
    },
  },
  {
    name: "VendorModel",
    model: VendorModel,
    buildValid: () => ({ name: "Vendor A" }),
    required: ["name"],
  },
];

describe("root and shared mongoose models", () => {
  for (const testCase of rootModelCases) {
    describe(testCase.name, () => {
      it("should validate a minimal valid document and populate configured defaults", async () => {
        const doc = new testCase.model(testCase.buildValid());
        await expect(doc.validate()).resolves.toBeUndefined();

        for (const [path, expected] of testCase.defaults ?? []) {
          expect(doc.get(path)).toEqual(expected);
        }
      });

      for (const field of testCase.required) {
        it(`should require ${field}`, async () => {
          await expectMissingRequiredField(testCase.model, testCase.buildValid, field);
        });
      }

      if (testCase.unique) {
        it("should reject duplicate values for unique indexes", async () => {
          await testCase.unique?.();
        });
      }

      if (testCase.extra) {
        it("should apply schema transforms and model-specific behavior", async () => {
          await testCase.extra?.();
        });
      }
    });
  }
});
