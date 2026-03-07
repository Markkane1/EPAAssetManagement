# Asset Management System

Asset Management System is a full-stack MERN application for managing organizational assets across central store, offices, and labs. It supports movable and consumable inventory, assignments, transfers, requisitions, returns, maintenance, approvals, notifications, reporting, and role-based access control for operational and audit workflows.

## Tech Stack

- MongoDB
- Express
- React
- Node.js
- TypeScript
- Vite
- Mongoose
- Playwright, Vitest, Jest, Supertest

## Prerequisites

- Node.js 20 or newer
- npm 10 or newer
- MongoDB 6 or newer
- A MongoDB replica set for transactional backend flows

## Installation

1. Clone the repository.
2. Install dependencies from the project root:

```bash
npm install
```

3. Copy the example environment file:

```bash
cp .env.example .env
cp .env.example server/.env
```

PowerShell:

```powershell
Copy-Item .env.example .env
Copy-Item .env.example server/.env
```

4. Update environment values as needed, especially `MONGO_URI`, `JWT_SECRET`, `CORS_ORIGIN`, and `VITE_API_BASE_URL`.

## Run Locally

Frontend:

```bash
npm run dev:client
```

Backend:

```bash
npm run dev:server
```

Run both together:

```bash
npm run dev:full
```

Default local URLs:

- Frontend: `http://localhost:8080`
- Backend API: `http://localhost:5000`

## Test Commands

```bash
npm run test:unit
npm run test:integration
npm run test:components
npm run test:e2e
npm run test:all
```

Additional suites:

```bash
npm run test:security
npm run test:runtime
npm run test:consumables
npm run test:coverage
```

## Folder Structure

```text
client/                React frontend
server/                Express API, models, services, backend scripts
tests/unit/            Pure unit tests and model tests
tests/integration/     Express and runtime integration tests
tests/components/      React Testing Library tests
tests/e2e/             Playwright browser tests
tests/security/        Security-focused tests
docs/                  Discovery, audit, coverage, and project documentation
scripts/               Root utility scripts
```

## Environment Variables

Required and supported variables are documented in `.env.example`. The application currently reads:

- `PORT`
- `MONGO_URI`
- `MONGO_MAX_POOL_SIZE`
- `MONGO_MIN_POOL_SIZE`
- `MONGO_MAX_IDLE_TIME_MS`
- `MONGO_SERVER_SELECTION_TIMEOUT_MS`
- `MONGO_SOCKET_TIMEOUT_MS`
- `MONGO_CONNECT_TIMEOUT_MS`
- `MONGO_HEARTBEAT_FREQUENCY_MS`
- `MONGO_CONNECT_RETRIES`
- `MONGO_CONNECT_RETRY_DELAY_MS`
- `MONGO_RETRY_WRITES`
- `MONGO_RETRY_READS`
- `MONGO_REQUIRE_REPLICA_SET`
- `JWT_SECRET`
- `JWT_EXPIRES_IN`
- `JWT_INVALIDATE_BEFORE`
- `PASSWORD_RESET_TOKEN_TTL_MINUTES`
- `AUTH_LOCKOUT_THRESHOLD`
- `AUTH_LOCKOUT_BASE_MINUTES`
- `AUTH_LOCKOUT_MAX_MINUTES`
- `TRUST_PROXY`
- `COMPRESSION_THRESHOLD_BYTES`
- `COMPRESSION_LEVEL`
- `HTTP_JSON_LIMIT`
- `HTTP_URLENCODED_LIMIT`
- `CACHE_REFERENCE_MAX_AGE_SECONDS`
- `CACHE_REFERENCE_STALE_WHILE_REVALIDATE_SECONDS`
- `RATE_LIMIT_BACKEND`
- `CORS_ORIGIN`
- `SEED_SUPER_ADMIN`
- `SUPER_ADMIN_EMAIL`
- `SUPER_ADMIN_PASSWORD`
- `APP_VERSION`
- `STORAGE_LIMIT_GB`
- `VITE_API_BASE_URL`

## Documentation

See [`docs/`](./docs) for discovery, security, coverage, performance, and audit documentation.
