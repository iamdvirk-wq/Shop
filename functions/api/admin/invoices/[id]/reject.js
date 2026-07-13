import { requireAdmin } from "../../../../_lib/session.js";
import { json, errorResponse, withHandler } from "../../../../_lib/util.js";
import { loadInvoiceWithItems, setInvoiceStatus } from "../../../../_lib/invoices.js";

export const onRequestPost = (ctx) =>
  withHandler(async () => {
    const { request, env, params } = ctx;
    await requireAdmin(request, env);
    const body = await request.json().catch(() => ({}));
    const invoice = await loadInvoiceWithItems(env, params.id);
    if (!invoice) return errorResponse("Invoice not found", 404);
    if (["paid", "cancelled"].includes(invoice.status)) {
      return errorResponse("This invoice can no longer be rejected", 409);
    }
    const updated = await setInvoiceStatus(env, invoice.id, "rejected", {
      rejected_at: new Date().toISOString(),
      admin_note: body.note || invoice.admin_note,
    });
    return json({ invoice: updated });
  });
