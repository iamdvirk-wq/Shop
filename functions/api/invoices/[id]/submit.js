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
    const approveToken = crypto.randomUUID();

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
      approve_token: approveToken,
      updated_at: now,
    });

    const fullInvoice = { ...updated[0], invoice_items: invoice.invoice_items };
    const origin = new URL(request.url).origin;

    // Best-effort email notification — never blocks the submission itself.
    ctx.waitUntil(notifySubmission(env, fullInvoice, sub, origin));

    return json({ invoice: fullInvoice });
  });

async function notifySubmission(env, invoice, sub, origin) {
  try {
    const pdfBytes = await generateInvoicePdf(invoice);
    const filename = pdfFilename(invoice);
    const amount = `$${Number(invoice.total_payable).toFixed(2)}`;
    const summary = `<p>Invoice <strong>${invoice.invoice_number}</strong> from <strong>${sub.legal_name}</strong> for <strong>${amount}</strong> has been submitted.</p><p>Period: ${invoice.period_start} to ${invoice.period_end}</p><p>The tax invoice PDF is attached.</p>`;
    const subject = `Invoice ${invoice.invoice_number} submitted — ${amount}`;

    const jobs = [];

    if (env.ADMIN_NOTIFY_EMAIL) {
      const actionUrl = (action) => `${origin}/api/email-action/${invoice.id}?token=${invoice.approve_token}&action=${action}`;
      const dashboardUrl = `${origin}/admin/invoice.html?id=${invoice.id}`;
      const adminHtml = `
        ${summary}
        <table role="presentation" cellpadding="0" cellspacing="0" style="margin:20px 0;">
          <tr><td style="padding-bottom:10px;">
            <a href="${actionUrl("approve")}" style="background:#c99a3f;color:#0b1730;font-weight:700;font-size:15px;text-decoration:none;padding:13px 26px;border-radius:8px;display:inline-block;">Approve this invoice</a>
          </td></tr>
          <tr><td style="padding-bottom:10px;">
            <a href="${actionUrl("return")}" style="background:#ffffff;color:#0f2043;border:1.5px solid #0f2043;font-weight:600;font-size:14px;text-decoration:none;padding:11px 24px;border-radius:8px;display:inline-block;">Return for correction</a>
          </td></tr>
          <tr><td>
            <a href="${actionUrl("reject")}" style="background:#ffffff;color:#c0392b;border:1.5px solid #c0392b;font-weight:600;font-size:14px;text-decoration:none;padding:11px 24px;border-radius:8px;display:inline-block;">Reject</a>
          </td></tr>
        </table>
        <p style="font-size:13px;color:#667085;">Each button asks you to confirm before it takes effect, and can only be used once. To edit the invoice first, <a href="${dashboardUrl}">open it in the dashboard</a> instead.</p>
      `;
      jobs.push(
        sendEmailWithPdf(env, { to: env.ADMIN_NOTIFY_EMAIL, subject, html: adminHtml, pdfBytes, filename })
      );
    }

    if (sub.email) {
      const subHtml = `${summary}<p>Thanks — we'll let you know once it's been reviewed.</p>`;
      jobs.push(sendEmailWithPdf(env, { to: sub.email, subject, html: subHtml, pdfBytes, filename }));
    }

    await Promise.all(jobs);
  } catch (e) {
    console.error("notifySubmission failed:", e);
  }
}
