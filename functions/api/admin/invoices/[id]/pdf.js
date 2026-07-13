import { requireAdmin } from "../../../../_lib/session.js";
import { dbGet } from "../../../../_lib/db.js";
import { errorResponse, withHandler } from "../../../../_lib/util.js";
import { loadInvoiceWithItems } from "../../../../_lib/invoices.js";
import { generateInvoicePdf, pdfFilename } from "../../../../_lib/pdf.js";

export const onRequestGet = (ctx) =>
  withHandler(async () => {
    const { request, env, params } = ctx;
    await requireAdmin(request, env);

    const invoice = await loadInvoiceWithItems(env, params.id);
    if (!invoice) return errorResponse("Invoice not found", 404);

    if (invoice.status === "draft") {
      const subRows = await dbGet(env, `subcontractors?id=eq.${invoice.subcontractor_id}&select=*`);
      const sub = subRows[0];
      Object.assign(invoice, {
        sub_legal_name: sub.legal_name,
        sub_business_name: sub.business_name,
        sub_abn: sub.abn,
        sub_address: sub.address,
        sub_bank_account_name: sub.bank_account_name,
        sub_bank_bsb: sub.bank_bsb,
        sub_bank_account_number: sub.bank_account_number,
      });
    }

    const bytes = await generateInvoicePdf(invoice);
    return new Response(bytes, {
      headers: {
        "Content-Type": "application/pdf",
        "Content-Disposition": `attachment; filename="${pdfFilename(invoice)}"`,
      },
    });
  });
