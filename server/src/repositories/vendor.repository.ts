import { VendorModel } from '../models/vendor.model';
import { createRepository } from './baseRepository';

export const vendorRepository = createRepository(VendorModel);
