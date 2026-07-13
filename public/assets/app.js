const api = {
  async request(method, path, body) {
    const res = await fetch(`/api${path}`, {
      method,
      credentials: "include",
      headers: body ? { "Content-Type": "application/json" } : {},
      body: body ? JSON.stringify(body) : undefined,
    });
    let data = null;
    try { data = await res.json(); } catch (e) { /* no body */ }
    if (!res.ok) {
      const message = (data && data.error) || `Request failed (${res.status})`;
      throw new Error(message);
    }
    return data;
  },
  get(path) { return this.request("GET", path); },
  post(path, body) { return this.request("POST", path, body || {}); },
  patch(path, body) { return this.request("PATCH", path, body || {}); },
  delete(path, body) { return this.request("DELETE", path, body); },
};

// Prompts for the deletion PIN before a permanent-delete action. Returns
// null (caller should abort) if the user cancels.
function promptPin(what) {
  const pin = window.prompt(`Type the PIN to permanently delete ${what}. This cannot be undone.`);
  if (pin === null) return null;
  return { pin };
}

function money(n) {
  return `$${Number(n || 0).toFixed(2)}`;
}

function statusLabel(status) {
  return status.replace(/_/g, " ").replace(/\b\w/g, (c) => c.toUpperCase());
}

function el(html) {
  const t = document.createElement("template");
  t.innerHTML = html.trim();
  return t.content.firstElementChild;
}

function showError(container, message) {
  container.innerHTML = `<div class="error-box">${message}</div>`;
}

async function requireRole(role) {
  const me = await api.get("/me");
  if (me.role !== role) {
    window.location.href = "/";
    throw new Error("redirecting");
  }
  return me;
}

async function logout() {
  await api.post("/logout");
  window.location.href = "/";
}
