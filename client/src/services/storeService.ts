import api from '@/lib/api';
import type { Store } from '@/types';

export const storeService = {
  getAll: () => api.get<Store[]>('/stores'),
};

export default storeService;
