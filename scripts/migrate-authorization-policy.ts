import mongoose, { Types } from "mongoose";
import * as db from "../server/src/config/db";
import * as userModel from "../server/src/models/user.model";
import * as officeModel from "../server/src/models/office.model";
import * as systemSettingsModel from "../server/src/models/systemSettings.model";
import * as authorizationPolicy from "../server/src/config/authorizationPolicy";
import * as roles from "../server/src/utils/roles";

type UserRecord = {
  _id: Types.ObjectId;
  email?: string | null;
  role?: string | null;
  roles?: string[] | null;
  active_role?: string | null;
  location_id?: Types.ObjectId | null;
};

type OfficeRecord = {
  _id: Types.ObjectId;
  type?: string | null;
  is_active?: boolean | null;
};

type MigrationOptions = {
  apply: boolean;
  promoteHeadOfficeOfficeHeads: boolean;
};

function hasFlag(flag: string) {
  return process.argv.includes(flag);
}

function normalizeCanonicalRoleList(input: unknown, fallbackRole?: string | null) {
  return roles.default.normalizeRoles(input, fallbackRole, { allowEmpty: true });
}

function shouldPromoteHeadOfficeAdmin(
  roles: string[],
  officeType: string | null,
  options: MigrationOptions
) {
  if (!options.promoteHeadOfficeOfficeHeads) return false;
  return officeType === "HEAD_OFFICE" && roles.includes("office_head");
}

function normalizePersistedUser(
  user: UserRecord,
  officeType: string | null,
  options: MigrationOptions
) {
  const canonicalRoles = normalizeCanonicalRoleList(user.roles, user.role);
  const promoted = shouldPromoteHeadOfficeAdmin(canonicalRoles, officeType, options);
  const promotedRoles = promoted
    ? Array.from(
        new Set(
          canonicalRoles.map((role) =>
            role === "office_head" ? "head_office_admin" : role
          )
        )
      )
    : canonicalRoles;
  const nextRole = promotedRoles[0] || "employee";
  const nextActiveRole = roles.default.resolveActiveRole(
    promoted &&
      String(user.active_role || "").trim().toLowerCase() === "office_head"
      ? "head_office_admin"
      : user.active_role,
    promotedRoles
  );

  const normalized = {
    role: nextRole,
    roles: promotedRoles,
    active_role: nextActiveRole,
  };

  const currentRoles = Array.isArray(user.roles)
    ? user.roles.map((role) => String(role || "").trim().toLowerCase()).filter(Boolean)
    : [];
  const currentRole = String(user.role || "").trim().toLowerCase();
  const currentActiveRole = String(user.active_role || "").trim().toLowerCase();

  const changed =
    currentRole !== normalized.role ||
    currentActiveRole !== normalized.active_role ||
    JSON.stringify(currentRoles) !== JSON.stringify(normalized.roles);

  return {
    changed,
    promoted,
    normalized,
  };
}

function normalizeRoleListForPolicy(input: unknown) {
  return roles.default.normalizeRoles(input, null, { allowEmpty: true }).filter((role) =>
    authorizationPolicy.default.AUTHORIZATION_ROLE_ID_SET.has(role)
  );
}

function normalizeRolePermissions(settings: Record<string, unknown>) {
  const rolePermissions =
    settings.role_permissions && typeof settings.role_permissions === "object"
      ? (settings.role_permissions as Record<string, unknown>)
      : null;
  if (!rolePermissions || !Array.isArray(rolePermissions.roles)) {
    return null;
  }

  const roles = rolePermissions.roles.map((entry) => {
    const record =
      entry && typeof entry === "object" ? (entry as Record<string, unknown>) : {};
    const normalizedId = normalizeCanonicalRoleList([], String(record.id || ""))[0];
    const normalizedSourceRoles = normalizeRoleListForPolicy(
      record.sourceRoles ?? record.source_roles
    );
    return {
      ...record,
      id: normalizedId || String(record.id || "").trim().toLowerCase(),
      sourceRoles: normalizedSourceRoles,
    };
  });

  return {
    ...rolePermissions,
    roles,
  };
}

function normalizeAccessPolicies(settings: Record<string, unknown>) {
  const accessPolicies =
    settings.access_policies && typeof settings.access_policies === "object"
      ? (settings.access_policies as Record<string, unknown>)
      : null;
  if (!accessPolicies || !accessPolicies.rules || typeof accessPolicies.rules !== "object") {
    return null;
  }

  const rules = Object.entries(accessPolicies.rules as Record<string, unknown>).reduce(
    (acc, [key, value]) => {
      const record = value && typeof value === "object" ? (value as Record<string, unknown>) : {};
      acc[key] = {
        ...record,
        allowed_roles: normalizeRoleListForPolicy(record.allowed_roles),
        denied_roles: normalizeRoleListForPolicy(record.denied_roles),
      };
      return acc;
    },
    {} as Record<string, Record<string, unknown>>
  );

  return {
    ...accessPolicies,
    rules,
  };
}

function normalizeApprovalMatrix(settings: Record<string, unknown>) {
  const approvalMatrix =
    settings.approval_matrix && typeof settings.approval_matrix === "object"
      ? (settings.approval_matrix as Record<string, unknown>)
      : null;
  if (!approvalMatrix || !Array.isArray(approvalMatrix.rules)) {
    return null;
  }

  const rules = approvalMatrix.rules.map((entry) => {
    const record =
      entry && typeof entry === "object" ? (entry as Record<string, unknown>) : {};
    return {
      ...record,
      approver_roles: normalizeRoleListForPolicy(record.approver_roles),
    };
  });

  return {
    ...approvalMatrix,
    rules,
  };
}

