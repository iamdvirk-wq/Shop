import { requireSubcontractor } from "../_lib/session.js";
import { dbUpdate } from "../_lib/db.js";
import { json, withHandler } from "../_lib/util.js";

// Subcontractors can change their own address/contact/bank details directly.
// Bank detail changes get flagged for the admin to notice. Changes to
// legal name / business name / ABN are stored as "pending" until the admin
// approves them — they never overwrite the live values on their own.
export const onRequestPatch = (ctx) =>
  withHandler(async () => {
    const { request, env } = ctx;
    const session = await requireSubcontractor(request, env);
    const body = await request.json();

    const patch = {};
    const now = new Date().toISOString();

    for (const field of ["address", "email", "phone"]) {
      if (field in body) patch[field] = body[field];
    }

    const bankFields = ["bank_account_name", "bank_bsb", "bank_account_number"];
    const changingBank = bankFields.some((f) => f in body);
    if (changingBank) {
      for (const f of bankFields) {
        if (f in body) patch[f] = body[f];
      }
      patch.bank_flagged = true;
      patch.bank_flagged_at = now;
    }

    if (body.requested_legal_name || body.requested_business_name || body.requested_abn) {
      if (body.requested_legal_name) patch.pending_legal_name = body.requested_legal_name;
      if (body.requested_business_name) patch.pending_business_name = body.requested_business_name;
      if (body.requested_abn) patch.pending_abn = body.requested_abn;
      patch.pending_requested_at = now;
    }

    if (Object.keys(patch).length === 0) {
      return json({ ok: true, updated: null });
    }

    patch.updated_at = now;
    const rows = await dbUpdate(env, "subcontractors", `id=eq.${session.id}`, patch);
    return json({ ok: true, updated: rows[0] });
  });
