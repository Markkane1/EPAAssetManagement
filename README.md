# Project Name

## Technologies Used

This project is built with:

- [Vite](https://vitejs.dev/)
- [TypeScript](https://www.typescriptlang.org/)
- [React](https://react.dev/)
- [shadcn-ui](https://ui.shadcn.com/)
- [Tailwind CSS](https://tailwindcss.com/)

Layered structure:
- Client app lives in `client/`
- Backend API lives in `server/`
- Backend tests live in `server/tests/`

## Getting Started

### Prerequisites

The only requirement is having Node.js & npm installed - [install with nvm](https://github.com/nvm-sh/nvm#installing-and-updating).

### Installation

To work locally, follow these steps:

```sh
# Step 1: Clone the repository
git clone <YOUR_GIT_URL>

# Step 2: Navigate to the project directory
cd <YOUR_PROJECT_NAME>

# Step 3: Install the necessary dependencies
npm i

# Step 4: Start the development server with auto-reloading and an instant preview
npm run dev
```

## Backend (MERN)

The Supabase backend has been replaced with a local MERN API. The server lives in `server/` and uses MongoDB.

### Backend setup

```sh
cd server
npm install
cp .env.example .env
```

Update `server/.env` with your MongoDB connection string and a strong JWT secret (32+ chars), then run:

```sh
npm run dev
```

### Office migration (required once)

Locations and Directorates are now unified into Offices. Migrate existing data once:

```sh
cd server
npm run migrate:offices
```

### Office type migration to new enum

Migrate legacy office types (`CENTRAL`/`LAB`/`SUBSTORE`) to:
- `DIRECTORATE`
- `DISTRICT_OFFICE`
- `DISTRICT_LAB`

It also copies `parent_location_id` to `parent_office_id` when needed.

Dry run (no writes):

```sh
cd server
npx tsx scripts/migrate-offices-to-new-types.ts --dry-run
```

Live run:

```sh
cd server
npx tsx scripts/migrate-offices-to-new-types.ts
```

### Seeding head office store

Create the system store record used for head office inventory:

```sh
cd server
npm run seed:store
```

This seed is idempotent; running it multiple times will not create duplicates.

### Asset holder migration (`location_id` -> `holder_type`/`holder_id`)

Deploy code first, then migrate existing asset items so holder fields are populated from legacy `location_id`.

Dry run:

```sh
cd server
npm run migrate:assetitem-holders -- --dry-run
```

Live run:

```sh
cd server
npm run migrate:assetitem-holders
```

### Transfer migration (single item -> multi-line + mediated statuses)

Migrate legacy transfers to `lines[]`, set `store_id` to `HEAD_OFFICE_STORE`, and map old statuses:
- `DISPATCHED` -> `DISPATCHED_TO_DEST`
- `RECEIVED` -> `RECEIVED_AT_DEST`

Dry run:

```sh
cd server
npm run migrate:transfer-lines -- --dry-run
```

Live run:

```sh
cd server
npm run migrate:transfer-lines
```

### Migration runbook (recommended order)

Back up the database before running migrations. Example:

```sh
mongodump --uri "$MONGODB_URI" --out ./backup-before-ams-migration
```

Run in this order:

1. Seed system store

```sh
cd server
npm run seed:store
```

2. Migrate offices (`type`, `parent_office_id`)

```sh
cd server
npx tsx scripts/migrate-offices-to-new-types.ts --dry-run
npx tsx scripts/migrate-offices-to-new-types.ts
```

3. Migrate asset item holders (`location_id` -> holder fields)

```sh
cd server
npm run migrate:assetitem-holders -- --dry-run
npm run migrate:assetitem-holders
```

4. Migrate transfers to line-based workflow

```sh
cd server
npm run migrate:transfer-lines -- --dry-run
npm run migrate:transfer-lines
```

5. Migrate user roles

```sh
cd server
npx tsx scripts/migrate-user-roles.ts --dry-run
npx tsx scripts/migrate-user-roles.ts
```

Rollback notes:
- If a migration fails or results are incorrect, restore from backup.
- Re-run dry-run first before re-applying any failed migration.
- `seed:store` is idempotent and safe to run multiple times.

### Optional startup super admin

Super admin seeding is disabled by default. To enable one-time bootstrap seeding:

- Set `SEED_SUPER_ADMIN=true`
- Set `SUPER_ADMIN_EMAIL`
- Set `SUPER_ADMIN_PASSWORD` (non-default, strong password)

### Client API config

Set the API base URL in the root `.env`:

```sh
VITE_API_BASE_URL="http://localhost:5000/api"
```

Then start the client:

```sh
npm run dev
```

### Run full stack

From the project root, run both client and backend together:

```sh
npm run dev:full
```
