import { requireAdmin } from "../../../../_lib/session.js";
import { json, errorResponse, withHandler } from "../../../../_lib/util.js";
import { loadInvoiceWithItems, setInvoiceStatus } from "../../../../_lib/invoices.js";

export const onRequestPost = (ctx) =>
  withHandler(async () => {
    const { request, env, params } = ctx;
    await requireAdmin(request, env);
    const invoice = await loadInvoiceWithItems(env, params.id);
    if (!invoice) return errorResponse("Invoice not found", 404);
    if (!["submitted", "under_review"].includes(invoice.status)) {
      return errorResponse("Only a submitted invoice can be approved", 409);
    }
    const updated = await setInvoiceStatus(env, invoice.id, "approved", {
      approved_at: new Date().toISOString(),
    });
    return json({ invoice: updated });
  });
