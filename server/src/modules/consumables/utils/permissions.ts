export type ConsumableRole =
  | 'org_admin'
  | 'office_head'
  | 'caretaker'
  | 'employee'
  | 'storekeeper'
  | 'inventory_controller'
  | 'procurement_officer'
  | 'compliance_auditor';

export type ConsumablePermissions = {
  canManageItems: boolean;
  canManageLocations: boolean;
  canManageLots: boolean;
  canManageContainers: boolean;
  canReceiveCentral: boolean;
  canReceiveOffice: boolean;
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
  canManageLots: false,
  canManageContainers: false,
  canReceiveCentral: false,
  canReceiveOffice: false,
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
      canManageLots: true,
      canManageContainers: true,
      canReceiveCentral: true,
      canReceiveOffice: true,
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

  if (role === 'caretaker' || role === 'storekeeper' || role === 'inventory_controller') {
    return {
      ...basePermissions,
      canManageItems: true,
      canManageLots: true,
      canManageContainers: true,
      canReceiveCentral: false,
      canReceiveOffice: true,
      canTransferCentral: false,
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
      canReceiveOffice: true,
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

  if (role === 'compliance_auditor') {
    return {
      ...basePermissions,
      canViewReports: true,
    };
  }

  return { ...basePermissions };
}
