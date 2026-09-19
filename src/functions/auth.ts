import { createServerFn } from "@tanstack/react-start";
import { toUser } from "@/server/mappers";
import { getCurrentSessionUser, logIn, logOut, signUp } from "@/server/authentication";

export const signupFn = createServerFn({ method: "POST" })
  .validator((data: { name: string; email: string; password: string }) => data)
  .handler(async ({ data }) => toUser(await signUp(data)));

export const loginFn = createServerFn({ method: "POST" })
  .validator((data: { email: string; password: string }) => data)
  .handler(async ({ data }) => toUser(await logIn(data)));

export const logoutFn = createServerFn({ method: "POST" }).handler(async () => {
  await logOut();
});

export const getCurrentUserFn = createServerFn({ method: "GET" }).handler(async () => {
  const user = await getCurrentSessionUser();
  return user ? toUser(user) : null;
});
