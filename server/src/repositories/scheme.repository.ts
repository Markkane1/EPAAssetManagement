import { SchemeModel } from '../models/scheme.model';
import { createRepository } from './baseRepository';

export const schemeRepository = createRepository(SchemeModel);
