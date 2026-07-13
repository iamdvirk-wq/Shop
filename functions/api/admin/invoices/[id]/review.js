import { requireAdmin } from "../../../../_lib/session.js";
import { json, errorResponse, withHandler } from "../../../../_lib/util.js";
import { loadInvoiceWithItems, setInvoiceStatus } from "../../../../_lib/invoices.js";

// Marks a submitted invoice as "under review" so it's clear you've started
// looking at it, without yet approving, rejecting or returning it.
export const onRequestPost = (ctx) =>
  withHandler(async () => {
    const { request, env, params } = ctx;
    await requireAdmin(request, env);
    const invoice = await loadInvoiceWithItems(env, params.id);
    if (!invoice) return errorResponse("Invoice not found", 404);
    if (invoice.status !== "submitted") {
      return errorResponse("Only a newly submitted invoice can be marked under review", 409);
    }
    const updated = await setInvoiceStatus(env, invoice.id, "under_review");
    return json({ invoice: updated });
  });
