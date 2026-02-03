import mongoose, { Schema } from 'mongoose';
import { baseSchemaOptions } from './base';

const CounterSchema = new Schema(
  {
    // Unique counter key (e.g. OFFICE:TYPE:YEAR)
    key: { type: String, required: true, unique: true },
    // Current sequence value
    seq: { type: Number, required: true, default: 0 },
  },
  baseSchemaOptions
);

export const CounterModel = mongoose.model('Counter', CounterSchema);
