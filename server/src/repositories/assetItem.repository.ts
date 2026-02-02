import { AssetItemModel } from '../models/assetItem.model';
import { createRepository } from './baseRepository';

export const assetItemRepository = createRepository(AssetItemModel);
