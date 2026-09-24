import { createServerFn } from "@tanstack/react-start";
import { toUser } from "@/server/mappers";
import {
  enforceAuthRateLimit,
  getCurrentSessionUser,
  logIn,
  logOut,
  signUp,
} from "@/server/authentication";
import { withErrorBoundary } from "@/server/error-boundary";

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
      return toUser(await logIn(data));
    }),
  );

export const logoutFn = createServerFn({ method: "POST" }).handler(() =>
  withErrorBoundary(async () => {
    await logOut();
  }),
);

export const getCurrentUserFn = createServerFn({ method: "GET" }).handler(() =>
  withErrorBoundary(async () => {
    const user = await getCurrentSessionUser();
    return user ? toUser(user) : null;
  }),
);
