type FieldMap = Record<string, string>;

export function mapFields(input: Record<string, unknown>, fieldMap: FieldMap) {
  const output: Record<string, unknown> = {};
  Object.entries(fieldMap).forEach(([dtoKey, dbKey]) => {
    if (input[dtoKey] !== undefined) {
      output[dbKey] = input[dtoKey];
    }
  });
  return output;
}

export function pickDefined<T extends Record<string, unknown>>(input: T): Partial<T> {
  return Object.fromEntries(Object.entries(input).filter(([, value]) => value !== undefined)) as Partial<T>;
}
