import { EmployeeModel } from '../models/employee.model';
import { createRepository } from './baseRepository';

export const employeeRepository = createRepository(EmployeeModel);
