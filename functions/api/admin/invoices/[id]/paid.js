import { requireAdmin } from "../../../../_lib/session.js";
import { json, errorResponse, withHandler } from "../../../../_lib/util.js";
import { loadInvoiceWithItems, setInvoiceStatus } from "../../../../_lib/invoices.js";

export const onRequestPost = (ctx) =>
  withHandler(async () => {
    const { request, env, params } = ctx;
    await requireAdmin(request, env);
    const invoice = await loadInvoiceWithItems(env, params.id);
    if (!invoice) return errorResponse("Invoice not found", 404);
    if (!["approved", "submitted", "under_review"].includes(invoice.status)) {
      return errorResponse("This invoice cannot be marked paid from its current status", 409);
    }
    const updated = await setInvoiceStatus(env, invoice.id, "paid", {
      paid_at: new Date().toISOString(),
    });
    return json({ invoice: updated });
  });
