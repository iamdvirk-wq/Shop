import { requireAdmin } from "../../../_lib/session.js";
import { dbGet, dbUpdate, dbDelete, dbInsert } from "../../../_lib/db.js";
import { json, errorResponse, withHandler } from "../../../_lib/util.js";
import { buildDescription, computeInvoice, loadInvoiceWithItems } from "../../../_lib/invoices.js";

export const onRequestGet = (ctx) =>
  withHandler(async () => {
    const { request, env, params } = ctx;
    await requireAdmin(request, env);
    const invoice = await loadInvoiceWithItems(env, params.id);
    if (!invoice) return errorResponse("Invoice not found", 404);
    return json({ invoice });
  });

// Admin can edit an invoice directly in any status — dates, days, rate,
// description, amounts, GST treatment. No subcontractor reconfirmation is
// required, but the prior version is always kept in invoice_revisions.
export const onRequestPatch = (ctx) =>
  withHandler(async () => {
    const { request, env, params } = ctx;
    await requireAdmin(request, env);
    const invoice = await loadInvoiceWithItems(env, params.id);
    if (!invoice) return errorResponse("Invoice not found", 404);

    const body = await request.json();

    await dbInsert(env, "invoice_revisions", {
      invoice_id: invoice.id,
      snapshot: invoice,
      changed_by: "admin",
      change_note: body.change_note || "Edited by administrator",
    });

    const period_start = body.period_start ?? invoice.period_start;
    const period_end = body.period_end ?? invoice.period_end;
    const days_worked = body.days_worked ?? invoice.days_worked;
    const daily_rate_incl_gst = body.daily_rate_incl_gst ?? invoice.daily_rate_incl_gst;
    const depot = body.depot ?? invoice.depot;
    const items = body.items ?? invoice.invoice_items.map((i) => ({
      description: i.description,
      amount: i.amount,
      gst_treatment: i.gst_treatment,
    }));

    const totals = computeInvoice({ daysWorked: days_worked, dailyRateInclGst: daily_rate_incl_gst, items });
    const description = body.description ?? buildDescription(depot, period_start, period_end, days_worked);

    const patch = {
      period_start,
      period_end,
      days_worked,
      daily_rate_incl_gst,
      depot,
      description,
      ...totals,
      updated_at: new Date().toISOString(),
    };
    if (body.admin_note !== undefined) patch.admin_note = body.admin_note;

    const rows = await dbUpdate(env, "invoices", `id=eq.${invoice.id}`, patch);

    if (body.items) {
      await dbDelete(env, "invoice_items", `invoice_id=eq.${invoice.id}`);
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
    }

    return json({ invoice: { ...rows[0], invoice_items: items } });
  });
