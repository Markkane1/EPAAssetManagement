import { Location } from '@/types';
import { officeService } from './officeService';

export interface LocationCreateDto {
  name: string;
  division?: string;
  district?: string;
  address?: string;
  contactNumber?: string;
}

export interface LocationUpdateDto {
  name?: string;
  division?: string;
  district?: string;
  address?: string;
  contactNumber?: string;
}

export const locationService = {
  getAll: () => officeService.getAll() as Promise<Location[]>,

  getById: (id: string) => officeService.getById(id) as Promise<Location>,

  create: (data: LocationCreateDto) =>
    officeService.create({ ...data }) as Promise<Location>,

  update: (id: string, data: LocationUpdateDto) =>
    officeService.update(id, { ...data }) as Promise<Location>,

  delete: (id: string) => officeService.delete(id),
};

export default locationService;

