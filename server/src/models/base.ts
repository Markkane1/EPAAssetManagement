import { SchemaOptions } from 'mongoose';

export const baseSchemaOptions: SchemaOptions<any> = {
  timestamps: { createdAt: 'created_at', updatedAt: 'updated_at' },
  toJSON: {
    virtuals: true,
    versionKey: false,
    transform: (_doc: any, ret: any) => {
      ret.id = ret._id?.toString?.() ?? ret._id ?? null;
      delete ret._id;
    },
  },
};
