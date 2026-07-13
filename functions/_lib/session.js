import { signSession, verifySession } from "./crypto.js";
import { parseCookies, errorResponse } from "./util.js";

const COOKIE_NAME = "grd_session";
const SESSION_LENGTH_MS = 1000 * 60 * 60 * 24 * 180; // 180 days — logins don't expire quickly

export async function createSessionCookie(env, payload) {
  const token = await signSession(env, {
    ...payload,
    exp: Date.now() + SESSION_LENGTH_MS,
  });
  const parts = [
    `${COOKIE_NAME}=${token}`,
    "Path=/",
    "HttpOnly",
    "Secure",
    "SameSite=Lax",
    `Max-Age=${SESSION_LENGTH_MS / 1000}`,
  ];
  return parts.join("; ");
}

export function clearSessionCookie() {
  return `${COOKIE_NAME}=; Path=/; HttpOnly; Secure; SameSite=Lax; Max-Age=0`;
}

export async function getSession(request, env) {
  const cookies = parseCookies(request);
  const token = cookies[COOKIE_NAME];
  if (!token) return null;
  return verifySession(env, token);
}

// Throws a Response (not an Error) so route handlers can `return await requireAdmin(...)`-style guard clauses simply.
export async function requireAdmin(request, env) {
  const session = await getSession(request, env);
  if (!session || session.role !== "admin") {
    throw errorResponse("Not authorised", 401);
  }
  return session;
}

export async function requireSubcontractor(request, env) {
  const session = await getSession(request, env);
  if (!session || session.role !== "subcontractor") {
    throw errorResponse("Not authorised", 401);
  }
  return session;
}
