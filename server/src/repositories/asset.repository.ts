import { AssetModel } from '../models/asset.model';
import { createRepository } from './baseRepository';

export const assetRepository = createRepository(AssetModel);
