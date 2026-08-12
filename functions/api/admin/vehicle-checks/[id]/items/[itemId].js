import { requireAdmin } from "../../../../../_lib/session.js";
import { dbUpdate } from "../../../../../_lib/db.js";
import { json, withHandler } from "../../../../../_lib/util.js";

// Admin marks a failed checklist item as fixed (or un-marks it).
export const onRequestPatch = (ctx) =>
  withHandler(async () => {
    const { request, env, params } = ctx;
    await requireAdmin(request, env);
    const body = await request.json().catch(() => ({}));

    const patch = { resolved: !!body.resolved };
    if (body.resolved) {
      patch.resolved_at = new Date().toISOString();
      patch.resolved_note = body.resolved_note || null;
    } else {
      patch.resolved_at = null;
      patch.resolved_note = null;
    }

    const rows = await dbUpdate(
      env,
      "vehicle_check_items",
      `id=eq.${params.itemId}&vehicle_check_id=eq.${params.id}`,
      patch
    );
    return json({ item: rows[0] });
  });
