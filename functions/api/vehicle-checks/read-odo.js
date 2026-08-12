import { requireSubcontractor } from "../../_lib/session.js";
import { json, errorResponse, withHandler } from "../../_lib/util.js";
import { readOdometer } from "../../_lib/ai.js";

// Called right after the subcontractor takes the ODO photo, before they've
// submitted anything else. Returns a best-guess reading for them to
// confirm or correct — never persisted or trusted on its own.
export const onRequestPost = (ctx) =>
  withHandler(async () => {
    const { request, env } = ctx;
    await requireSubcontractor(request, env);

    const form = await request.formData();
    const photo = form.get("photo");
    if (!photo || typeof photo === "string") {
      return errorResponse("A photo is required", 400);
    }

    const bytes = new Uint8Array(await photo.arrayBuffer());
    const suggested = await readOdometer(env, bytes);

    return json({ suggested });
  });
