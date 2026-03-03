# Asset Management System (AMS)

Full-stack asset management platform with a React/Vite frontend and an Express/MongoDB backend.

## Tech Stack

- Frontend: React, Vite, TypeScript, Tailwind CSS, shadcn-ui
- Backend: Express, TypeScript, MongoDB (Mongoose)
- Workspace: npm workspaces (`client/`, `server/`)

## Repository Layout

- `client/`: frontend app
- `server/`: backend API and backend scripts
- `server/tests/`: backend runtime/security tests
- `scripts/`: root utility scripts (bundle budget check)

## Prerequisites

- Node.js 20+ (Node 22 recommended)
- npm 10+
- MongoDB 6+ running as a replica set (required for transactions)

## Quick Start

1. Install dependencies from repo root:

```sh
npm install
```

2. Create backend environment file:

```sh
cp server/.env.example server/.env
```

PowerShell:

```powershell
Copy-Item server/.env.example server/.env
```

3. Update `server/.env` with at least:

```env
MONGO_URI=mongodb://127.0.0.1:27017/ams?replicaSet=rs0
MONGO_REQUIRE_REPLICA_SET=true
JWT_SECRET=<strong-random-32-plus-chars>
```

4. Create root `.env` and set client API URL:

```env
VITE_API_BASE_URL=http://localhost:5000/api
```

5. Start both client and server:

```sh
npm run dev:full
```

- Client: `http://localhost:8080`
- API: `http://localhost:5000`

## Run Client/Server Separately

From repo root:

```sh
npm run dev:client
npm run dev:server
```

## MongoDB Replica Set Setup (Required)

If MongoDB is local and single-node:

```sh
mongod --dbpath <YOUR_DB_PATH> --replSet rs0
mongosh --eval "rs.initiate({_id:'rs0',members:[{_id:0,host:'127.0.0.1:27017'}]})"
```

If replica set is not enabled, transactional operations fail with:
`Transaction numbers are only allowed on a replica set member or mongos`.

## Common Commands

### Root

```sh
npm run dev
npm run dev:full
npm run build
npm run build:server
npm run lint
npm run lint:server
npm run test:security
npm run test:consumables
npm run test:runtime
npm run test:server:all
npm run build:client:budget
npm run perf:bundle
npm run precommit:checks
```

### Backend (`server/`)

```sh
npm run dev
npm run build
npm run lint
npm run openapi:generate
npm run seed:store
npm run seed:consumables
npm run test:suite -- security --list
npm run test:security
npm run test:consumables
npm run test:runtime
npm run test:all
```

### Frontend (`client/`)

```sh
npm run dev
npm run build
npm run lint
npm run preview
```

## Test Suites and Folders

Server tests are organized in separate folders under `server/tests/` and run by suite:

- `security/`
- `consumables/`
- `requisition/`
- `return-requests/`
- `reports/`
- `employees/`
- `office-sub-locations/`
- `asset-items/`
- `manual/` (manual/ad-hoc scripts, not part of automated suite)

Folder-based runner:

```sh
cd server
node scripts/run-test-suites.js security --list
node scripts/run-test-suites.js runtime
node scripts/run-test-suites.js all
```

## Migrations and Seed Runbook

Use this when upgrading an existing database. Always back up first:

```sh
mongodump --uri "$MONGO_URI" --out ./backup-before-ams-migration
```

Recommended order:

1. Seed head office store (idempotent)

```sh
cd server
npm run seed:store
```

2. Migrate offices (legacy location/directorate to office model, if applicable)

```sh
cd server
npm run migrate:offices
```

3. Migrate office types to new enum

```sh
cd server
npx tsx scripts/migrate-offices-to-new-types.ts --dry-run
npx tsx scripts/migrate-offices-to-new-types.ts
```

4. Migrate asset item holder fields

```sh
cd server
npm run migrate:assetitem-holders -- --dry-run
npm run migrate:assetitem-holders
```

5. Migrate transfers to line-based workflow

```sh
cd server
npm run migrate:transfer-lines -- --dry-run
npm run migrate:transfer-lines
```

6. Migrate user roles

```sh
cd server
npx tsx scripts/migrate-user-roles.ts --dry-run
npx tsx scripts/migrate-user-roles.ts
```

If a migration result is incorrect, restore backup and rerun from dry-run mode.

## Optional Super Admin Bootstrap

Super admin seeding is disabled by default. To enable one-time bootstrap seeding, set in `server/.env`:

- `SEED_SUPER_ADMIN=true`
- `SUPER_ADMIN_EMAIL=<email>`
- `SUPER_ADMIN_PASSWORD=<strong-password>`

## Troubleshooting

### Transactions error

`Transaction numbers are only allowed on a replica set member or mongos`

Cause: MongoDB is running without replica set mode.
Fix: start MongoDB with `--replSet`, run `rs.initiate(...)`, and keep `?replicaSet=rs0` in `MONGO_URI`.

### Access denied on protected pages

Confirm user has:

- correct role
- valid office/assignment mapping
- required page permission from system settings
