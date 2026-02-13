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
