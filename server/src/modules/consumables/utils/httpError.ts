export type HttpError = Error & {
  status?: number;
  details?: unknown;
};

export function createHttpError(status: number, message: string, details?: unknown) {
  const error = new Error(message) as HttpError;
  error.status = status;
  if (details !== undefined) {
    error.details = details;
  }
  return error;
}
