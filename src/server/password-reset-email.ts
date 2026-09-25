import { Resend } from "resend";

import { requirePasswordResetEmailConfiguration } from "./env";

export async function sendPasswordResetEmail(
  email: string,
  token: string,
  expiresAt: Date,
): Promise<void> {
  const { apiKey, fromEmail, appBaseUrl } = requirePasswordResetEmailConfiguration();
  const resetUrl = new URL("/reset-password", appBaseUrl);
  resetUrl.searchParams.set("token", token);

  const expiration = `${new Intl.DateTimeFormat("en-US", {
    dateStyle: "medium",
    timeStyle: "short",
    timeZone: "UTC",
  }).format(expiresAt)} UTC`;
  const text = [
    "SpendWise password reset",
    "",
    "We received a request to reset your SpendWise password.",
    `Use this link to choose a new password: ${resetUrl.toString()}`,
    `This link expires at ${expiration}.`,
    "If you did not request this reset, you can ignore this email.",
  ].join("\n");
  const html = [
    "<h1>SpendWise password reset</h1>",
    "<p>We received a request to reset your SpendWise password.</p>",
    `<p><a href="${resetUrl.toString()}">Choose a new password</a></p>`,
    `<p>This link expires at ${expiration}.</p>`,
    "<p>If you did not request this reset, you can ignore this email.</p>",
  ].join("");

  try {
    const resend = new Resend(apiKey);
    const { error } = await resend.emails.send({
      from: fromEmail,
      to: email,
      subject: "Reset your SpendWise password",
      text,
      html,
    });

    if (error) throw new Error("Email provider rejected the request.");
  } catch {
    // Provider errors may contain request details; expose neither those nor the reset URL.
    throw new Error("Password reset email delivery failed.");
  }
}
