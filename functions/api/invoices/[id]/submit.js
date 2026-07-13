import { requireSubcontractor } from "../../../_lib/session.js";
import { dbGet, dbUpdate, dbRpc, dbInsert } from "../../../_lib/db.js";
import { json, errorResponse, withHandler } from "../../../_lib/util.js";
import { findOverlappingInvoice, loadInvoiceWithItems } from "../../../_lib/invoices.js";
import { generateInvoicePdf, pdfFilename } from "../../../_lib/pdf.js";
import { sendEmailWithPdf } from "../../../_lib/email.js";

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

    const fullInvoice = { ...updated[0], invoice_items: invoice.invoice_items };

    // Best-effort email notification — never blocks the submission itself.
    ctx.waitUntil(notifySubmission(env, fullInvoice, sub));

    return json({ invoice: fullInvoice });
  });

async function notifySubmission(env, invoice, sub) {
  try {
    const pdfBytes = await generateInvoicePdf(invoice);
    const filename = pdfFilename(invoice);
    const amount = `$${Number(invoice.total_payable).toFixed(2)}`;
    const html = `<p>Invoice <strong>${invoice.invoice_number}</strong> from <strong>${sub.legal_name}</strong> for <strong>${amount}</strong> has been submitted.</p><p>Period: ${invoice.period_start} to ${invoice.period_end}</p><p>The tax invoice PDF is attached.</p>`;

    const recipients = [env.ADMIN_NOTIFY_EMAIL, sub.email].filter(Boolean);
    await Promise.all(
      recipients.map((to) =>
        sendEmailWithPdf(env, {
          to,
          subject: `Invoice ${invoice.invoice_number} submitted — ${amount}`,
          html,
          pdfBytes,
          filename,
        })
      )
    );
  } catch (e) {
    console.error("notifySubmission failed:", e);
  }
}
