import { getSession } from "../_lib/session.js";
import { dbGet } from "../_lib/db.js";
import { json, withHandler } from "../_lib/util.js";

export const onRequestGet = (ctx) =>
  withHandler(async () => {
    const { request, env } = ctx;
    const session = await getSession(request, env);
    if (!session) return json({ role: null });

    if (session.role === "admin") {
      return json({ role: "admin" });
    }

    const rows = await dbGet(
      env,
      `subcontractors?id=eq.${session.id}&select=id,legal_name,business_name,depot,daily_rate_incl_gst,status,bank_account_name,bank_bsb,bank_account_number,address,email,phone,pending_legal_name,pending_business_name,pending_abn,default_vehicle_id`
    );
    const sub = rows && rows[0];
    if (!sub || sub.status !== "active") {
      return json({ role: null });
    }

    return json({ role: "subcontractor", ...sub });
  });
