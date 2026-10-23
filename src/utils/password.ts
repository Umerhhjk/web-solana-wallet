// src/utils/password.ts
export function validatePassword(password: string): { isValid: boolean; error: string } {
  if (password.length < 8) return { isValid: false, error: 'Password must be at least 8 characters.' };
  if (!/[A-Z]/.test(password)) return { isValid: false, error: 'Must contain an uppercase letter.' };
  if (!/[a-z]/.test(password)) return { isValid: false, error: 'Must contain a lowercase letter.' };
  if (!/[0-9]/.test(password)) return { isValid: false, error: 'Must contain a number.' };
  if (!/[!@#$%^&*(),.?":{}|<>]/.test(password)) return { isValid: false, error: 'Must contain a special character.' };
  
  return { isValid: true, error: '' };
}