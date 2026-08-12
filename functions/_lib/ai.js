// Uses Cloudflare Workers AI (free, built into your Cloudflare account via
// the "AI" binding) to take a best guess at the number shown in an
// odometer photo. This is always shown to the subcontractor as a
// suggestion they confirm or correct — never trusted blindly — so if the
// model is unavailable or wrong, nothing breaks; they just type the
// reading in themselves.

const PROMPT =
  "You are looking at a photo of a vehicle's instrument cluster/dashboard. " +
  "A dashboard usually has several different displays — DO NOT read the speedometer " +
  "(the large dial or digital number showing current speed in km/h, typically the biggest " +
  "gauge, front and centre), DO NOT read the tachometer/RPM dial, DO NOT read the fuel " +
  "gauge, and DO NOT read the clock. " +
  "Find ONLY the odometer: a small digital LCD or LED numeric readout, often labelled " +
  "'ODO' or 'TOTAL', showing the TOTAL cumulative distance the vehicle has ever travelled " +
  "— this is normally a longer number, 5 to 6 digits (for example 148203), much longer " +
  "than a speed reading. " +
  "Reply with ONLY those digits and nothing else — no words, no units, no commas, no " +
  "explanation. If you genuinely cannot find or clearly read the odometer display, reply " +
  "exactly: UNKNOWN";

// Tried in order — the first model that returns a usable, plausible reading wins.
const MODELS = ["@cf/meta/llama-3.2-11b-vision-instruct", "@cf/llava-hf/llava-1.5-7b-hf"];

function extractNumber(result) {
  const text = ((result && (result.description || result.response || result.text)) || "")
    .toString()
    .trim();
  if (!text || /unknown/i.test(text)) return null;

  const digitsOnly = text.replace(/[^0-9.]/g, "");
  const num = parseFloat(digitsOnly);
  if (!Number.isFinite(num) || num <= 0) return null;

  // A real odometer reading is almost always at least 3 digits. Anything
  // smaller is far more likely a misread speed/RPM value than a genuine
  // odometer reading, so treat it as unreliable rather than pre-filling a
  // wrong number.
  if (num < 100) return null;

  return num;
}

export async function readOdometer(env, imageBytes) {
  if (!env.AI) return null;
  const imageArray = Array.from(imageBytes);

  for (const model of MODELS) {
    try {
      const result = await env.AI.run(model, {
        image: imageArray,
        prompt: PROMPT,
        max_tokens: 20,
      });
      const num = extractNumber(result);
      if (num !== null) return num;
    } catch (e) {
      console.error(`AI odometer read failed (${model}):`, e);
    }
  }
  return null;
}
