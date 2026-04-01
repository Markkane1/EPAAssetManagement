import { describe, expect, it } from "vitest";
import { Types } from "mongoose";
import { setupInMemoryMongo } from "./_mongo";

import { ConsumableBalanceModel } from "../../../server/src/modules/consumables/models/consumableBalance.model";
import { ConsumableBalanceTxnModel } from "../../../server/src/modules/consumables/models/consumableBalanceTxn.model";
import { ConsumableConsumptionModel } from "../../../server/src/modules/consumables/models/consumableConsumption.model";
import { ConsumableContainerModel } from "../../../server/src/modules/consumables/models/consumableContainer.model";
import { ConsumableInventoryBalanceModel } from "../../../server/src/modules/consumables/models/consumableInventoryBalance.model";
import { ConsumableInventoryTransactionModel } from "../../../server/src/modules/consumables/models/consumableInventoryTransaction.model";
import { ConsumableIssueModel } from "../../../server/src/modules/consumables/models/consumableIssue.model";
import { ConsumableItemModel } from "../../../server/src/modules/consumables/models/consumableItem.model";
import { ConsumableLotModel } from "../../../server/src/modules/consumables/models/consumableLot.model";
import { ConsumableReasonCodeModel } from "../../../server/src/modules/consumables/models/consumableReasonCode.model";
import { ConsumableReturnModel } from "../../../server/src/modules/consumables/models/consumableReturn.model";
import { ConsumableUnitModel } from "../../../server/src/modules/consumables/models/consumableUnit.model";

setupInMemoryMongo();

const oid = () => new Types.ObjectId();

