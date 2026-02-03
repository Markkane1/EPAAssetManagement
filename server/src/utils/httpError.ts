export type HttpError = Error & { status?: number };

export function createHttpError(status: number, message: string) {
  const error = new Error(message) as HttpError;
  error.status = status;
  return error;
}
