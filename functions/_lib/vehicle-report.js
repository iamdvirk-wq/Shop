import { dbGet } from "./db.js";
import { sendEmailWithPdf } from "./email.js";
import { currentWeekStartDate, weekLabel } from "./week.js";

async function previousReading(env, vehicleId, beforeWeekStart) {
  const rows = await dbGet(
    env,
    `vehicle_checks?vehicle_id=eq.${vehicleId}&week_start_date=lt.${beforeWeekStart}&select=odo_reading,week_start_date&order=week_start_date.desc&limit=1`
  );
  return rows[0] || null;
}

export async function buildAndSendWeeklyReport(env) {
  if (!env.ADMIN_NOTIFY_EMAIL) return { sent: false, reason: "ADMIN_NOTIFY_EMAIL not configured" };

  const weekStart = currentWeekStartDate();
  const vehicles = await dbGet(env, "vehicles?status=eq.active&select=id,rego,nickname&order=rego.asc");
  const checks = await dbGet(
    env,
    `vehicle_checks?week_start_date=eq.${weekStart}&select=*,subcontractors(legal_name),vehicle_check_items(item_key,item_label,result,note)`
  );
  const checkByVehicle = new Map(checks.map((c) => [c.vehicle_id, c]));

  const rows = [];
  const missing = [];

  for (const vehicle of vehicles) {
    const check = checkByVehicle.get(vehicle.id);
    if (!check) {
      missing.push(vehicle);
      continue;
    }
    const prev = await previousReading(env, vehicle.id, weekStart);
    const km = prev ? Math.round((check.odo_reading - prev.odo_reading) * 10) / 10 : null;
    const failedItems = check.vehicle_check_items.filter((i) => i.result === "fail");
    rows.push({ vehicle, check, km, failedItems });
  }

  const money = (n) => (n === null || n === undefined ? "—" : `${n} km`);

  const summaryRows = rows
    .map(
      (r) => `
      <tr>
        <td style="padding:8px;border-bottom:1px solid #e3e6ee;">${r.vehicle.rego}${r.vehicle.nickname ? ` (${r.vehicle.nickname})` : ""}</td>
        <td style="padding:8px;border-bottom:1px solid #e3e6ee;">${r.check.subcontractors?.legal_name || ""}</td>
        <td style="padding:8px;border-bottom:1px solid #e3e6ee;">${r.check.odo_reading}</td>
        <td style="padding:8px;border-bottom:1px solid #e3e6ee;">${money(r.km)}</td>
        <td style="padding:8px;border-bottom:1px solid #e3e6ee;color:${r.failedItems.length ? "#c0392b" : "#15803d"};">
          ${r.failedItems.length ? r.failedItems.map((f) => `${f.item_label.split(" — ")[0]}: ${f.note || ""}`).join("<br>") : "No issues"}
        </td>
      </tr>`
    )
    .join("");

  const missingRows = missing.length
    ? `<p><strong>Not checked this week:</strong> ${missing.map((v) => `${v.rego}${v.nickname ? ` (${v.nickname})` : ""}`).join(", ")}</p>`
    : `<p>All active vehicles have been checked this week.</p>`;

  const html = `
    <h2 style="color:#0f2043;">Weekly vehicle check report — ${weekLabel(weekStart)}</h2>
    <table role="presentation" cellpadding="0" cellspacing="0" style="width:100%;border-collapse:collapse;font-family:sans-serif;font-size:14px;">
      <thead>
        <tr style="text-align:left;color:#667085;font-size:12px;text-transform:uppercase;">
          <th style="padding:8px;">Vehicle</th>
          <th style="padding:8px;">Checked by</th>
          <th style="padding:8px;">ODO</th>
          <th style="padding:8px;">KM this week</th>
          <th style="padding:8px;">Issues</th>
        </tr>
      </thead>
      <tbody>${summaryRows || `<tr><td style="padding:8px;" colspan="5">No checks submitted yet this week.</td></tr>`}</tbody>
    </table>
    ${missingRows}
  `;

  await sendEmailWithPdf(env, {
    to: env.ADMIN_NOTIFY_EMAIL,
    subject: `Vehicle check report — ${weekLabel(weekStart)}`,
    html,
  });

  return { sent: true, week_start: weekStart, checked: rows.length, missing: missing.length };
}
