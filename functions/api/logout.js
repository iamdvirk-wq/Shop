import { clearSessionCookie } from "../_lib/session.js";
import { json, withHandler } from "../_lib/util.js";

export const onRequestPost = () =>
  withHandler(async () => {
    return json({ ok: true }, { headers: { "Set-Cookie": clearSessionCookie() } });
  });
