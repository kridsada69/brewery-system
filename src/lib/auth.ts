import {createHmac, timingSafeEqual} from "node:crypto";
import {cookies} from "next/headers";

const cookieName = "brewery-session";
export function equalSecret(actual: string, expected: string) {
  const a = Buffer.from(actual);
  const b = Buffer.from(expected);
  return a.length === b.length && timingSafeEqual(a, b);
}
function signature(value: string) {
  const secret = process.env.SESSION_SECRET;
  if (!secret || secret.length < 32) throw new Error("SESSION_SECRET must contain at least 32 characters");
  return createHmac("sha256", secret).update(value).digest("hex");
}
export function createSession(now = Date.now()) {
  const expires = String(now + 7 * 86400000);
  return expires + "." + signature(expires);
}
export function validSession(token: string | undefined, now = Date.now()) {
  if (!token) return false;
  const [expires, signed, extra] = token.split(".");
  return !extra && Number(expires) > now && Number(expires) <= now + 7 * 86400000 &&
    Boolean(signed) && equalSecret(signed, signature(expires));
}
export async function authenticated() {
  return validSession((await cookies()).get(cookieName)?.value);
}
export function sameOrigin(request: Request) {
  const origin = request.headers.get("origin");
  return Boolean(origin && origin === new URL(request.url).origin);
}
export const sessionCookie = cookieName;
