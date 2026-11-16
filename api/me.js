import { readSession, allowed } from "../lib/session.js";
export default function handler(req, res) {
  const s = readSession(req);
  if (s && allowed(s.email)) return res.json({ email: s.email });
  res.status(401).json({ error: "Sign in first" });
}
