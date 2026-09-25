export function validateForgotPasswordEmail(email: string): string | null {
  return /^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email.trim())
    ? null
    : "Enter a valid email address.";
}

export function getResetTokenFromSearch(search: Record<string, unknown>): string | undefined {
  return typeof search["token"] === "string" ? search["token"] : undefined;
}

export function validateResetPasswordFields(
  password: string,
  confirmation: string,
): { password?: string; confirmation?: string } {
  const errors: { password?: string; confirmation?: string } = {};

  if (password.length < 8) errors.password = "Use at least 8 characters.";
  if (confirmation !== password) errors.confirmation = "Passwords do not match.";

  return errors;
}
