// Sends a plain-HTML email with a PDF attachment via the Resend API.
// Silently does nothing if RESEND_API_KEY isn't configured yet, and never
// throws — a failed notification email should never block an invoice
// submission from succeeding.

function toBase64(bytes) {
  let binary = "";
  const chunkSize = 0x8000;
  for (let i = 0; i < bytes.length; i += chunkSize) {
    binary += String.fromCharCode(...bytes.subarray(i, i + chunkSize));
  }
  return btoa(binary);
}

export async function sendEmailWithPdf(env, { to, subject, html, pdfBytes, filename }) {
  if (!env.RESEND_API_KEY || !to) return;
  try {
    const res = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${env.RESEND_API_KEY}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        from: "GRD Virk Invoices <onboarding@resend.dev>",
        to: [to],
        subject,
        html,
        attachments: [{ filename, content: toBase64(pdfBytes) }],
      }),
    });
    if (!res.ok) {
      console.error("Resend email failed:", res.status, await res.text());
    }
  } catch (e) {
    console.error("Resend email error:", e);
  }
}
