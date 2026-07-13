import { round2 } from "./util.js";

// GST is always calculated on the total taxable amount, not per line, to
// avoid small rounding differences across many lines (this matches the
// agreed spec).
//
// normalDaysTotalInclGst: days_worked * daily_rate_incl_gst (always GST-included, not optional)
// items: [{ amount, gst_treatment: 'gst_included' | 'no_gst' }]
export function computeInvoiceTotals(normalDaysTotalInclGst, items) {
  let taxableInclGst = round2(normalDaysTotalInclGst);
  let nonGstTotal = 0;

  for (const item of items) {
    const amount = Number(item.amount) || 0;
    if (item.gst_treatment === "gst_included") {
      taxableInclGst = round2(taxableInclGst + amount);
    } else {
      nonGstTotal = round2(nonGstTotal + amount);
    }
  }

  const gstAmount = round2(taxableInclGst / 11);
  const taxableSubtotalExclGst = round2(taxableInclGst - gstAmount);
  const totalPayable = round2(taxableInclGst + nonGstTotal);

  return {
    taxable_subtotal_excl_gst: taxableSubtotalExclGst,
    gst_amount: gstAmount,
    non_gst_total: nonGstTotal,
    total_payable: totalPayable,
  };
}

// Per-line breakdown, used only for display on the PDF/preview (the totals
// above, calculated on the combined total, are always the source of truth).
export function splitItemAmount(amount, gstTreatment) {
  amount = Number(amount) || 0;
  if (gstTreatment === "gst_included") {
    const gst = round2(amount / 11);
    return { amount_excl_gst: round2(amount - gst), gst_amount: gst };
  }
  return { amount_excl_gst: amount, gst_amount: 0 };
}
