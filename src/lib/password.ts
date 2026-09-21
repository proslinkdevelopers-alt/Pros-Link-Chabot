/**
 * Password rules for staff accounts: at least 10 characters with a letter and
 * a digit. Returns a message, or null when the password is acceptable.
 * Dependency-free so the seed, the API and the console form share it.
 */
export function passwordProblem(password: string): string | null {
  if (password.length < 10) return "Use at least 10 characters.";
  if (password.length > 128) return "Use at most 128 characters.";
  if (!/[A-Za-z]/.test(password) || !/\d/.test(password)) return "Include at least one letter and one number.";
  return null;
}
