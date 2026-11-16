// Google sign-in and a fresh Drive access token for the signed-in user.
const SCOPES = ["openid", "email", "https://www.googleapis.com/auth/drive"].join(" ");

export function baseUrl(req) {
  return `https://${req.headers["x-forwarded-host"] || req.headers.host}`;
}

export function loginUrl(req, state) {
  const p = new URLSearchParams({
    client_id: process.env.GOOGLE_CLIENT_ID,
    redirect_uri: `${baseUrl(req)}/api/auth/callback`,
    response_type: "code", scope: SCOPES, access_type: "offline", prompt: "consent", state,
  });
  return `https://accounts.google.com/o/oauth2/v2/auth?${p}`;
}

async function tokenRequest(params) {
  const r = await fetch("https://oauth2.googleapis.com/token", {
    method: "POST", headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({ client_id: process.env.GOOGLE_CLIENT_ID, client_secret: process.env.GOOGLE_CLIENT_SECRET, ...params }),
  });
  const data = await r.json();
  if (!r.ok) throw new Error(data.error_description || data.error || "Google sign-in failed");
  return data;
}

export async function exchangeCode(req, code) {
  const data = await tokenRequest({ code, grant_type: "authorization_code", redirect_uri: `${baseUrl(req)}/api/auth/callback` });
  const who = await fetch("https://www.googleapis.com/oauth2/v3/userinfo", { headers: { Authorization: `Bearer ${data.access_token}` } }).then((r) => r.json());
  return { email: who.email, refresh: data.refresh_token };
}

export async function accessToken(session) {
  const data = await tokenRequest({ refresh_token: session.refresh, grant_type: "refresh_token" });
  return data.access_token;
}

export async function drive(token, path, init = {}) {
  const r = await fetch(`https://www.googleapis.com${path}`, { ...init, headers: { Authorization: `Bearer ${token}`, ...(init.headers || {}) } });
  if (!r.ok) throw new Error(`Google Drive said no (${r.status})`);
  return r;
}
