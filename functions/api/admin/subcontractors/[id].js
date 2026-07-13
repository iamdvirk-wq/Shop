import { requireAdmin } from "../../../_lib/session.js";
import { dbGet, dbUpdate } from "../../../_lib/db.js";
import { encryptSecret, decryptSecret } from "../../../_lib/crypto.js";
import { json, errorResponse, withHandler } from "../../../_lib/util.js";

async function loadOne(env, id) {
  const rows = await dbGet(env, `subcontractors?id=eq.${id}&select=*&limit=1`);
  return rows[0];
}

export const onRequestGet = (ctx) =>
  withHandler(async () => {
    const { request, env, params } = ctx;
    await requireAdmin(request, env);
    const sub = await loadOne(env, params.id);
    if (!sub) return errorResponse("Subcontractor not found", 404);
    const { password_encrypted, ...rest } = sub;
    const password = await decryptSecret(env, password_encrypted);
    return json({ subcontractor: { ...rest, password } });
  });

const DIRECT_FIELDS = [
  "username", "legal_name", "business_name", "abn", "address", "email", "phone",
  "bank_account_name", "bank_bsb", "bank_account_number",
  "daily_rate_incl_gst", "depot", "invoice_prefix", "status",
];

export const onRequestPatch = (ctx) =>
  withHandler(async () => {
    const { request, env, params } = ctx;
    await requireAdmin(request, env);
    const sub = await loadOne(env, params.id);
    if (!sub) return errorResponse("Subcontractor not found", 404);

    const body = await request.json();
    const patch = {};

    for (const field of DIRECT_FIELDS) {
      if (field in body) patch[field] = body[field];
    }
    if (patch.invoice_prefix) patch.invoice_prefix = patch.invoice_prefix.toUpperCase();

    if (body.password) {
      patch.password_encrypted = await encryptSecret(env, body.password);
    }

    if (body.clear_bank_flag) {
      patch.bank_flagged = false;
      patch.bank_flagged_at = null;
    }

    if (body.approve_pending) {
      if (sub.pending_legal_name) patch.legal_name = sub.pending_legal_name;
      if (sub.pending_business_name) patch.business_name = sub.pending_business_name;
      if (sub.pending_abn) patch.abn = sub.pending_abn;
      patch.pending_legal_name = null;
      patch.pending_business_name = null;
      patch.pending_abn = null;
      patch.pending_requested_at = null;
    } else if (body.reject_pending) {
      patch.pending_legal_name = null;
      patch.pending_business_name = null;
      patch.pending_abn = null;
      patch.pending_requested_at = null;
    }

    patch.updated_at = new Date().toISOString();

    const rows = await dbUpdate(env, "subcontractors", `id=eq.${params.id}`, patch);
    const { password_encrypted, ...rest } = rows[0];
    const password = await decryptSecret(env, password_encrypted);
    return json({ subcontractor: { ...rest, password } });
  });
