import { dbGet } from "./db.js";
import { sendEmailWithPdf } from "./email.js";

const COPY = {
  approved: "approved",
  rejected: "rejected",
  returned: "returned for correction",
};

// Emails the subcontractor whenever their invoice is approved, rejected, or
// returned for correction — regardless of whether that happened from the
// admin dashboard or from an email quick-action link.
export async function notifyStatusChange(env, invoice, status, note, origin) {
  try {
    const verb = COPY[status];
    if (!verb) return;
    const subRows = await dbGet(env, `subcontractors?id=eq.${invoice.subcontractor_id}&select=email`);
    const email = subRows[0] && subRows[0].email;
    if (!email) return;

    const amount = `$${Number(invoice.total_payable).toFixed(2)}`;
    const html = `
      <p>Your invoice <strong>${invoice.invoice_number}</strong> for <strong>${amount}</strong> has been <strong>${verb}</strong>.</p>
      ${note ? `<p><strong>Note from GRD Virk:</strong> ${note}</p>` : ""}
      ${origin ? `<p><a href="${origin}/">Log in to view your invoices</a></p>` : ""}
    `;

    await sendEmailWithPdf(env, {
      to: email,
      subject: `Invoice ${invoice.invoice_number} ${verb}`,
      html,
    });
  } catch (e) {
    console.error("notifyStatusChange failed:", e);
  }
}
