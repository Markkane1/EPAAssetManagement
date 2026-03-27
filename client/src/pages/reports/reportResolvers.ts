import type { Employee, Location } from "@/types";

import { isHeadOfficeLocation } from "@/lib/locationUtils";

export function buildIdMap<T extends { id: string }>(items: T[]) {
  return new Map(items.map((item) => [item.id, item] as const));
}

export function findCurrentEmployee(
  employees: Employee[],
  userId?: string | null,
  userEmail?: string | null
) {
  const normalizedEmail = String(userEmail || "").trim().toLowerCase();
  const byUserId = employees.find((employee) => employee.user_id === userId);
  const byEmail = employees.find(
    (employee) => employee.email?.toLowerCase() === normalizedEmail
  );
  return byUserId || byEmail || null;
}

export function buildDirectorateNameResolver(locations: Location[], employees: Employee[]) {
  const locationById = buildIdMap(locations);
  const employeeById = buildIdMap(employees);

  return (employeeId?: string | null) => {
    const employee = employeeId ? employeeById.get(employeeId) : undefined;
    if (!employee) return "N/A";

    const office = employee.location_id ? locationById.get(employee.location_id) : undefined;
    if (!isHeadOfficeLocation(office)) return "N/A";

    const directorate = employee.directorate_id ? locationById.get(employee.directorate_id) : undefined;
    return directorate?.name || "N/A";
  };
}
