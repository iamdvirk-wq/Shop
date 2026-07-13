import { requireSubcontractor } from "../../../_lib/session.js";
import { dbGet, dbUpdate, dbRpc, dbInsert } from "../../../_lib/db.js";
import { json, errorResponse, withHandler } from "../../../_lib/util.js";
import { findOverlappingInvoice, loadInvoiceWithItems } from "../../../_lib/invoices.js";

export const onRequestPost = (ctx) =>
  withHandler(async () => {
    const { request, env, params } = ctx;
    const session = await requireSubcontractor(request, env);
    const body = await request.json().catch(() => ({}));

    const invoice = await loadInvoiceWithItems(env, params.id);
    if (!invoice || invoice.subcontractor_id !== session.id) {
      return errorResponse("Invoice not found", 404);
    }
    if (!["draft", "returned"].includes(invoice.status)) {
      return errorResponse("This invoice has already been submitted", 409);
    }
    if (!body.declaration_accepted) {
      return errorResponse("You must tick the declaration before submitting", 400);
    }

    const overlap = await findOverlappingInvoice(
      env,
      session.id,
      invoice.period_start,
      invoice.period_end,
      invoice.id
    );
    if (overlap) {
      return errorResponse(
        `This period overlaps invoice ${overlap.invoice_number}, which has already been submitted.`,
        409
      );
    }

    const subRows = await dbGet(env, `subcontractors?id=eq.${session.id}&select=*`);
    const sub = subRows[0];

    let invoiceNumber = invoice.invoice_number;
    if (!invoiceNumber) {
      invoiceNumber = await dbRpc(env, "next_invoice_number", {
        p_subcontractor_id: session.id,
      });
    }

    const now = new Date().toISOString();

    if (invoice.status === "returned") {
      await dbInsert(env, "invoice_revisions", {
        invoice_id: invoice.id,
        snapshot: invoice,
        changed_by: "subcontractor",
        change_note: "Resubmitted after correction",
      });
    }

    const updated = await dbUpdate(env, "invoices", `id=eq.${invoice.id}`, {
      status: "submitted",
      invoice_number: invoiceNumber,
      declaration_accepted: true,
      declaration_accepted_at: now,
      submitted_at: now,
      correction_requested: false,
      correction_note: null,
      sub_legal_name: sub.legal_name,
      sub_business_name: sub.business_name,
      sub_abn: sub.abn,
      sub_address: sub.address,
      sub_bank_account_name: sub.bank_account_name,
      sub_bank_bsb: sub.bank_bsb,
      sub_bank_account_number: sub.bank_account_number,
      updated_at: now,
    });

    return json({ invoice: { ...updated[0], invoice_items: invoice.invoice_items } });
  });
