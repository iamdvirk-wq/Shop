import { requireAdmin } from "../../../_lib/session.js";
import { dbGet, dbDelete, createSignedUrl } from "../../../_lib/db.js";
import { json, errorResponse, withHandler, requirePin } from "../../../_lib/util.js";

async function loadWithUrls(env, id) {
  const rows = await dbGet(
    env,
    `vehicle_checks?id=eq.${id}&select=*,vehicles(rego,nickname,depot),subcontractors(legal_name,business_name),vehicle_check_items(*)&limit=1`
  );
  const check = rows[0];
  if (!check) return null;

  check.odo_photo_url = await createSignedUrl(env, "vehicle-photos", check.odo_photo_path);
  for (const item of check.vehicle_check_items) {
    item.photo_url = item.photo_path ? await createSignedUrl(env, "vehicle-photos", item.photo_path) : null;
  }
  return check;
}

export const onRequestGet = (ctx) =>
  withHandler(async () => {
    const { request, env, params } = ctx;
    await requireAdmin(request, env);
    const check = await loadWithUrls(env, params.id);
    if (!check) return errorResponse("Check not found", 404);
    return json({ check });
  });

export const onRequestDelete = (ctx) =>
  withHandler(async () => {
    const { request, env, params } = ctx;
    await requireAdmin(request, env);
    const body = await request.json().catch(() => ({}));
    requirePin(body);

    await dbDelete(env, "vehicle_check_items", `vehicle_check_id=eq.${params.id}`);
    await dbDelete(env, "vehicle_checks", `id=eq.${params.id}`);
    return json({ ok: true });
  });