function printSection(title: string, lines: string[]) {
  console.log(`\n${title}`);
  if (lines.length === 0) {
    console.log("  (none)");
    return;
  }
  lines.forEach((line) => console.log(`  ${line}`));
}

async function run() {
  const options: MigrationOptions = {
    apply: hasFlag("--apply"),
    promoteHeadOfficeOfficeHeads: hasFlag("--promote-head-office-office-heads"),
  };

  console.warn("WARNING: Back up the database before applying this migration.");
  console.log(`Mode: ${options.apply ? "APPLY" : "DRY RUN"}`);
  console.log(
    `Head office office_head promotion: ${
      options.promoteHeadOfficeOfficeHeads ? "enabled" : "disabled"
    }`
  );

  try {
    await db.default.connectDatabase();

    const offices = (await officeModel.default.OfficeModel.find(
      {},
      { _id: 1, type: 1, is_active: 1 }
    )
      .lean()
      .exec()) as OfficeRecord[];
    const officeTypeById = new Map(
      offices.map((office) => [String(office._id), String(office.type || "").trim().toUpperCase() || null])
    );

    const users = (await userModel.default.UserModel.find(
      {},
      { _id: 1, email: 1, role: 1, roles: 1, active_role: 1, location_id: 1 }
    )
      .lean()
      .exec()) as UserRecord[];

    const userUpdates: Array<{ updateOne: { filter: { _id: Types.ObjectId }; update: { $set: Record<string, unknown> } } }> =
      [];
    const userChangeLines: string[] = [];
    const headOfficeAdminAnomalyLines: string[] = [];
    let promotedUserCount = 0;

    users.forEach((user) => {
      const officeType = user.location_id
        ? officeTypeById.get(String(user.location_id)) || null
        : null;
      const normalized = normalizePersistedUser(user, officeType, options);
      if (normalized.promoted) {
        promotedUserCount += 1;
      }
      if (
        normalized.normalized.role === "head_office_admin" &&
        officeType !== "HEAD_OFFICE"
      ) {
        headOfficeAdminAnomalyLines.push(
          `${user.email || user._id.toString()}: head_office_admin assigned to ${officeType || "[no office]"}`
        );
      }
      if (!normalized.changed) return;
      userChangeLines.push(
        `${user.email || user._id.toString()}: role=${String(user.role || "").trim().toLowerCase() || "[empty]"} -> ${normalized.normalized.role}, active_role=${String(user.active_role || "").trim().toLowerCase() || "[empty]"} -> ${normalized.normalized.active_role}, roles=[${normalized.normalized.roles.join(", ")}]`
      );
      userUpdates.push({
        updateOne: {
          filter: { _id: user._id },
          update: {
            $set: normalized.normalized,
          },
        },
      });
    });

    const settings = (await systemSettingsModel.default.SystemSettingsModel.findOne().lean().exec()) as
      | (Record<string, unknown> & { _id?: Types.ObjectId })
      | null;

    const normalizedRolePermissions = settings
      ? normalizeRolePermissions(settings)
      : null;
    const normalizedAccessPolicies = settings
      ? normalizeAccessPolicies(settings)
      : null;
    const normalizedApprovalMatrix = settings
      ? normalizeApprovalMatrix(settings)
      : null;

    const settingsUpdates: Record<string, unknown> = {};
    const settingsChangeLines: string[] = [];

    if (
      settings &&
      normalizedRolePermissions &&
      JSON.stringify(settings.role_permissions || null) !==
        JSON.stringify(normalizedRolePermissions)
    ) {
      settingsUpdates.role_permissions = normalizedRolePermissions;
      settingsChangeLines.push("Normalized role_permissions role ids and sourceRoles.");
    }

    if (
      settings &&
      normalizedAccessPolicies &&
      JSON.stringify(settings.access_policies || null) !==
        JSON.stringify(normalizedAccessPolicies)
    ) {
      settingsUpdates.access_policies = normalizedAccessPolicies;
      settingsChangeLines.push("Normalized access_policies allowed_roles and denied_roles.");
    }

    if (
      settings &&
      normalizedApprovalMatrix &&
      JSON.stringify(settings.approval_matrix || null) !==
        JSON.stringify(normalizedApprovalMatrix)
    ) {
      settingsUpdates.approval_matrix = normalizedApprovalMatrix;
      settingsChangeLines.push("Normalized approval_matrix approver_roles.");
    }

    printSection("Authorization policy snapshot", [
      `version=${authorizationPolicy.default.buildAuthorizationPolicyDocument().version}`,
      `roles=${authorizationPolicy.default.buildAuthorizationPolicyDocument().roles.map((role) => role.id).join(", ")}`,
      `promoted_head_office_users=${promotedUserCount}`,
    ]);
    printSection("User updates", userChangeLines);
    printSection("Settings updates", settingsChangeLines);
    printSection("Head office admin anomalies", headOfficeAdminAnomalyLines);

    if (!options.apply) {
      console.log("\nDry run complete. No writes were applied.");
      return;
    }

    if (userUpdates.length > 0) {
      await userModel.default.UserModel.bulkWrite(userUpdates, { ordered: false });
    }
    if (settings?._id && Object.keys(settingsUpdates).length > 0) {
      await systemSettingsModel.default.SystemSettingsModel.updateOne(
        { _id: settings._id },
        {
          $set: settingsUpdates,
        }
      ).exec();
    }

    console.log("\nMigration applied successfully.");
    console.log(`Users updated: ${userUpdates.length}`);
    console.log(`Settings updated: ${Object.keys(settingsUpdates).length > 0 ? 1 : 0}`);
  } catch (error) {
    console.error("Migration failed:", error);
    process.exitCode = 1;
  } finally {
    await mongoose.disconnect();
  }
}

run();
