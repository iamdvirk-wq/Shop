import { json, errorResponse, withHandler } from "../../../_lib/util.js";
import { buildAndSendWeeklyReport } from "../../../_lib/vehicle-report.js";

// Called by the scheduled GitHub Actions workflow (Monday 5pm Brisbane
// time), not by a logged-in admin — authenticated by a shared secret
// instead of a session cookie, since there's no browser session here.
export const onRequestPost = (ctx) =>
  withHandler(async () => {
    const { request, env } = ctx;
    const providedSecret = request.headers.get("x-cron-secret");
    if (!env.CRON_SECRET || providedSecret !== env.CRON_SECRET) {
      return errorResponse("Not authorised", 401);
    }
    const result = await buildAndSendWeeklyReport(env);
    return json(result);
  });
