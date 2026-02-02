export type ConsumableRole =
  | 'super_admin'
  | 'admin'
  | 'central_store_admin'
  | 'lab_manager'
  | 'lab_user'
  | 'auditor'
  | 'location_admin'
  | 'user'
  | 'employee'
  | 'directorate_head'
  | 'viewer';

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

  if (role === 'super_admin' || role === 'admin') {
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

  switch (role as ConsumableRole) {
    case 'central_store_admin':
      return {
        ...basePermissions,
        canManageItems: true,
        canManageSuppliers: true,
        canManageLots: true,
        canManageContainers: true,
        canReceiveCentral: true,
        canTransferCentral: true,
        canAdjust: true,
        canViewReports: true,
      };
    case 'lab_manager':
    case 'location_admin':
      return {
        ...basePermissions,
        canTransferLab: true,
        canConsume: true,
        canAdjust: true,
        canDispose: true,
        canReturn: true,
        canViewReports: true,
      };
    case 'lab_user':
    case 'user':
    case 'employee':
    case 'directorate_head':
      return {
        ...basePermissions,
        canConsume: true,
        canViewReports: true,
      };
    case 'auditor':
    case 'viewer':
      return {
        ...basePermissions,
        canViewReports: true,
      };
    default:
      return { ...basePermissions };
  }
}
