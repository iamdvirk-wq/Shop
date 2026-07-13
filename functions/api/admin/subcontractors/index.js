import { requireAdmin } from "../../../_lib/session.js";
import { dbGet, dbInsert } from "../../../_lib/db.js";
import { encryptSecret, decryptSecret } from "../../../_lib/crypto.js";
import { json, errorResponse, withHandler } from "../../../_lib/util.js";

async function withDecryptedPasswords(env, rows) {
  return Promise.all(
    rows.map(async (r) => {
      const { password_encrypted, ...rest } = r;
      const password = await decryptSecret(env, password_encrypted);
      return { ...rest, password };
    })
  );
}

export const onRequestGet = (ctx) =>
  withHandler(async () => {
    const { request, env } = ctx;
    await requireAdmin(request, env);
    const rows = await dbGet(env, `subcontractors?select=*&order=legal_name.asc`);
    return json({ subcontractors: await withDecryptedPasswords(env, rows) });
  });

const REQUIRED_FIELDS = ["username", "password", "legal_name", "abn", "daily_rate_incl_gst", "invoice_prefix"];

export const onRequestPost = (ctx) =>
  withHandler(async () => {
    const { request, env } = ctx;
    await requireAdmin(request, env);
    const body = await request.json();

    for (const field of REQUIRED_FIELDS) {
      if (!body[field]) return errorResponse(`${field} is required`, 400);
    }

    const password_encrypted = await encryptSecret(env, body.password);

    const row = await dbInsert(env, "subcontractors", {
      username: body.username,
      password_encrypted,
      legal_name: body.legal_name,
      business_name: body.business_name || null,
      abn: body.abn,
      address: body.address || null,
      email: body.email || null,
      phone: body.phone || null,
      bank_account_name: body.bank_account_name || null,
      bank_bsb: body.bank_bsb || null,
      bank_account_number: body.bank_account_number || null,
      daily_rate_incl_gst: body.daily_rate_incl_gst,
      depot: body.depot || null,
      invoice_prefix: body.invoice_prefix.toUpperCase(),
      status: "active",
    });

    const { password_encrypted: _omit, ...rest } = row;
    return json({ subcontractor: { ...rest, password: body.password } }, { status: 201 });
  });
