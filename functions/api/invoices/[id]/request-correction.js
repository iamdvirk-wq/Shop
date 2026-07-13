import { requireSubcontractor } from "../../../_lib/session.js";
import { dbUpdate } from "../../../_lib/db.js";
import { json, errorResponse, withHandler } from "../../../_lib/util.js";
import { loadInvoiceWithItems } from "../../../_lib/invoices.js";

// Subcontractor flags a submitted invoice for the admin's attention. This
// does not change the invoice itself — the admin decides whether to return
// it for editing.
export const onRequestPost = (ctx) =>
  withHandler(async () => {
    const { request, env, params } = ctx;
    const session = await requireSubcontractor(request, env);
    const body = await request.json().catch(() => ({}));

    const invoice = await loadInvoiceWithItems(env, params.id);
    if (!invoice || invoice.subcontractor_id !== session.id) {
      return errorResponse("Invoice not found", 404);
    }
    if (!["submitted", "under_review"].includes(invoice.status)) {
      return errorResponse("A correction can only be requested on a submitted invoice", 409);
    }

    const rows = await dbUpdate(env, "invoices", `id=eq.${invoice.id}`, {
      correction_requested: true,
      correction_note: body.note || null,
      updated_at: new Date().toISOString(),
    });

    return json({ invoice: rows[0] });
  });
