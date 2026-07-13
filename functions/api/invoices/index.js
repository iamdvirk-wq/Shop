import { requireSubcontractor } from "../../_lib/session.js";
import { dbGet, dbInsert } from "../../_lib/db.js";
import { json, errorResponse, withHandler } from "../../_lib/util.js";
import {
  findOverlappingInvoice,
  buildDescription,
  computeInvoice,
} from "../../_lib/invoices.js";

export const onRequestGet = (ctx) =>
  withHandler(async () => {
    const { request, env } = ctx;
    const session = await requireSubcontractor(request, env);
    const rows = await dbGet(
      env,
      `invoices?subcontractor_id=eq.${session.id}&select=*,invoice_items(*)&order=created_at.desc`
    );
    return json({ invoices: rows });
  });

export const onRequestPost = (ctx) =>
  withHandler(async () => {
    const { request, env } = ctx;
    const session = await requireSubcontractor(request, env);
    const body = await request.json();
    const { period_start, period_end, days_worked, items = [] } = body;

    if (!period_start || !period_end || days_worked === undefined) {
      return errorResponse("Period start, period end and days worked are required", 400);
    }
    if (period_end < period_start) {
      return errorResponse("Period end must be on or after period start", 400);
    }

    const overlap = await findOverlappingInvoice(env, session.id, period_start, period_end, null);
    if (overlap) {
      return errorResponse(
        `This period overlaps invoice ${overlap.invoice_number}, which has already been submitted.`,
        409
      );
    }

    const subRows = await dbGet(
      env,
      `subcontractors?id=eq.${session.id}&select=daily_rate_incl_gst,depot`
    );
    const sub = subRows[0];

    const totals = computeInvoice({
      daysWorked: days_worked,
      dailyRateInclGst: sub.daily_rate_incl_gst,
      items,
    });

    const description = buildDescription(sub.depot, period_start, period_end, days_worked);

    const invoice = await dbInsert(env, "invoices", {
      subcontractor_id: session.id,
      status: "draft",
      period_start,
      period_end,
      days_worked,
      daily_rate_incl_gst: sub.daily_rate_incl_gst,
      depot: sub.depot,
      description,
      ...totals,
    });

    if (items.length > 0) {
      const itemRows = items.map((item, i) => ({
        invoice_id: invoice.id,
        description: item.description,
        amount: item.amount,
        gst_treatment: item.gst_treatment,
        sort_order: i,
      }));
      await dbInsert(env, "invoice_items", itemRows, { returnRow: false });
    }

    return json({ invoice: { ...invoice, invoice_items: items } }, { status: 201 });
  });
