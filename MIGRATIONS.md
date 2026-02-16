# Migration Notes

## Requisition/Assignment V2 backfill

Script: `server/scripts/migrate-requisition-assignment-v2.ts`

What it does:
- Backfills missing requisition `target_type` / `target_id`.
- Best-effort maps requisition lines by `requested_name` to `asset_id` / `consumable_id` when a single confident match exists.
- Backfills assignment `status`, `assigned_to_type`, `assigned_to_id`, and requisition link fields.
- Uses deterministic legacy requisition/line fallback only when requisition links cannot be derived safely.

Run dry-run first:

```bash
node server/scripts/migrate-requisition-assignment-v2.ts --dry-run
```

Run live migration:

```bash
node server/scripts/migrate-requisition-assignment-v2.ts
```

Optional test limit:

```bash
node server/scripts/migrate-requisition-assignment-v2.ts --dry-run --limit=50
```
