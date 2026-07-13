import { dbGet } from "../_lib/db.js";
import { decryptSecret } from "../_lib/crypto.js";
import { createSessionCookie } from "../_lib/session.js";
import { json, errorResponse, withHandler } from "../_lib/util.js";

export const onRequestPost = (ctx) =>
  withHandler(async () => {
    const { request, env } = ctx;
    const body = await request.json();
    const password = body.password;
    // Usernames are not case-sensitive: always compare in lowercase.
    const username = (body.username || "").trim().toLowerCase();

    if (!username || !password) {
      return errorResponse("Username and password are required", 400);
    }

    // Master administrator login
    if (username === env.ADMIN_USERNAME.toLowerCase() && password === env.ADMIN_PASSWORD) {
      const cookie = await createSessionCookie(env, { role: "admin" });
      return json(
        { role: "admin" },
        { headers: { "Set-Cookie": cookie } }
      );
    }

    // Subcontractor login
    const rows = await dbGet(
      env,
      `subcontractors?username=eq.${encodeURIComponent(username)}&select=*&limit=1`
    );
    const sub = rows && rows[0];

    if (!sub || sub.status !== "active") {
      return errorResponse("Invalid username or password", 401);
    }

    const storedPassword = await decryptSecret(env, sub.password_encrypted);
    if (storedPassword !== password) {
      return errorResponse("Invalid username or password", 401);
    }

    const cookie = await createSessionCookie(env, {
      role: "subcontractor",
      id: sub.id,
    });

    return json(
      {
        role: "subcontractor",
        id: sub.id,
        legal_name: sub.legal_name,
        depot: sub.depot,
      },
      { headers: { "Set-Cookie": cookie } }
    );
  });
