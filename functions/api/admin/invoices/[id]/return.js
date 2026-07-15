import { requireAdmin } from "../../../../_lib/session.js";
import { json, errorResponse, withHandler } from "../../../../_lib/util.js";
import { loadInvoiceWithItems, setInvoiceStatus } from "../../../../_lib/invoices.js";
import { notifyStatusChange } from "../../../../_lib/notify.js";

// Returns an invoice to the subcontractor for correction. It stays locked
// to the same invoice number — the subcontractor edits and resubmits it.
export const onRequestPost = (ctx) =>
  withHandler(async () => {
    const { request, env, params } = ctx;
    await requireAdmin(request, env);
    const body = await request.json().catch(() => ({}));
    const invoice = await loadInvoiceWithItems(env, params.id);
    if (!invoice) return errorResponse("Invoice not found", 404);
    if (!["submitted", "under_review"].includes(invoice.status)) {
      return errorResponse("Only a submitted invoice can be returned for correction", 409);
    }
    const updated = await setInvoiceStatus(env, invoice.id, "returned", {
      admin_note: body.note || invoice.admin_note,
      correction_requested: false,
    });
    ctx.waitUntil(notifyStatusChange(env, updated, "returned", body.note, new URL(request.url).origin));
    return json({ invoice: updated });
  });
