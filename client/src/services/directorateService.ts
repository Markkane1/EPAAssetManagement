import { Directorate } from '@/types';
import { officeService } from './officeService';

export interface DirectorateCreateDto {
  name: string;
  division?: string;
  district?: string;
  address?: string;
  contactNumber?: string;
}

export interface DirectorateUpdateDto {
  name?: string;
  division?: string;
  district?: string;
  address?: string;
  contactNumber?: string;
}

export const directorateService = {
  getAll: () => officeService.getAll() as Promise<Directorate[]>,

  getById: (id: string) => officeService.getById(id) as Promise<Directorate>,

  create: (data: DirectorateCreateDto) =>
    officeService.create({ ...data }) as Promise<Directorate>,

  update: (id: string, data: DirectorateUpdateDto) =>
    officeService.update(id, { ...data }) as Promise<Directorate>,

  delete: (id: string) => officeService.delete(id),
};

export default directorateService;

