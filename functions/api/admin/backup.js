import { requireAdmin } from "../_lib/session.js";
import { dbGet } from "../_lib/db.js";
import { decryptSecret } from "../_lib/crypto.js";
import { withHandler } from "../_lib/util.js";

// One-click full data export — a plain JSON file containing every
// subcontractor profile and every invoice (with line items and revision
// history). Simple, free, and enough to restore or migrate from later.
export const onRequestGet = (ctx) =>
  withHandler(async () => {
    const { request, env } = ctx;
    await requireAdmin(request, env);

    const subRows = await dbGet(env, "subcontractors?select=*&order=legal_name.asc");
    const subcontractors = await Promise.all(
      subRows.map(async (r) => {
        const { password_encrypted, ...rest } = r;
        return { ...rest, password: await decryptSecret(env, password_encrypted) };
      })
    );

    const invoices = await dbGet(
      env,
      "invoices?select=*,invoice_items(*)&order=created_at.asc"
    );
    const revisions = await dbGet(
      env,
      "invoice_revisions?select=*&order=created_at.asc"
    );

    const backup = {
      generated_at: new Date().toISOString(),
      subcontractors,
      invoices,
      invoice_revisions: revisions,
    };

    const filename = `grd-invoices-backup_${new Date().toISOString().slice(0, 10)}.json`;
    return new Response(JSON.stringify(backup, null, 2), {
      headers: {
        "Content-Type": "application/json",
        "Content-Disposition": `attachment; filename="${filename}"`,
      },
    });
  });
