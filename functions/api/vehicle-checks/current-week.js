import { requireSubcontractor } from "../../_lib/session.js";
import { dbGet } from "../../_lib/db.js";
import { json, withHandler } from "../../_lib/util.js";
import { currentWeekStartDate, weekLabel } from "../../_lib/week.js";

// Powers the "pick a vehicle" screen: every active vehicle, plus whether
// it's already been checked this week (and by whom), so a subcontractor
// can see at a glance what still needs doing.
export const onRequestGet = (ctx) =>
  withHandler(async () => {
    const { request, env } = ctx;
    await requireSubcontractor(request, env);

    const weekStart = currentWeekStartDate();
    const vehicles = await dbGet(env, "vehicles?status=eq.active&select=id,rego,nickname,depot,type&order=rego.asc");
    const checks = await dbGet(
      env,
      `vehicle_checks?week_start_date=eq.${weekStart}&select=vehicle_id,created_at,has_issues,subcontractors(legal_name)`
    );

    const byVehicle = new Map(checks.map((c) => [c.vehicle_id, c]));
    const vehiclesWithStatus = vehicles.map((v) => {
      const check = byVehicle.get(v.id);
      return {
        ...v,
        checked_this_week: !!check,
        checked_by: check ? check.subcontractors?.legal_name : null,
        checked_at: check ? check.created_at : null,
        has_issues: check ? check.has_issues : false,
      };
    });

    return json({ week_start: weekStart, week_label: weekLabel(weekStart), vehicles: vehiclesWithStatus });
  });
