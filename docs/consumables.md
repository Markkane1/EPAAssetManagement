# Consumables (Lab Chemicals) Module

This module provides centralized consumables inventory with lot tracking (Tier 2) and optional container tracking (Tier 3). It uses an immutable transaction ledger to derive balances.

## Key Concepts
- Central Store and multiple labs are represented by Locations (OfficeModel) with type CENTRAL, LAB, or SUBSTORE.
- Inventory transactions are immutable. Corrections are made via compensating transactions (ADJUST).
- Inventory balances are derived from transactions and maintained in ConsumableInventoryBalance for quick queries.
- All quantities are stored in base units (g, mg, kg, mL, L). Entered units are converted to base units.

## Lot Tracking (Tier 2)
- Lot tracking is enabled by default on each consumable item.
- Receipts create a lot if the item requires lot tracking and the lot is not provided.
- Lots track lot number, received date, optional expiry, and optional documents (SDS, COA, invoice).

## Container Tracking (Tier 3)
- Container tracking is required when an item is marked as controlled or requires_container_tracking.
- Receipts can include container details. Containers store current quantity and location.
- Transfers and returns for container-tracked items move full containers.
- Consumption, adjustments, and disposal can deduct partial container quantities.

## FEFO (First Expiry, First Out)
- When lot is not specified for lot-tracked items, the system allocates from earliest expiry first.
- Lots without expiry dates are treated as last in the FEFO order.

## Balances and Ledger
- ConsumableInventoryTransaction is the system of record (immutable ledger).
- ConsumableInventoryBalance is updated transactionally and should never be edited directly.
- If an error occurs, post a compensating transaction (ADJUST) instead of editing history.

## Role Permissions (Summary)
- Super Admin / Admin: full access, including opening balances and override negative stock.
- Central Store Admin: manage items/suppliers/lots/containers, receive into central, transfer from central, adjust central, view reports.
- Lab Manager: transfer lab-to-lab, consume, adjust, dispose, return to central, view reports.
- Lab User: consume and view reports for assigned location.
- Auditor / Viewer: read-only access to reports and ledger.

## API Endpoints (REST)
Base path: /api/consumables

### Master Data
- GET /items
- POST /items
- PUT /items/:id
- DELETE /items/:id

- GET /suppliers
- POST /suppliers
- PUT /suppliers/:id
- DELETE /suppliers/:id

- GET /lots
- POST /lots
- PUT /lots/:id
- DELETE /lots/:id

- GET /containers
- POST /containers
- PUT /containers/:id
- DELETE /containers/:id

- GET /locations
- POST /locations
- PUT /locations/:id
- DELETE /locations/:id

- GET /reason-codes
- POST /reason-codes

### Inventory Operations
- POST /inventory/receive
- POST /inventory/transfer
- POST /inventory/consume
- POST /inventory/adjust
- POST /inventory/dispose
- POST /inventory/return
- POST /inventory/opening-balance

### Inventory Queries
- GET /inventory/balance
- GET /inventory/balances
- GET /inventory/rollup
- GET /ledger
- GET /expiry

## Example Payloads

### Receive (Lot + Containers)
POST /api/consumables/inventory/receive
{
  "locationId": "<central-location-id>",
  "itemId": "<item-id>",
  "lot": {
    "lotNumber": "LOT-2026-001",
    "receivedDate": "2026-02-02",
    "expiryDate": "2027-02-01",
    "supplierId": "<supplier-id>",
    "docs": { "sdsUrl": "https://..." }
  },
  "qty": 500,
  "uom": "g",
  "containers": [
    { "containerCode": "BOT-001", "initialQty": 250 },
    { "containerCode": "BOT-002", "initialQty": 250 }
  ],
  "reference": "PO-123",
  "notes": "Initial receipt"
}

### Transfer (Central to Lab)
POST /api/consumables/inventory/transfer
{
  "fromLocationId": "<central-location-id>",
  "toLocationId": "<lab-location-id>",
  "itemId": "<item-id>",
  "qty": 100,
  "uom": "g",
  "lotId": "<optional-lot-id>",
  "reference": "REQ-45"
}

### Consume (Lab)
POST /api/consumables/inventory/consume
{
  "locationId": "<lab-location-id>",
  "itemId": "<item-id>",
  "qty": 10,
  "uom": "g",
  "lotId": "<optional-lot-id>",
  "notes": "Experiment ABC"
}

### Adjust (Cycle Count)
POST /api/consumables/inventory/adjust
{
  "locationId": "<lab-location-id>",
  "itemId": "<item-id>",
  "qty": 2,
  "uom": "g",
  "direction": "DECREASE",
  "reasonCodeId": "<reason-id>",
  "notes": "Count variance"
}

### Dispose
POST /api/consumables/inventory/dispose
{
  "locationId": "<lab-location-id>",
  "itemId": "<item-id>",
  "qty": 5,
  "uom": "g",
  "reasonCodeId": "<reason-id>",
  "notes": "Expired"
}

### Return to Central
POST /api/consumables/inventory/return
{
  "fromLocationId": "<lab-location-id>",
  "toLocationId": "<central-location-id>",
  "itemId": "<item-id>",
  "qty": 50,
  "uom": "g",
  "reference": "RETURN-10"
}

### Opening Balance Import
POST /api/consumables/inventory/opening-balance
{
  "entries": [
    {
      "locationId": "<lab-location-id>",
      "itemId": "<item-id>",
      "lotId": "<lot-id>",
      "qty": 100,
      "uom": "g",
      "notes": "Opening balance"
    }
  ]
}

## Notes
- All write endpoints are validated server-side with Zod.
- Negative stock is blocked by default. Admin override requires allowNegative and an override note.
- Containers are required for controlled items and for items with requires_container_tracking enabled.
