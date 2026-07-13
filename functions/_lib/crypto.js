// Reversible password encryption (NOT one-way hashing — the admin needs to be
// able to view and reset subcontractor passwords), and HMAC signing for
// session cookies. Uses the Web Crypto API built into Cloudflare Workers.

function b64encode(bytes) {
  let binary = "";
  bytes.forEach((b) => (binary += String.fromCharCode(b)));
  return btoa(binary).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

function b64decode(str) {
  str = str.replace(/-/g, "+").replace(/_/g, "/");
  while (str.length % 4) str += "=";
  const binary = atob(str);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
  return bytes;
}

async function getAesKey(env) {
  const raw = b64decode(env.ENCRYPTION_KEY); // 32 raw bytes, base64-encoded in the secret
  return crypto.subtle.importKey("raw", raw, "AES-GCM", false, [
    "encrypt",
    "decrypt",
  ]);
}

export async function encryptSecret(env, plaintext) {
  const key = await getAesKey(env);
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const encoded = new TextEncoder().encode(plaintext);
  const cipherBuf = await crypto.subtle.encrypt(
    { name: "AES-GCM", iv },
    key,
    encoded
  );
  const combined = new Uint8Array(iv.length + cipherBuf.byteLength);
  combined.set(iv, 0);
  combined.set(new Uint8Array(cipherBuf), iv.length);
  return b64encode(combined);
}

export async function decryptSecret(env, stored) {
  const key = await getAesKey(env);
  const combined = b64decode(stored);
  const iv = combined.slice(0, 12);
  const cipherBytes = combined.slice(12);
  const plainBuf = await crypto.subtle.decrypt(
    { name: "AES-GCM", iv },
    key,
    cipherBytes
  );
  return new TextDecoder().decode(plainBuf);
}

async function getHmacKey(env) {
  const raw = new TextEncoder().encode(env.SESSION_SECRET);
  return crypto.subtle.importKey(
    "raw",
    raw,
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign", "verify"]
  );
}

export async function signSession(env, payload) {
  const key = await getHmacKey(env);
  const body = b64encode(new TextEncoder().encode(JSON.stringify(payload)));
  const sigBuf = await crypto.subtle.sign(
    "HMAC",
    key,
    new TextEncoder().encode(body)
  );
  const sig = b64encode(new Uint8Array(sigBuf));
  return `${body}.${sig}`;
}

export async function verifySession(env, token) {
  if (!token || !token.includes(".")) return null;
  const [body, sig] = token.split(".");
  const key = await getHmacKey(env);
  const valid = await crypto.subtle.verify(
    "HMAC",
    key,
    b64decode(sig),
    new TextEncoder().encode(body)
  );
  if (!valid) return null;
  const payload = JSON.parse(new TextDecoder().decode(b64decode(body)));
  if (payload.exp && Date.now() > payload.exp) return null;
  return payload;
}
