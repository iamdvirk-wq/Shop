import { dbGet, dbUpdate } from "./db.js";
import { computeInvoiceTotals } from "./gst.js";
import { formatDateAU, round2 } from "./util.js";

const BLOCKING_STATUSES = ["submitted", "under_review", "approved", "paid"];

// A subcontractor cannot submit a period that overlaps one of their own
// previously submitted/approved/paid invoices. Drafts, returned, rejected
// and cancelled invoices never block a period.
export async function findOverlappingInvoice(env, subcontractorId, periodStart, periodEnd, excludeInvoiceId) {
  const statusFilter = `status=in.(${BLOCKING_STATUSES.join(",")})`;
  let path =
    `invoices?subcontractor_id=eq.${subcontractorId}&${statusFilter}` +
    `&period_start=lte.${periodEnd}&period_end=gte.${periodStart}&select=id,invoice_number,period_start,period_end`;
  const rows = await dbGet(env, path);
  return rows.find((r) => r.id !== excludeInvoiceId) || null;
}

export function buildDescription(depot, periodStart, periodEnd, daysWorked) {
  const depotPart = depot ? ` at ${depot}` : "";
  return `Delivery subcontracting services${depotPart} for the period ${formatDateAU(
    periodStart
  )} to ${formatDateAU(periodEnd)} — ${daysWorked} day${daysWorked === 1 ? "" : "s"} worked.`;
}

// Recomputes every derived field for an invoice from its raw inputs.
// items: [{ description, amount, gst_treatment }]
export function computeInvoice({ daysWorked, dailyRateInclGst, items }) {
  const normalDaysTotal = round2(Number(daysWorked) * Number(dailyRateInclGst));
  const totals = computeInvoiceTotals(normalDaysTotal, items);
  return totals;
}

export async function loadInvoiceWithItems(env, invoiceId) {
  const rows = await dbGet(
    env,
    `invoices?id=eq.${invoiceId}&select=*,invoice_items(*)&limit=1`
  );
  return rows && rows[0];
}

export async function setInvoiceStatus(env, invoiceId, status, extraPatch = {}) {
  const rows = await dbUpdate(env, "invoices", `id=eq.${invoiceId}`, {
    status,
    ...extraPatch,
    updated_at: new Date().toISOString(),
  });
  return rows[0];
}
