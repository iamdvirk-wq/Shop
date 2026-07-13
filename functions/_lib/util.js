// Small shared helpers used by every API endpoint.

export function json(data, init = {}) {
  return new Response(JSON.stringify(data), {
    ...init,
    headers: {
      "Content-Type": "application/json",
      ...(init.headers || {}),
    },
  });
}

export function errorResponse(message, status = 400) {
  return json({ error: message }, { status });
}

export function parseCookies(request) {
  const header = request.headers.get("Cookie") || "";
  const cookies = {};
  header.split(";").forEach((part) => {
    const idx = part.indexOf("=");
    if (idx === -1) return;
    const key = part.slice(0, idx).trim();
    const value = part.slice(idx + 1).trim();
    if (key) cookies[key] = decodeURIComponent(value);
  });
  return cookies;
}

export function formatDateAU(dateStr) {
  // dateStr is "YYYY-MM-DD" -> "1 July 2026"
  const [y, m, d] = dateStr.split("-").map(Number);
  const months = [
    "January", "February", "March", "April", "May", "June",
    "July", "August", "September", "October", "November", "December",
  ];
  return `${d} ${months[m - 1]} ${y}`;
}

export function todayISO() {
  return new Date().toISOString().slice(0, 10);
}

export function round2(n) {
  return Math.round((n + Number.EPSILON) * 100) / 100;
}

// Permanent deletes (subcontractors, invoices) require this PIN as an extra
// confirmation step beyond just being logged in as admin.
export const DELETE_PIN = "2288";

export function requirePin(body) {
  if (!body || body.pin !== DELETE_PIN) {
    throw errorResponse("Incorrect PIN", 403);
  }
}

// Wraps a route handler so that guards like requireAdmin() can simply
// `throw errorResponse(...)` and have it returned to the browser correctly,
// and any unexpected error becomes a clean 500 instead of a crash.
export async function withHandler(fn) {
  try {
    return await fn();
  } catch (e) {
    if (e instanceof Response) return e;
    console.error(e);
    return errorResponse(e.message || "Server error", e.status || 500);
  }
}
