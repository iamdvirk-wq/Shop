// Thin wrapper around Supabase's REST API (PostgREST), using the service_role
// key. This always runs server-side inside a Cloudflare Pages Function, and
// the key is never sent to the browser.

function headers(env, extra = {}) {
  return {
    apikey: env.SUPABASE_SERVICE_ROLE_KEY,
    Authorization: `Bearer ${env.SUPABASE_SERVICE_ROLE_KEY}`,
    "Content-Type": "application/json",
    ...extra,
  };
}

async function handle(res) {
  const text = await res.text();
  const data = text ? JSON.parse(text) : null;
  if (!res.ok) {
    const message = (data && (data.message || data.error)) || res.statusText;
    const err = new Error(message);
    err.status = res.status;
    err.data = data;
    throw err;
  }
  return data;
}

// path examples: "subcontractors?select=*&username=eq.john"
export async function dbGet(env, path) {
  const res = await fetch(`${env.SUPABASE_URL}/rest/v1/${path}`, {
    headers: headers(env),
  });
  return handle(res);
}

export async function dbInsert(env, table, row, { returnRow = true } = {}) {
  const res = await fetch(`${env.SUPABASE_URL}/rest/v1/${table}`, {
    method: "POST",
    headers: headers(env, {
      Prefer: returnRow ? "return=representation" : "return=minimal",
    }),
    body: JSON.stringify(row),
  });
  const data = await handle(res);
  return returnRow ? data[0] : null;
}

export async function dbUpdate(env, table, filterQuery, patch, { returnRow = true } = {}) {
  const res = await fetch(`${env.SUPABASE_URL}/rest/v1/${table}?${filterQuery}`, {
    method: "PATCH",
    headers: headers(env, {
      Prefer: returnRow ? "return=representation" : "return=minimal",
    }),
    body: JSON.stringify(patch),
  });
  const data = await handle(res);
  return returnRow ? data : null;
}

export async function dbDelete(env, table, filterQuery) {
  const res = await fetch(`${env.SUPABASE_URL}/rest/v1/${table}?${filterQuery}`, {
    method: "DELETE",
    headers: headers(env, { Prefer: "return=minimal" }),
  });
  return handle(res);
}

export async function dbRpc(env, fnName, args) {
  const res = await fetch(`${env.SUPABASE_URL}/rest/v1/rpc/${fnName}`, {
    method: "POST",
    headers: headers(env),
    body: JSON.stringify(args),
  });
  return handle(res);
}

export async function storageUpload(env, bucket, path, bytes, contentType) {
  const res = await fetch(
    `${env.SUPABASE_URL}/storage/v1/object/${bucket}/${path}`,
    {
      method: "POST",
      headers: headers(env, {
        "Content-Type": contentType,
        "x-upsert": "true",
      }),
      body: bytes,
    }
  );
  if (!res.ok) {
    const text = await res.text();
    throw new Error(`Storage upload failed: ${text}`);
  }
}

export async function storageDownload(env, bucket, path) {
  const res = await fetch(
    `${env.SUPABASE_URL}/storage/v1/object/${bucket}/${path}`,
    { headers: headers(env) }
  );
  if (!res.ok) return null;
  return new Uint8Array(await res.arrayBuffer());
}
