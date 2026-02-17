/**
 * API Configuration File
 * 
 * This file centralizes all API-related configuration for the application.
 * Update these settings when switching between different backends or environments.
 */

export const API_CONFIG = {
  // Backend type: 'supabase' | 'rest' - determines which service layer to use
  backend: 'rest' as const,
  
  // Query configuration for React Query
  query: {
    staleTime: 5 * 60 * 1000, // 5 minutes - data is considered fresh for this duration
    cacheTime: 10 * 60 * 1000, // 10 minutes - unused data remains in cache
    refetchOnWindowFocus: true, // Refetch data when window regains focus
    retry: 3, // Number of retry attempts for failed queries
    retryDelay: (attemptIndex: number) => Math.min(1000 * 2 ** attemptIndex, 30000),
  },
  
  // Toast messages configuration
  messages: {
    // Categories
    categoryCreated: 'Category created successfully',
    categoryUpdated: 'Category updated successfully',
    categoryDeleted: 'Category deleted successfully',
    categoryError: 'Failed to process category',
    
    // Locations
    locationCreated: 'Location created successfully',
    locationUpdated: 'Location updated successfully',
    locationDeleted: 'Location deleted successfully',
    locationError: 'Failed to process location',
    
    // Directorates
    directorateCreated: 'Directorate created successfully',
    directorateUpdated: 'Directorate updated successfully',
    directorateDeleted: 'Directorate deleted successfully',
    directorateError: 'Failed to process directorate',

    // Divisions
    divisionCreated: 'Division created successfully',
    divisionUpdated: 'Division updated successfully',
    divisionDeleted: 'Division deleted successfully',
    divisionError: 'Failed to process division',

    // Districts
    districtCreated: 'District created successfully',
    districtUpdated: 'District updated successfully',
    districtDeleted: 'District deleted successfully',
    districtError: 'Failed to process district',

    // Offices
    officeCreated: 'Office created successfully',
    officeUpdated: 'Office updated successfully',
    officeDeleted: 'Office deleted successfully',
    officeError: 'Failed to process office',
    
    // Employees
    employeeCreated: 'Employee created successfully',
    employeeUpdated: 'Employee updated successfully',
    employeeDeleted: 'Employee deleted successfully',
    employeeError: 'Failed to process employee',
    
    // Vendors
    vendorCreated: 'Vendor created successfully',
    vendorUpdated: 'Vendor updated successfully',
    vendorDeleted: 'Vendor deleted successfully',
    vendorError: 'Failed to process vendor',
    
    // Assets
    assetCreated: 'Asset created successfully',
    assetUpdated: 'Asset updated successfully',
    assetDeleted: 'Asset deleted successfully',
    assetError: 'Failed to process asset',
    
    // Asset Items
    assetItemCreated: 'Asset item created successfully',
    assetItemUpdated: 'Asset item updated successfully',
    assetItemDeleted: 'Asset item deleted successfully',
    assetItemError: 'Failed to process asset item',
    
    // Assignments
    assignmentCreated: 'Assignment created successfully',
    assignmentUpdated: 'Assignment updated successfully',
    assignmentDeleted: 'Assignment deleted successfully',
    assetReturned: 'Asset returned successfully',
    assignmentError: 'Failed to process assignment',
    
    // Projects
    projectCreated: 'Project created successfully',
    projectUpdated: 'Project updated successfully',
    projectDeleted: 'Project deleted successfully',
    projectError: 'Failed to process project',
    
    // Purchase Orders
    purchaseOrderCreated: 'Purchase order created successfully',
    purchaseOrderUpdated: 'Purchase order updated successfully',
    purchaseOrderDeleted: 'Purchase order deleted successfully',
    purchaseOrderError: 'Failed to process purchase order',
    
    // Maintenance
    maintenanceCreated: 'Maintenance record created successfully',
    maintenanceUpdated: 'Maintenance record updated successfully',
    maintenanceCompleted: 'Maintenance completed successfully',
    maintenanceDeleted: 'Maintenance record deleted successfully',
    maintenanceError: 'Failed to process maintenance record',

    // Transfers
    transferCreated: 'Transfer created successfully',
    transferUpdated: 'Transfer status updated successfully',
    transferDeleted: 'Transfer deleted successfully',
    transferError: 'Failed to process transfer',
    

    // Consumables (Lab)
    consumableItemCreated: 'Consumable item created successfully',
    consumableItemUpdated: 'Consumable item updated successfully',
    consumableItemDeleted: 'Consumable item deleted successfully',
    consumableItemError: 'Failed to process consumable item',
    consumableLotCreated: 'Lot created successfully',
    consumableLotUpdated: 'Lot updated successfully',
    consumableLotDeleted: 'Lot deleted successfully',
    consumableLotError: 'Failed to process lot',
    consumableUnitCreated: 'Unit created successfully',
    consumableUnitUpdated: 'Unit updated successfully',
    consumableUnitDeleted: 'Unit deleted successfully',
    consumableUnitError: 'Failed to process unit',
    consumableTxnSuccess: 'Inventory transaction recorded',
    consumableTxnError: 'Failed to record inventory transaction',
  },
  
  // Query keys for cache management
  queryKeys: {
    categories: ['categories'] as const,
    offices: ['offices'] as const,
    locations: ['locations'] as const,
    directorates: ['directorates'] as const,
    divisions: ['divisions'] as const,
    districts: ['districts'] as const,
    employees: ['employees'] as const,
    vendors: ['vendors'] as const,
    assets: ['assets'] as const,
    assetItems: ['assetItems'] as const,
    assignments: ['assignments'] as const,
    projects: ['projects'] as const,
    schemes: ['schemes'] as const,
    purchaseOrders: ['purchaseOrders'] as const,
    maintenance: ['maintenance'] as const,
    dashboard: ['dashboard'] as const,
    settings: ['settings'] as const,
    consumableItems: ['consumableItems'] as const,
    consumableLots: ['consumableLots'] as const,
    consumableUnits: ['consumableUnits'] as const,
    consumableContainers: ['consumableContainers'] as const,
    consumableBalances: ['consumableBalances'] as const,
    consumableLedger: ['consumableLedger'] as const,
    consumableExpiry: ['consumableExpiry'] as const,
    consumableReasonCodes: ['consumableReasonCodes'] as const,
    transfers: ['transfers'] as const,
  },
} as const;

export type BackendType = typeof API_CONFIG.backend;
export type QueryKeys = typeof API_CONFIG.queryKeys;
