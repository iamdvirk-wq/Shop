import { requireAdmin } from "../../../_lib/session.js";
import { dbGet } from "../../../_lib/db.js";
import { json, withHandler } from "../../../_lib/util.js";

export const onRequestGet = (ctx) =>
  withHandler(async () => {
    const { request, env } = ctx;
    await requireAdmin(request, env);
    const url = new URL(request.url);
    const q = url.searchParams;

    const filters = ["select=*,invoice_items(*),subcontractors(legal_name,business_name,depot)"];

    if (q.get("subcontractor_id")) {
      filters.push(`subcontractor_id=eq.${q.get("subcontractor_id")}`);
    }
    if (q.get("status")) {
      filters.push(`status=eq.${q.get("status")}`);
    }
    if (q.get("invoice_number")) {
      filters.push(`invoice_number=ilike.*${q.get("invoice_number")}*`);
    }
    if (q.get("period_from")) {
      filters.push(`period_end=gte.${q.get("period_from")}`);
    }
    if (q.get("period_to")) {
      filters.push(`period_start=lte.${q.get("period_to")}`);
    }
    if (q.get("amount_min")) {
      filters.push(`total_payable=gte.${q.get("amount_min")}`);
    }
    if (q.get("amount_max")) {
      filters.push(`total_payable=lte.${q.get("amount_max")}`);
    }

    filters.push("order=created_at.desc");

    const rows = await dbGet(env, `invoices?${filters.join("&")}`);

    const totals = rows.reduce(
      (acc, r) => {
        acc.taxable_subtotal_excl_gst += Number(r.taxable_subtotal_excl_gst) || 0;
        acc.gst_amount += Number(r.gst_amount) || 0;
        acc.non_gst_total += Number(r.non_gst_total) || 0;
        acc.total_payable += Number(r.total_payable) || 0;
        return acc;
      },
      { taxable_subtotal_excl_gst: 0, gst_amount: 0, non_gst_total: 0, total_payable: 0 }
    );
    for (const key of Object.keys(totals)) totals[key] = Math.round(totals[key] * 100) / 100;

    return json({ invoices: rows, totals });
  });
