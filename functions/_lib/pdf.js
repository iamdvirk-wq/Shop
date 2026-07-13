import { PDFDocument, StandardFonts, rgb } from "pdf-lib";
import { formatDateAU } from "./util.js";
import { splitItemAmount } from "./gst.js";

const PAGE_W = 595.28; // A4
const PAGE_H = 841.89;
const MARGIN = 50;
const DARK = rgb(0.12, 0.12, 0.12);
const GREY = rgb(0.45, 0.45, 0.45);
const LINE = rgb(0.82, 0.82, 0.82);

function money(n) {
  return `$${Number(n || 0).toFixed(2)}`;
}

// `invoice` must already have the right subcontractor fields resolved by the
// caller (live profile for drafts, frozen sub_* snapshot for submitted+).
export async function generateInvoicePdf(invoice) {
  const doc = await PDFDocument.create();
  const page = doc.addPage([PAGE_W, PAGE_H]);
  const font = await doc.embedFont(StandardFonts.Helvetica);
  const bold = await doc.embedFont(StandardFonts.HelveticaBold);

  let y = PAGE_H - MARGIN;

  const draw = (text, x, size, useFont, color = DARK) => {
    page.drawText(text ?? "", { x, y, size, font: useFont, color });
  };
  const line = () => {
    page.drawLine({
      start: { x: MARGIN, y },
      end: { x: PAGE_W - MARGIN, y },
      thickness: 0.75,
      color: LINE,
    });
  };

  // Header
  draw("TAX INVOICE", MARGIN, 22, bold);
  const isDraft = invoice.status === "draft";
  const invoiceNumberText = isDraft ? "DRAFT" : invoice.invoice_number;
  draw(invoiceNumberText, PAGE_W - MARGIN - bold.widthOfTextAtSize(invoiceNumberText, 14), 14, bold);
  y -= 18;
  const issueDate = invoice.submitted_at
    ? invoice.submitted_at.slice(0, 10)
    : new Date().toISOString().slice(0, 10);
  const issueDateText = `Issue date: ${formatDateAU(issueDate)}`;
  draw(issueDateText, PAGE_W - MARGIN - font.widthOfTextAtSize(issueDateText, 10), 10, font, GREY);
  y -= 28;
  line();
  y -= 24;

  // From / To
  const colWidth = (PAGE_W - MARGIN * 2) / 2;
  const topY = y;

  draw("FROM (SUPPLIER)", MARGIN, 9, bold, GREY);
  y -= 14;
  draw(invoice.sub_business_name || invoice.sub_legal_name, MARGIN, 11, bold);
  y -= 14;
  if (invoice.sub_business_name && invoice.sub_legal_name !== invoice.sub_business_name) {
    draw(invoice.sub_legal_name, MARGIN, 10, font);
    y -= 13;
  }
  draw(`ABN: ${invoice.sub_abn}`, MARGIN, 10, font);
  y -= 13;
  if (invoice.sub_address) {
    draw(invoice.sub_address, MARGIN, 10, font);
    y -= 13;
  }

  y = topY;
  const rightX = MARGIN + colWidth;
  draw("TO (BUYER)", rightX, 9, bold, GREY);
  y -= 14;
  draw("GRD Virk Pty Ltd", rightX, 11, bold);
  y -= 14;
  draw("ABN: 12 653 868 761", rightX, 10, font);
  y -= 13;

  y = Math.min(y, topY - 14 * 5) - 16;
  line();
  y -= 20;

  // Work period / depot / description
  draw("WORK PERIOD", MARGIN, 9, bold, GREY);
  y -= 13;
  draw(
    `${formatDateAU(invoice.period_start)} to ${formatDateAU(invoice.period_end)}${
      invoice.depot ? `  —  Depot: ${invoice.depot}` : ""
    }`,
    MARGIN,
    10,
    font
  );
  y -= 18;
  draw(invoice.description || "", MARGIN, 10, font, GREY);
  y -= 24;
  line();
  y -= 6;

  // Line item table
  const colDesc = MARGIN;
  const colAmountExGst = PAGE_W - MARGIN - 220;
  const colGst = PAGE_W - MARGIN - 140;
  const colTotal = PAGE_W - MARGIN - 60;

  y -= 16;
  draw("DESCRIPTION", colDesc, 9, bold, GREY);
  draw("EX GST", colAmountExGst, 9, bold, GREY);
  draw("GST", colGst, 9, bold, GREY);
  draw("TOTAL", colTotal, 9, bold, GREY);
  y -= 10;
  line();
  y -= 18;

  const daysAmountInclGst = Number(invoice.days_worked) * Number(invoice.daily_rate_incl_gst);
  const daysSplit = splitItemAmount(daysAmountInclGst, "gst_included");
  const rows = [
    {
      desc: `Normal working days — ${invoice.days_worked} day(s) @ $${Number(
        invoice.daily_rate_incl_gst / 1.1
      ).toFixed(2)}/day plus GST`,
      exGst: daysSplit.amount_excl_gst,
      gst: daysSplit.gst_amount,
      total: daysAmountInclGst,
    },
    ...(invoice.invoice_items || []).map((item) => {
      const split = splitItemAmount(item.amount, item.gst_treatment);
      return {
        desc: `${item.description} ${item.gst_treatment === "no_gst" ? "(no GST)" : "(GST included)"}`,
        exGst: split.amount_excl_gst,
        gst: split.gst_amount,
        total: Number(item.amount),
      };
    }),
  ];

  for (const row of rows) {
    const wrapped = wrapText(row.desc, font, 9.5, colAmountExGst - colDesc - 10);
    for (const [i, ln] of wrapped.entries()) {
      draw(ln, colDesc, 9.5, font);
      if (i === 0) {
        draw(money(row.exGst), colAmountExGst, 9.5, font);
        draw(money(row.gst), colGst, 9.5, font);
        draw(money(row.total), colTotal, 9.5, font);
      }
      y -= 14;
    }
  }

  y -= 6;
  line();
  y -= 20;

  // Totals
  const totalsX = PAGE_W - MARGIN - 220;
  const totalsLabel = (label, value, useFont = font) => {
    draw(label, totalsX, 10, useFont);
    draw(money(value), colTotal, 10, useFont);
    y -= 16;
  };
  totalsLabel("Taxable subtotal (ex GST)", invoice.taxable_subtotal_excl_gst);
  totalsLabel("GST", invoice.gst_amount);
  if (Number(invoice.non_gst_total) > 0) {
    totalsLabel("Non-GST items", invoice.non_gst_total);
  }
  y -= 4;
  totalsLabel("TOTAL PAYABLE", invoice.total_payable, bold);
  y -= 16;
  line();
  y -= 24;

  // Bank details
  draw("PAYMENT DETAILS", MARGIN, 9, bold, GREY);
  y -= 14;
  draw(
    `Account name: ${invoice.sub_bank_account_name || ""}    BSB: ${invoice.sub_bank_bsb || ""}    Account number: ${
      invoice.sub_bank_account_number || ""
    }`,
    MARGIN,
    10,
    font
  );
  y -= 28;
  line();
  y -= 24;

  // Declaration
  draw("DECLARATION", MARGIN, 9, bold, GREY);
  y -= 14;
  const declaredText = invoice.declaration_accepted
    ? `The subcontractor declared this invoice to be true and correct on ${
        invoice.declaration_accepted_at ? formatDateAU(invoice.declaration_accepted_at.slice(0, 10)) : ""
      }.`
    : "Declaration not yet accepted (draft).";
  draw(declaredText, MARGIN, 10, font, GREY);

  return doc.save();
}

function wrapText(text, font, size, maxWidth) {
  const words = (text || "").split(" ");
  const lines = [];
  let current = "";
  for (const word of words) {
    const attempt = current ? `${current} ${word}` : word;
    if (font.widthOfTextAtSize(attempt, size) > maxWidth && current) {
      lines.push(current);
      current = word;
    } else {
      current = attempt;
    }
  }
  if (current) lines.push(current);
  return lines.length ? lines : [""];
}

export function pdfFilename(invoice) {
  const namePart = (invoice.sub_legal_name || "invoice").trim().replace(/\s+/g, "_");
  const numberPart = invoice.invoice_number || "DRAFT";
  const datePart = (invoice.submitted_at || new Date().toISOString()).slice(0, 10);
  const [y, m, d] = datePart.split("-");
  return `${namePart}_${numberPart}_${d}-${m}-${y}.pdf`;
}
