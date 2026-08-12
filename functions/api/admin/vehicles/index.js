import { requireAdmin } from "../../../_lib/session.js";
import { dbGet, dbInsert } from "../../../_lib/db.js";
import { json, errorResponse, withHandler } from "../../../_lib/util.js";

export const onRequestGet = (ctx) =>
  withHandler(async () => {
    const { request, env } = ctx;
    await requireAdmin(request, env);
    const rows = await dbGet(env, "vehicles?select=*&order=rego.asc");
    return json({ vehicles: rows });
  });

export const onRequestPost = (ctx) =>
  withHandler(async () => {
    const { request, env } = ctx;
    await requireAdmin(request, env);
    const body = await request.json();
    if (!body.rego) return errorResponse("Registration (rego) is required", 400);

    const row = await dbInsert(env, "vehicles", {
      rego: body.rego.trim().toUpperCase(),
      nickname: body.nickname || null,
      depot: body.depot || null,
      status: "active",
    });
    return json({ vehicle: row }, { status: 201 });
  });
