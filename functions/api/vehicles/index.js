import { requireSubcontractor } from "../../_lib/session.js";
import { dbGet } from "../../_lib/db.js";
import { json, withHandler } from "../../_lib/util.js";

export const onRequestGet = (ctx) =>
  withHandler(async () => {
    const { request, env } = ctx;
    await requireSubcontractor(request, env);
    const rows = await dbGet(env, "vehicles?status=eq.active&select=id,rego,nickname,depot&order=rego.asc");
    return json({ vehicles: rows });
  });
