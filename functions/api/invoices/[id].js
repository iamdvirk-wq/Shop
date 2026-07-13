import { requireSubcontractor } from "../../_lib/session.js";
import { dbGet, dbUpdate, dbDelete, dbInsert } from "../../_lib/db.js";
import { json, errorResponse, withHandler } from "../../_lib/util.js";
import {
  findOverlappingInvoice,
  buildDescription,
  computeInvoice,
  loadInvoiceWithItems,
} from "../../_lib/invoices.js";

async function loadOwnInvoice(env, id, subcontractorId) {
  const invoice = await loadInvoiceWithItems(env, id);
  if (!invoice || invoice.subcontractor_id !== subcontractorId) return null;
  return invoice;
}

export const onRequestGet = (ctx) =>
  withHandler(async () => {
    const { request, env, params } = ctx;
    const session = await requireSubcontractor(request, env);
    const invoice = await loadOwnInvoice(env, params.id, session.id);
    if (!invoice) return errorResponse("Invoice not found", 404);
    return json({ invoice });
  });

// Only editable while status is 'draft' or 'returned' (returned = admin sent it back for correction).
export const onRequestPatch = (ctx) =>
  withHandler(async () => {
    const { request, env, params } = ctx;
    const session = await requireSubcontractor(request, env);
    const invoice = await loadOwnInvoice(env, params.id, session.id);
    if (!invoice) return errorResponse("Invoice not found", 404);
    if (!["draft", "returned"].includes(invoice.status)) {
      return errorResponse("This invoice can no longer be edited", 409);
    }

    const body = await request.json();
    const period_start = body.period_start ?? invoice.period_start;
    const period_end = body.period_end ?? invoice.period_end;
    const days_worked = body.days_worked ?? invoice.days_worked;
    const items = body.items ?? invoice.invoice_items.map((i) => ({
      description: i.description,
      amount: i.amount,
      gst_treatment: i.gst_treatment,
    }));

    if (period_end < period_start) {
      return errorResponse("Period end must be on or after period start", 400);
    }

    const overlap = await findOverlappingInvoice(env, session.id, period_start, period_end, invoice.id);
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

    // A returned invoice goes back to 'draft' as soon as the subcontractor starts fixing it.
    const rows = await dbUpdate(env, "invoices", `id=eq.${invoice.id}`, {
      period_start,
      period_end,
      days_worked,
      depot: sub.depot,
      daily_rate_incl_gst: sub.daily_rate_incl_gst,
      description,
      status: "draft",
      ...totals,
      updated_at: new Date().toISOString(),
    });

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

    return json({ invoice: { ...rows[0], invoice_items: items } });
  });

export const onRequestDelete = (ctx) =>
  withHandler(async () => {
    const { request, env, params } = ctx;
    const session = await requireSubcontractor(request, env);
    const invoice = await loadOwnInvoice(env, params.id, session.id);
    if (!invoice) return errorResponse("Invoice not found", 404);
    if (invoice.status !== "draft") {
      return errorResponse("Only drafts can be deleted", 409);
    }
    await dbDelete(env, "invoices", `id=eq.${invoice.id}`);
    return json({ ok: true });
  });
