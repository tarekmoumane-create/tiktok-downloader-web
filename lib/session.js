// Signed-in state lives in an encrypted cookie, so there is no database.
import crypto from "node:crypto";

const COOKIE = "tt_session";
const key = () => crypto.createHash("sha256").update(process.env.SESSION_SECRET || "").digest();

export function seal(data) {
  const iv = crypto.randomBytes(12);
  const cipher = crypto.createCipheriv("aes-256-gcm", key(), iv);
  const body = Buffer.concat([cipher.update(JSON.stringify(data), "utf8"), cipher.final()]);
  return Buffer.concat([iv, cipher.getAuthTag(), body]).toString("base64url");
}

export function open(token) {
  try {
    const raw = Buffer.from(token, "base64url");
    const decipher = crypto.createDecipheriv("aes-256-gcm", key(), raw.subarray(0, 12));
    decipher.setAuthTag(raw.subarray(12, 28));
    return JSON.parse(Buffer.concat([decipher.update(raw.subarray(28)), decipher.final()]).toString("utf8"));
  } catch {
    return null;
  }
}

export function readSession(req) {
  const m = /(?:^|;\s*)tt_session=([^;]+)/.exec(req.headers.cookie || "");
  return m ? open(m[1]) : null;
}

export function setSession(res, data) {
  res.setHeader("Set-Cookie",
    `${COOKIE}=${seal(data)}; Path=/; HttpOnly; Secure; SameSite=Lax; Max-Age=${365 * 86400}`);
}

export function clearSession(res) {
  res.setHeader("Set-Cookie", `${COOKIE}=; Path=/; HttpOnly; Secure; SameSite=Lax; Max-Age=0`);
}

export function allowed(email) {
  const list = (process.env.ALLOWED_EMAILS || "").toLowerCase().split(",").map((s) => s.trim()).filter(Boolean);
  return !!email && list.includes(email.toLowerCase());
}

// Every real endpoint starts with this. Returns the session or answers 401 and returns null.
export function requireUser(req, res) {
  const s = readSession(req);
  if (s && allowed(s.email)) return s;
  res.status(401).json({ error: "Sign in first" });
  return null;
}
