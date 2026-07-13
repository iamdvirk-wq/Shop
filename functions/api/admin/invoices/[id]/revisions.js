import { requireAdmin } from "../../../../_lib/session.js";
import { dbGet } from "../../../../_lib/db.js";
import { json, withHandler } from "../../../../_lib/util.js";

export const onRequestGet = (ctx) =>
  withHandler(async () => {
    const { request, env, params } = ctx;
    await requireAdmin(request, env);
    const rows = await dbGet(
      env,
      `invoice_revisions?invoice_id=eq.${params.id}&select=*&order=created_at.desc`
    );
    return json({ revisions: rows });
  });
