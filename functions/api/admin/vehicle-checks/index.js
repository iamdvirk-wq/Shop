import { requireAdmin } from "../../../_lib/session.js";
import { dbGet } from "../../../_lib/db.js";
import { json, withHandler } from "../../../_lib/util.js";

export const onRequestGet = (ctx) =>
  withHandler(async () => {
    const { request, env } = ctx;
    await requireAdmin(request, env);
    const url = new URL(request.url);
    const q = url.searchParams;

    const filters = [
      "select=*,vehicles(rego,nickname,depot),subcontractors(legal_name,business_name),vehicle_check_items(item_key,result)",
    ];
    if (q.get("vehicle_id")) filters.push(`vehicle_id=eq.${q.get("vehicle_id")}`);
    if (q.get("week_start")) filters.push(`week_start_date=eq.${q.get("week_start")}`);
    if (q.get("has_issues")) filters.push(`has_issues=eq.${q.get("has_issues")}`);
    filters.push("order=created_at.desc");

    const rows = await dbGet(env, `vehicle_checks?${filters.join("&")}`);
    return json({ checks: rows });
  });
