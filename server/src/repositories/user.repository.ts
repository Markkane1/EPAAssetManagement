import { UserModel } from '../models/user.model';
import { createRepository } from './baseRepository';

export const userRepository = createRepository(UserModel);
