// Uses Cloudflare Workers AI (free, built into your Cloudflare account via
// the "AI" binding) to take a best guess at the number shown in an
// odometer photo. This is always shown to the subcontractor as a
// suggestion they confirm or correct — never trusted blindly — so if the
// model is unavailable or wrong, nothing breaks; they just type the
// reading in themselves.
export async function readOdometer(env, imageBytes) {
  if (!env.AI) return null;
  try {
    const result = await env.AI.run("@cf/llava-hf/llava-1.5-7b-hf", {
      image: Array.from(imageBytes),
      prompt:
        "This photo shows a vehicle odometer or dashboard display. Read the total " +
        "odometer distance number shown. Reply with ONLY the digits (no words, no " +
        "units, no commas). If you cannot clearly read a number, reply UNKNOWN.",
      max_tokens: 20,
    });

    const text = (
      (result && (result.description || result.response || result.text)) || ""
    )
      .toString()
      .trim();

    if (!text || /unknown/i.test(text)) return null;

    const digitsOnly = text.replace(/[^0-9.]/g, "");
    const num = parseFloat(digitsOnly);
    return Number.isFinite(num) && num > 0 ? num : null;
  } catch (e) {
    console.error("AI odometer read failed:", e);
    return null;
  }
}
