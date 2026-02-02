import { createCrudController } from './crudController';
import { vendorRepository } from '../repositories/vendor.repository';

export const vendorController = createCrudController({
  repository: vendorRepository,
  createMap: {
    contactInfo: 'contact_info',
  },
  updateMap: {
    contactInfo: 'contact_info',
  },
});
