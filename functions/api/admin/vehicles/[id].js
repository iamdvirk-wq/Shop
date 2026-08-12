import { requireAdmin } from "../../../_lib/session.js";
import { dbGet, dbUpdate, dbDelete } from "../../../_lib/db.js";
import { json, errorResponse, withHandler, requirePin } from "../../../_lib/util.js";

export const onRequestGet = (ctx) =>
  withHandler(async () => {
    const { request, env, params } = ctx;
    await requireAdmin(request, env);
    const rows = await dbGet(env, `vehicles?id=eq.${params.id}&select=*&limit=1`);
    if (!rows[0]) return errorResponse("Vehicle not found", 404);
    return json({ vehicle: rows[0] });
  });

export const onRequestPatch = (ctx) =>
  withHandler(async () => {
    const { request, env, params } = ctx;
    await requireAdmin(request, env);
    const body = await request.json();
    const patch = {};
    if (body.rego) patch.rego = body.rego.trim().toUpperCase();
    if ("nickname" in body) patch.nickname = body.nickname;
    if ("depot" in body) patch.depot = body.depot;
    if (body.status) patch.status = body.status;
    patch.updated_at = new Date().toISOString();

    const rows = await dbUpdate(env, "vehicles", `id=eq.${params.id}`, patch);
    if (!rows[0]) return errorResponse("Vehicle not found", 404);
    return json({ vehicle: rows[0] });
  });

// Permanently deletes a vehicle and its full check history. Requires the
// admin PIN. Use setting status to "retired" instead for a van that's just
// no longer in service but whose history you want to keep.
export const onRequestDelete = (ctx) =>
  withHandler(async () => {
    const { request, env, params } = ctx;
    await requireAdmin(request, env);
    const body = await request.json().catch(() => ({}));
    requirePin(body);

    const checkRows = await dbGet(env, `vehicle_checks?vehicle_id=eq.${params.id}&select=id`);
    if (checkRows.length > 0) {
      const idList = checkRows.map((r) => r.id).join(",");
      await dbDelete(env, "vehicle_check_items", `vehicle_check_id=in.(${idList})`);
      await dbDelete(env, "vehicle_checks", `vehicle_id=eq.${params.id}`);
    }
    await dbDelete(env, "vehicles", `id=eq.${params.id}`);
    return json({ ok: true });
  });
