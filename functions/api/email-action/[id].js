import { dbUpdate, dbInsert } from "../../_lib/db.js";
import { loadInvoiceWithItems, setInvoiceStatus } from "../../_lib/invoices.js";
import { notifyStatusChange } from "../../_lib/notify.js";

// Public endpoint (no login) reached from the buttons in the admin
// notification email. Authenticated purely by the long random token
// generated at submission time — valid once, then cleared so the link can
// never be reused.
//
// Two-step confirm: the first click only shows a confirmation page (never
// changes anything) — this protects against corporate email-security
// scanners that pre-fetch every link in an email. The action only actually
// runs once the admin clicks "Yes" on that page (a second request with
// confirm=1).
const ACTIONS = {
  approve: { status: "approved", label: "approve" },
  reject: { status: "rejected", label: "reject" },
  return: { status: "returned", label: "return for correction" },
};

function page({ title, message, tone, confirmUrl, confirmLabel }) {
  const color = tone === "success" ? "#15803d" : tone === "error" ? "#c0392b" : "#0f2043";
  const button = confirmUrl
    ? `<p><a href="${confirmUrl}" style="background:#0f2043;color:#fff;font-weight:700;font-size:15px;text-decoration:none;padding:12px 24px;border-radius:8px;display:inline-block;">${confirmLabel}</a></p>`
    : "";
  return new Response(
    `<!doctype html><html><head><meta charset="utf-8" /><meta name="viewport" content="width=device-width, initial-scale=1" />
    <title>${title} — GRD Virk Pty Ltd</title>
    <style>
      body { font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Arial, sans-serif; background:#f3f4f9; margin:0; padding:60px 20px; text-align:center; }
      .card { max-width:420px; margin:0 auto; background:#fff; border-radius:16px; padding:32px 24px; box-shadow:0 8px 24px rgba(6,13,30,0.1); }
      h1 { font-size:20px; color:${color}; margin:0 0 10px; }
      p { color:#444; font-size:15px; line-height:1.5; }
      a.link { color:#0f2043; font-weight:600; }
    </style></head>
    <body><div class="card"><h1>${title}</h1><p>${message}</p>${button}<p><a class="link" href="/admin/">Go to dashboard</a></p></div></body></html>`,
    { headers: { "Content-Type": "text/html" }, status: tone === "error" ? 400 : 200 }
  );
}

export const onRequestGet = async ({ request, env, params }) => {
  const url = new URL(request.url);
  const token = url.searchParams.get("token");
  const actionKey = url.searchParams.get("action");
  const confirmed = url.searchParams.get("confirm") === "1";
  const action = ACTIONS[actionKey];

  if (!token || !action) {
    return page({ title: "Invalid link", message: "This link is missing required information.", tone: "error" });
  }

  const invoice = await loadInvoiceWithItems(env, params.id);
  if (!invoice) return page({ title: "Not found", message: "This invoice no longer exists.", tone: "error" });

  if (!invoice.approve_token || invoice.approve_token !== token) {
    return page({
      title: "Link already used",
      message: `This link has already been used or is no longer valid. Current status: ${invoice.status}.`,
      tone: "error",
    });
  }

  if (!["submitted", "under_review"].includes(invoice.status)) {
    return page({
      title: "Already processed",
      message: `This invoice is already "${invoice.status}" and can't be actioned from this link.`,
      tone: "error",
    });
  }

  const amount = `$${Number(invoice.total_payable).toFixed(2)}`;

  if (!confirmed) {
    const confirmUrl = `${url.origin}${url.pathname}?token=${token}&action=${actionKey}&confirm=1`;
    return page({
      title: `Confirm: ${action.label}`,
      message: `Are you sure you want to ${action.label} invoice ${invoice.invoice_number} (${invoice.sub_legal_name || ""}) for ${amount}?`,
      tone: "neutral",
      confirmUrl,
      confirmLabel: `Yes, ${action.label} it`,
    });
  }

  await dbInsert(env, "invoice_revisions", {
    invoice_id: invoice.id,
    snapshot: invoice,
    changed_by: "admin",
    change_note: `${action.label[0].toUpperCase()}${action.label.slice(1)} via email link`,
  });

  const extra = {};
  if (action.status === "approved") extra.approved_at = new Date().toISOString();
  if (action.status === "rejected") extra.rejected_at = new Date().toISOString();

  await setInvoiceStatus(env, invoice.id, action.status, extra);
  await dbUpdate(env, "invoices", `id=eq.${invoice.id}`, { approve_token: null });

  await notifyStatusChange(env, { ...invoice, status: action.status }, action.status, null, url.origin);

  return page({
    title: `Invoice ${action.status === "returned" ? "returned" : action.status}`,
    message: `Invoice ${invoice.invoice_number} for ${amount} has been ${action.status === "returned" ? "returned for correction" : action.status}.`,
    tone: "success",
  });
};
