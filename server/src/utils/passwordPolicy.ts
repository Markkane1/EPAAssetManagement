export const STRONG_PASSWORD_MIN_LENGTH = 12;
export const STRONG_PASSWORD_MESSAGE =
  'Password must be at least 12 characters and include uppercase, lowercase, number, and symbol';

export function validateStrongPassword(password: string) {
  const normalized = String(password || '');
  if (normalized.length < STRONG_PASSWORD_MIN_LENGTH) {
    return STRONG_PASSWORD_MESSAGE;
  }
  if (!/[a-z]/.test(normalized)) return STRONG_PASSWORD_MESSAGE;
  if (!/[A-Z]/.test(normalized)) return STRONG_PASSWORD_MESSAGE;
  if (!/\d/.test(normalized)) return STRONG_PASSWORD_MESSAGE;
  if (!/[^A-Za-z\d]/.test(normalized)) return STRONG_PASSWORD_MESSAGE;
  return null;
}
