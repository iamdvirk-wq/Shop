import { requireSubcontractor } from "../../_lib/session.js";
import { dbGet, dbInsert, storageUpload } from "../../_lib/db.js";
import { json, errorResponse, withHandler } from "../../_lib/util.js";
import { checklistForType } from "../../_lib/checklist.js";
import { currentWeekStartDate } from "../../_lib/week.js";

export const onRequestGet = (ctx) =>
  withHandler(async () => {
    const { request, env } = ctx;
    const session = await requireSubcontractor(request, env);
    const rows = await dbGet(
      env,
      `vehicle_checks?subcontractor_id=eq.${session.id}&select=*,vehicles(rego,nickname),vehicle_check_items(*)&order=created_at.desc&limit=50`
    );
    return json({ checks: rows });
  });

export const onRequestPost = (ctx) =>
  withHandler(async () => {
    const { request, env } = ctx;
    const session = await requireSubcontractor(request, env);
    const form = await request.formData();

    const vehicleId = form.get("vehicle_id");
    const odoReading = parseFloat(form.get("odo_reading"));
    const odoAiSuggested = form.get("odo_ai_suggested") ? parseFloat(form.get("odo_ai_suggested")) : null;
    const capturedLive = form.get("odo_captured_live") === "true";
    const takenAt = form.get("odo_taken_at") || null;
    const fileModifiedAt = form.get("odo_file_modified_at") || null;
    const odoPhoto = form.get("odo_photo");
    const declarationAccepted = form.get("declaration_accepted") === "true";
    let items;
    try {
      items = JSON.parse(form.get("items_json") || "[]");
    } catch {
      return errorResponse("Invalid checklist data", 400);
    }

    if (!vehicleId) return errorResponse("Please choose a vehicle", 400);
    if (!Number.isFinite(odoReading) || odoReading <= 0) {
      return errorResponse("Please enter a valid odometer reading", 400);
    }
    if (!odoPhoto || typeof odoPhoto === "string") {
      return errorResponse("An odometer photo is required", 400);
    }
    if (!declarationAccepted) {
      return errorResponse("Please confirm the declaration before submitting", 400);
    }

    const vehicleRows = await dbGet(env, `vehicles?id=eq.${vehicleId}&select=id,rego,status,type`);
    const vehicle = vehicleRows[0];
    if (!vehicle || vehicle.status !== "active") {
      return errorResponse("That vehicle is not available", 400);
    }

    const checklistItems = checklistForType(vehicle.type);
    const knownKeys = new Set(checklistItems.map((i) => i.key));
    if (!Array.isArray(items) || items.length !== checklistItems.length) {
      return errorResponse("The full checklist must be completed", 400);
    }
    for (const item of items) {
      if (!knownKeys.has(item.key)) return errorResponse("Unknown checklist item", 400);
      if (!["pass", "fail"].includes(item.result)) return errorResponse("Invalid checklist result", 400);
      if (item.result === "fail" && !item.note?.trim()) {
        return errorResponse(`Please add a note explaining the issue with "${item.label}"`, 400);
      }
    }

    const weekStart = currentWeekStartDate();
    const existing = await dbGet(
      env,
      `vehicle_checks?vehicle_id=eq.${vehicleId}&week_start_date=eq.${weekStart}&select=id,subcontractors(legal_name)`
    );
    if (existing.length > 0) {
      const who = existing[0].subcontractors?.legal_name || "someone";
      return errorResponse(`${vehicle.rego} has already been checked this week (by ${who}).`, 409);
    }

    const folder = `${vehicleId}/${weekStart}`;
    const odoBytes = new Uint8Array(await odoPhoto.arrayBuffer());
    await storageUpload(env, "vehicle-photos", `${folder}/odo.jpg`, odoBytes, "image/jpeg");

    const itemsWithPhotos = [];
    for (const item of items) {
      const photoField = form.get(`photo_${item.key}`);
      let photoPath = null;
      if (photoField && typeof photoField !== "string") {
        const bytes = new Uint8Array(await photoField.arrayBuffer());
        photoPath = `${folder}/${item.key}.jpg`;
        await storageUpload(env, "vehicle-photos", photoPath, bytes, "image/jpeg");
      }
      itemsWithPhotos.push({ ...item, photo_path: photoPath });
    }

    const hasIssues = items.some((i) => i.result === "fail");
    const now = new Date().toISOString();

    const check = await dbInsert(env, "vehicle_checks", {
      vehicle_id: vehicleId,
      subcontractor_id: session.id,
      week_start_date: weekStart,
      odo_reading: odoReading,
      odo_ai_suggested: odoAiSuggested,
      odo_photo_path: `${folder}/odo.jpg`,
      odo_photo_captured_live: capturedLive,
      odo_photo_taken_at: takenAt,
      odo_photo_file_modified_at: fileModifiedAt,
      odo_photo_uploaded_at: now,
      has_issues: hasIssues,
      declaration_accepted: true,
      declaration_accepted_at: now,
    });

    const itemRows = itemsWithPhotos.map((item, i) => ({
      vehicle_check_id: check.id,
      item_key: item.key,
      item_label: item.label,
      result: item.result,
      note: item.note || null,
      photo_path: item.photo_path,
      sort_order: i,
    }));
    await dbInsert(env, "vehicle_check_items", itemRows, { returnRow: false });

    return json({ check: { ...check, vehicle_check_items: itemRows } }, { status: 201 });
  });
