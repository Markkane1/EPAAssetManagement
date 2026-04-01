import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

import bcrypt from "bcryptjs";
import mongoose from "mongoose";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const workspaceRoot = path.resolve(__dirname, "..", "..");
const runtimePath = path.resolve(
  workspaceRoot,
  "..",
  ".ams-test-cache",
  path.basename(workspaceRoot),
  "e2e",
  "runtime.json"
);

type SeedResult = {
  officeId: string;
  userId: string;
  adminId: string;
};

async function clearDatabase() {
  const database = mongoose.connection.db;
  if (!database) return;
  await database.dropDatabase();
}

export async function seedE2E(): Promise<SeedResult> {
  if (!fs.existsSync(runtimePath)) {
    throw new Error(`Playwright runtime metadata was not found at ${runtimePath}`);
  }

  const runtime = JSON.parse(fs.readFileSync(runtimePath, "utf8")) as { mongoUri?: string };
  if (!runtime.mongoUri) {
    throw new Error("Playwright runtime metadata does not contain a mongoUri");
  }

  if (mongoose.connection.readyState === 0) {
    await mongoose.connect(runtime.mongoUri);
  }

  await clearDatabase();

  const officeId = new mongoose.Types.ObjectId();
  const now = new Date();
  await mongoose.connection.collection("offices").insertOne({
    _id: officeId,
    name: "E2E District Office",
    code: "E2E-DO",
    type: "DISTRICT_OFFICE",
    capabilities: {
      moveables: true,
      consumables: true,
      chemicals: false,
    },
    is_active: true,
    created_at: now,
    updated_at: now,
  });

  const [userPasswordHash, adminPasswordHash] = await Promise.all([
    bcrypt.hash("TestPass123!", 10),
    bcrypt.hash("AdminPass123!", 10),
  ]);

  const userId = new mongoose.Types.ObjectId();
  const adminId = new mongoose.Types.ObjectId();

  await mongoose.connection.collection("users").insertMany([
    {
      _id: userId,
      email: "testuser@test.com",
      password_hash: userPasswordHash,
      first_name: "Test",
      last_name: "User",
      role: "employee",
      roles: ["employee"],
      active_role: "employee",
      location_id: officeId,
      is_active: true,
      token_version: 0,
      failed_login_attempts: 0,
      created_at: now,
      updated_at: now,
    },
    {
      _id: adminId,
      email: "admin@test.com",
      password_hash: adminPasswordHash,
      first_name: "Admin",
      last_name: "User",
      role: "org_admin",
      roles: ["org_admin", "office_head"],
      active_role: "org_admin",
      location_id: officeId,
      is_active: true,
      token_version: 0,
      failed_login_attempts: 0,
      created_at: now,
      updated_at: now,
    },
  ]);

  return {
    officeId: String(officeId),
    userId: String(userId),
    adminId: String(adminId),
  };
}

export async function closeSeedConnection() {
  if (mongoose.connection.readyState !== 0) {
    await mongoose.disconnect();
  }
}

if (process.argv[1] && path.resolve(process.argv[1]) === __filename) {
  seedE2E()
    .then(async (result) => {
      console.log(JSON.stringify(result, null, 2));
      await closeSeedConnection();
    })
    .catch(async (error) => {
      console.error(error);
      await closeSeedConnection();
      process.exit(1);
    });
}
