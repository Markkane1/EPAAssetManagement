export type ConsumableRole = 'org_admin' | 'office_head' | 'caretaker' | 'employee';

export type ConsumablePermissions = {
  canManageItems: boolean;
  canManageLocations: boolean;
  canManageSuppliers: boolean;
  canManageLots: boolean;
  canManageContainers: boolean;
  canReceiveCentral: boolean;
  canTransferCentral: boolean;
  canTransferLab: boolean;
  canConsume: boolean;
  canAdjust: boolean;
  canDispose: boolean;
  canReturn: boolean;
  canOpenBalance: boolean;
  canViewReports: boolean;
  canOverrideNegative: boolean;
};

const basePermissions: ConsumablePermissions = {
  canManageItems: false,
  canManageLocations: false,
  canManageSuppliers: false,
  canManageLots: false,
  canManageContainers: false,
  canReceiveCentral: false,
  canTransferCentral: false,
  canTransferLab: false,
  canConsume: false,
  canAdjust: false,
  canDispose: false,
  canReturn: false,
  canOpenBalance: false,
  canViewReports: false,
  canOverrideNegative: false,
};

export function resolveConsumablePermissions(role?: string | null): ConsumablePermissions {
  if (!role) return { ...basePermissions };

  if (role === 'org_admin') {
    return {
      canManageItems: true,
      canManageLocations: true,
      canManageSuppliers: true,
      canManageLots: true,
      canManageContainers: true,
      canReceiveCentral: true,
      canTransferCentral: true,
      canTransferLab: true,
      canConsume: true,
      canAdjust: true,
      canDispose: true,
      canReturn: true,
      canOpenBalance: true,
      canViewReports: true,
      canOverrideNegative: true,
    };
  }

  if (role === 'caretaker') {
    return {
      ...basePermissions,
      canManageItems: true,
      canManageLots: true,
      canManageContainers: true,
      canManageSuppliers: true,
      canReceiveCentral: true,
      canTransferCentral: true,
      canTransferLab: true,
      canConsume: true,
      canAdjust: true,
      canDispose: true,
      canReturn: true,
      canViewReports: true,
    };
  }

  if (role === 'office_head') {
    return {
      ...basePermissions,
      canTransferLab: true,
      canConsume: true,
      canAdjust: true,
      canDispose: true,
      canReturn: true,
      canViewReports: true,
    };
  }

  if (role === 'employee') {
    return {
      ...basePermissions,
      canConsume: true,
      canViewReports: true,
    };
  }

  return { ...basePermissions };
}