describe("consumable mongoose models", () => {
  describe("ConsumableItemModel", () => {
    it("should require name and base_uom and populate boolean defaults", async () => {
      const doc = new ConsumableItemModel({ name: "Acetone", base_uom: "ml" });
      await expect(doc.validate()).resolves.toBeUndefined();
      expect(doc.subcategory).toBe(null);
      expect(doc.is_hazardous).toBe(false);
      expect(doc.requires_lot_tracking).toBe(true);

      await expect(new ConsumableItemModel({ base_uom: "ml" }).validate()).rejects.toMatchObject({ name: "ValidationError" });
      await expect(new ConsumableItemModel({ name: "Acetone" }).validate()).rejects.toMatchObject({ name: "ValidationError" });
    });
  });

  describe("ConsumableUnitModel", () => {
    it("should require code, name, group, and to_base and reject duplicate codes", async () => {
      const doc = new ConsumableUnitModel({ code: "kg", name: "Kilogram", group: "mass", to_base: 1000 });
      await expect(doc.validate()).resolves.toBeUndefined();
      expect(doc.aliases).toEqual([]);
      expect(doc.is_active).toBe(true);

      await ConsumableUnitModel.syncIndexes();
      await ConsumableUnitModel.create({ code: "kg", name: "Kilogram", group: "mass", to_base: 1000 });
      await expect(
        ConsumableUnitModel.create({ code: "kg", name: "Kilogram 2", group: "mass", to_base: 1000 })
      ).rejects.toBeTruthy();
    });
  });

  describe("ConsumableReasonCodeModel", () => {
    it("should require category and code and enforce the compound unique index", async () => {
      const doc = new ConsumableReasonCodeModel({ category: "ADJUST", code: "LOSS" });
      await expect(doc.validate()).resolves.toBeUndefined();

      await ConsumableReasonCodeModel.syncIndexes();
      await ConsumableReasonCodeModel.create({ category: "ADJUST", code: "LOSS" });
      await expect(
        ConsumableReasonCodeModel.create({ category: "ADJUST", code: "LOSS" })
      ).rejects.toBeTruthy();
    });
  });

  describe("ConsumableContainerModel", () => {
    it("should require the core container fields and enforce unique container_code", async () => {
      const doc = new ConsumableContainerModel({
        lot_id: oid(),
        container_code: "CONT-001",
        initial_qty_base: 10,
        current_qty_base: 8,
        current_location_id: oid(),
      });
      await expect(doc.validate()).resolves.toBeUndefined();
      expect(doc.status).toBe("IN_STOCK");

      await ConsumableContainerModel.syncIndexes();
      await ConsumableContainerModel.create({
        lot_id: oid(),
        container_code: "CONT-001",
        initial_qty_base: 10,
        current_qty_base: 8,
        current_location_id: oid(),
      });
      await expect(
        ConsumableContainerModel.create({
          lot_id: oid(),
          container_code: "CONT-001",
          initial_qty_base: 11,
          current_qty_base: 9,
          current_location_id: oid(),
        })
      ).rejects.toBeTruthy();
    });
  });

  describe("ConsumableInventoryBalanceModel", () => {
    it("should require consumable_item_id and qty_on_hand_base and declare the partial unique index for holder-scoped balances", async () => {
      const doc = new ConsumableInventoryBalanceModel({
        holder_type: "OFFICE",
        holder_id: oid(),
        consumable_item_id: oid(),
        qty_on_hand_base: 12,
      });
      await expect(doc.validate()).resolves.toBeUndefined();
      expect(doc.qty_reserved_base).toBe(0);

      const indexes = ConsumableInventoryBalanceModel.schema.indexes();
      const matchingIndex = indexes.find(
        ([fields, options]) =>
          fields.holder_type === 1 &&
          fields.holder_id === 1 &&
          fields.consumable_item_id === 1 &&
          fields.lot_id === 1 &&
          options.unique === true
      );
      expect(matchingIndex).toBeTruthy();
      expect(matchingIndex?.[1].partialFilterExpression).toEqual({
        holder_id: { $exists: true, $ne: null },
      });
    });
  });

  describe("ConsumableInventoryTransactionModel", () => {
    it("should require the transaction shape and reject negative quantities", async () => {
      const doc = new ConsumableInventoryTransactionModel({
        tx_type: "RECEIPT",
        tx_time: "2026-03-06T00:00:00.000Z",
        created_by: oid(),
        consumable_item_id: oid(),
        qty_base: 10,
        entered_qty: 10,
        entered_uom: "ml",
      });
      await expect(doc.validate()).resolves.toBeUndefined();
      expect(doc.metadata).toEqual({});

      await expect(
        new ConsumableInventoryTransactionModel({
          tx_type: "RECEIPT",
          tx_time: "2026-03-06T00:00:00.000Z",
          created_by: oid(),
          consumable_item_id: oid(),
          qty_base: -1,
          entered_qty: 10,
          entered_uom: "ml",
        }).validate()
      ).rejects.toMatchObject({ name: "ValidationError" });
    });
  });

  describe("ConsumableBalanceModel", () => {
    const buildValid = () => ({
      holder_type: "OFFICE",
      holder_id: oid(),
      consumable_id: oid(),
      qty_in_total: 10,
      qty_out_total: 2,
      qty_on_hand: 8,
    });

    it("should normalize quantity fields and enforce the unique holder/consumable index", async () => {
      const doc = new ConsumableBalanceModel({ ...buildValid(), qty_in_total: 10.125, qty_out_total: 2.5, qty_on_hand: 7.5 });
      await expect(doc.validate()).rejects.toBeTruthy();

      const rounded = new ConsumableBalanceModel({ ...buildValid(), qty_in_total: 10.12, qty_out_total: 2, qty_on_hand: 8 });
      await expect(rounded.validate()).resolves.toBeUndefined();

      await ConsumableBalanceModel.syncIndexes();
      const holderId = oid();
      const consumableId = oid();
      await ConsumableBalanceModel.create({ holder_type: "OFFICE", holder_id: holderId, consumable_id: consumableId, qty_on_hand: 1 });
      await expect(
        ConsumableBalanceModel.create({ holder_type: "OFFICE", holder_id: holderId, consumable_id: consumableId, qty_on_hand: 2 })
      ).rejects.toBeTruthy();
    });

    it("should apply quantity validation on update hooks", async () => {
      const doc = await ConsumableBalanceModel.create(buildValid());
      await expect(
        ConsumableBalanceModel.updateOne({ _id: doc._id }, { $set: { qty_on_hand: 9.5 } })
      ).resolves.toBeTruthy();
      await expect(
        ConsumableBalanceModel.updateOne({ _id: doc._id }, { $set: { qty_on_hand: -1 } })
      ).rejects.toThrow(/greater than or equal to 0/i);
    });
  });

  describe("ConsumableBalanceTxnModel", () => {
    const buildValid = () => ({
      balance_id: oid(),
      event_type: "ISSUE_IN",
      quantity: 1.25,
      performed_by_user_id: oid(),
    });

    it("should require the transaction fields and reject invalid quantity precision", async () => {
      await expect(new ConsumableBalanceTxnModel(buildValid()).validate()).resolves.toBeUndefined();
      await expect(
        new ConsumableBalanceTxnModel({ ...buildValid(), quantity: 1.234 }).validate()
      ).rejects.toMatchObject({ name: "ValidationError" });
    });

    it("should apply quantity validation on update hooks", async () => {
      const doc = await ConsumableBalanceTxnModel.create(buildValid());
      await expect(
        ConsumableBalanceTxnModel.findOneAndUpdate({ _id: doc._id }, { $set: { quantity: 2.5 } }, { new: true })
      ).resolves.toBeTruthy();
      await expect(
        ConsumableBalanceTxnModel.findOneAndUpdate({ _id: doc._id }, { $set: { quantity: 0 } }, { new: true })
      ).rejects.toThrow(/greater than 0/i);
    });
  });

  describe("ConsumableIssueModel", () => {
    const buildValid = () => ({
      lot_id: oid(),
      from_holder_type: "STORE",
      from_holder_id: oid(),
      to_type: "OFFICE",
      to_id: oid(),
      quantity: 3,
      issued_by_user_id: oid(),
    });

    it("should require the issue fields and normalize quantity through setters and update hooks", async () => {
      await expect(new ConsumableIssueModel(buildValid()).validate()).resolves.toBeUndefined();
      await expect(
        new ConsumableIssueModel({ ...buildValid(), quantity: 0 }).validate()
      ).rejects.toMatchObject({ name: "ValidationError" });

      const doc = await ConsumableIssueModel.create(buildValid());
      await expect(
        ConsumableIssueModel.updateMany({ _id: doc._id }, { $set: { quantity: 2.25 } })
      ).resolves.toBeTruthy();
      await expect(
        ConsumableIssueModel.updateMany({ _id: doc._id }, { $set: { quantity: 2.256 } })
      ).rejects.toThrow(/at most 2 decimal places/i);
    });
  });

  describe("ConsumableConsumptionModel", () => {
    const buildValid = () => ({
      source_type: "OFFICE",
      source_id: oid(),
      consumable_id: oid(),
      quantity: 1,
      recorded_by_user_id: oid(),
    });

    it("should require the consumption fields and enforce quantity rules on create and update", async () => {
      const doc = new ConsumableConsumptionModel(buildValid());
      await expect(doc.validate()).resolves.toBeUndefined();
      expect(doc.notes).toBe(null);

      await expect(
        new ConsumableConsumptionModel({ ...buildValid(), quantity: "bad" as never }).validate()
      ).rejects.toMatchObject({ name: "ValidationError" });

      const saved = await ConsumableConsumptionModel.create(buildValid());
      await expect(
        ConsumableConsumptionModel.updateOne({ _id: saved._id }, { $set: { quantity: 3.5 } })
      ).resolves.toBeTruthy();
      await expect(
        ConsumableConsumptionModel.updateOne({ _id: saved._id }, { $set: { quantity: -1 } })
      ).rejects.toThrow(/greater than 0/i);
    });
  });

  describe("ConsumableLotModel", () => {
    const buildValid = () => ({
      consumable_id: oid(),
      holder_type: "STORE",
      holder_id: oid(),
      batch_no: "BATCH-001",
      expiry_date: new Date("2027-01-01T00:00:00.000Z"),
      qty_received: 5,
      qty_available: 5,
      received_by_user_id: oid(),
    });

    it("should require the core lot fields and populate nested doc defaults", async () => {
      const doc = new ConsumableLotModel(buildValid());
      await expect(doc.validate()).resolves.toBeUndefined();
      expect(doc.source_type).toBe("procurement");
      expect(doc.docs).toMatchObject({ sds_url: null, coa_url: null, invoice_url: null });

      await expect(
        new ConsumableLotModel({ ...buildValid(), qty_received: 0 }).validate()
      ).rejects.toMatchObject({ name: "ValidationError" });
    });

    it("should enforce quantity rules on updates", async () => {
      const doc = await ConsumableLotModel.create(buildValid());
      await expect(
        ConsumableLotModel.findOneAndUpdate({ _id: doc._id }, { $set: { qty_available: 4.5 } }, { new: true })
      ).resolves.toBeTruthy();
      await expect(
        ConsumableLotModel.findOneAndUpdate({ _id: doc._id }, { $set: { qty_available: -1 } }, { new: true })
      ).rejects.toThrow(/greater than or equal to 0/i);
    });
  });

  describe("ConsumableReturnModel", () => {
    const buildValid = () => ({
      mode: "USER_TO_OFFICE",
      consumable_id: oid(),
      quantity: 1,
      performed_by_user_id: oid(),
    });

    it("should require mode, consumable_id, quantity, and performed_by_user_id", async () => {
      const doc = new ConsumableReturnModel(buildValid());
      await expect(doc.validate()).resolves.toBeUndefined();
      expect(doc.notes).toBe(null);

      await expect(
        new ConsumableReturnModel({ ...buildValid(), quantity: 1.234 }).validate()
      ).rejects.toMatchObject({ name: "ValidationError" });

      const saved = await ConsumableReturnModel.create(buildValid());
      await expect(
        ConsumableReturnModel.updateOne({ _id: saved._id }, { $set: { quantity: 2 } })
      ).resolves.toBeTruthy();
      await expect(
        ConsumableReturnModel.updateOne({ _id: saved._id }, { $set: { quantity: 0 } })
      ).rejects.toThrow(/greater than 0/i);
    });
  });
});
