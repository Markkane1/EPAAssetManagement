# Project Name

## Technologies Used

This project is built with:

- [Vite](https://vitejs.dev/)
- [TypeScript](https://www.typescriptlang.org/)
- [React](https://react.dev/)
- [shadcn-ui](https://ui.shadcn.com/)
- [Tailwind CSS](https://tailwindcss.com/)

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

Update `server/.env` with your MongoDB connection string and JWT secret, then run:

```sh
npm run dev
```

### Office migration (required once)

Locations and Directorates are now unified into Offices. Migrate existing data once:

```sh
cd server
npm run migrate:offices
```

### Static super admin

The server seeds a super admin on startup using:

- `SUPER_ADMIN_EMAIL` (default: `admin@example.com`)
- `SUPER_ADMIN_PASSWORD` (default: `Admin123!`)

### Frontend API config

Set the API base URL in the root `.env`:

```sh
VITE_API_BASE_URL="http://localhost:5000/api"
```

Then start the frontend:

```sh
npm run dev
```

### Run full stack

From the project root, run both frontend and backend together:

```sh
npm run dev:full
```
