import { dbGet, dbUpdate, dbInsert } from "../../_lib/db.js";
import { loadInvoiceWithItems, setInvoiceStatus } from "../../_lib/invoices.js";

// Public endpoint (no login) reached by clicking "Approve this invoice" in the
// admin notification email. Authenticated purely by the long random token
// generated at submission time — valid once, then cleared so the link can
// never be reused (forwarded email, clicked twice, etc).
function page({ title, message, tone }) {
  const color = tone === "success" ? "#15803d" : tone === "error" ? "#c0392b" : "#0f2043";
  return new Response(
    `<!doctype html><html><head><meta charset="utf-8" /><meta name="viewport" content="width=device-width, initial-scale=1" />
    <title>${title} — GRD Virk Pty Ltd</title>
    <style>
      body { font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Arial, sans-serif; background:#f3f4f9; margin:0; padding:60px 20px; text-align:center; }
      .card { max-width:420px; margin:0 auto; background:#fff; border-radius:16px; padding:32px 24px; box-shadow:0 8px 24px rgba(6,13,30,0.1); }
      h1 { font-size:20px; color:${color}; margin:0 0 10px; }
      p { color:#444; font-size:15px; line-height:1.5; }
      a { color:#0f2043; font-weight:600; }
    </style></head>
    <body><div class="card"><h1>${title}</h1><p>${message}</p><p><a href="/admin/">Go to dashboard</a></p></div></body></html>`,
    { headers: { "Content-Type": "text/html" }, status: tone === "error" ? 400 : 200 }
  );
}

export const onRequestGet = async ({ request, env, params }) => {
  const token = new URL(request.url).searchParams.get("token");
  if (!token) return page({ title: "Missing link", message: "This approval link is incomplete.", tone: "error" });

  const invoice = await loadInvoiceWithItems(env, params.id);
  if (!invoice) return page({ title: "Not found", message: "This invoice no longer exists.", tone: "error" });

  if (!invoice.approve_token || invoice.approve_token !== token) {
    return page({
      title: "Link already used",
      message: `This approval link has already been used or is no longer valid. Current status: ${invoice.status}.`,
      tone: "error",
    });
  }

  if (!["submitted", "under_review"].includes(invoice.status)) {
    return page({
      title: "Already processed",
      message: `This invoice is already "${invoice.status}" and can't be approved from this link.`,
      tone: "error",
    });
  }

  await dbInsert(env, "invoice_revisions", {
    invoice_id: invoice.id,
    snapshot: invoice,
    changed_by: "admin",
    change_note: "Approved via email link",
  });

  await setInvoiceStatus(env, invoice.id, "approved", {
    approved_at: new Date().toISOString(),
  });
  await dbUpdate(env, "invoices", `id=eq.${invoice.id}`, { approve_token: null });

  return page({
    title: "Invoice approved",
    message: `Invoice ${invoice.invoice_number} (${invoice.sub_legal_name || ""}) has been approved.`,
    tone: "success",
  });
};
