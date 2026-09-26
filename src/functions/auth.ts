import { createServerFn } from "@tanstack/react-start";
import { toUser } from "@/server/mappers";
import {
  enforceAuthRateLimit,
  changeCurrentUserPassword,
  getCurrentSessionUser,
  logIn,
  logOut,
  signOutOtherSessions,
  signUp,
} from "@/server/authentication";
import { withErrorBoundary } from "@/server/error-boundary";
import { completePasswordReset, requestPasswordReset } from "@/server/password-reset";
import {
  beginTotpMfaEnrollment,
  confirmTotpMfaEnrollment,
  getTotpMfaStatus,
} from "@/server/totp-enrollment";
import { verifyTotpLogin } from "@/server/totp-login";

// Rate limiting lives at this request boundary: `enforceAuthRateLimit` reads
// the client IP from the live request, and a blocked attempt throws
// TooManyRequestsError which withErrorBoundary maps to HTTP 429.

export const signupFn = createServerFn({ method: "POST" })
  .validator((data: { name: string; email: string; password: string }) => data)
  .handler(({ data }) =>
    withErrorBoundary(async () => {
      enforceAuthRateLimit("signup", data.email);
      return toUser(await signUp(data));
    }),
  );

export const loginFn = createServerFn({ method: "POST" })
  .validator((data: { email: string; password: string }) => data)
  .handler(({ data }) =>
    withErrorBoundary(async () => {
      enforceAuthRateLimit("login", data.email);
      const result = await logIn(data);
      if (result.requiresMfa) {
        return { requiresMfa: true, mfaChallenge: result.mfaChallenge };
      }
      // `result.user` is the canonical UserRecord resolved by `logIn` (see
      // src/server/authentication.ts) — never a partial/ad-hoc shape.
      return { requiresMfa: false, user: toUser(result.user!) };
    }),
  );

export const requestPasswordResetFn = createServerFn({ method: "POST" })
  .validator((data: { email: string }) => data)
  .handler(({ data }) => withErrorBoundary(() => requestPasswordReset(data)));

export const completePasswordResetFn = createServerFn({ method: "POST" })
  .validator((data: { token: string; newPassword: string }) => data)
  .handler(({ data }) => withErrorBoundary(() => completePasswordReset(data)));

export const logoutFn = createServerFn({ method: "POST" }).handler(() =>
  withErrorBoundary(async () => {
    await logOut();
  }),
);

export const changePasswordFn = createServerFn({ method: "POST" })
  .validator((data: { currentPassword: string; newPassword: string }) => data)
  .handler(({ data }) =>
    withErrorBoundary(async () => {
      await changeCurrentUserPassword(data);
      return { ok: true };
    }),
  );

export const signOutOtherSessionsFn = createServerFn({ method: "POST" }).handler(() =>
  withErrorBoundary(async () => {
    await signOutOtherSessions();
    return { ok: true };
  }),
);

export const getCurrentUserFn = createServerFn({ method: "GET" }).handler(() =>
  withErrorBoundary(async () => {
    const user = await getCurrentSessionUser();
    return user ? toUser(user) : null;
  }),
);

export const beginTotpMfaEnrollmentFn = createServerFn({ method: "POST" })
  .validator((data: { currentPassword: string }) => data)
  .handler(({ data }) => withErrorBoundary(() => beginTotpMfaEnrollment(data)));

export const confirmTotpMfaEnrollmentFn = createServerFn({ method: "POST" })
  .validator((data: { code: string }) => data)
  .handler(({ data }) => withErrorBoundary(() => confirmTotpMfaEnrollment(data)));

export const getTotpMfaStatusFn = createServerFn({ method: "GET" }).handler(() =>
  withErrorBoundary(() => getTotpMfaStatus()),
);

export const verifyTotpLoginFn = createServerFn({ method: "POST" })
  .validator((data: { challengeToken: string; code: string }) => data)
  .handler(({ data }) =>
    withErrorBoundary(async () => {
      // The client isn't authenticated yet at this point, so there's no
      // email to key on — the (unguessable, single-use) challenge token
      // fills the same role the email fills for the "login" action.
      enforceAuthRateLimit("mfa", data.challengeToken);
      // `verifyTotpLogin` resolves the canonical UserRecord itself; map it
      // the same way as the non-MFA path above.
      const user = await verifyTotpLogin(data);
      return toUser(user);
    }),
  );
