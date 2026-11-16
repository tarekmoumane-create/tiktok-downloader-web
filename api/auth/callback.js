import { exchangeCode } from "../../lib/google.js";
import { setSession, allowed } from "../../lib/session.js";

export default async function handler(req, res) {
  try {
    if (!req.query.code) throw new Error("Google didn't send a sign-in code");
    const { email, refresh } = await exchangeCode(req, req.query.code);
    if (!allowed(email)) {
      res.status(403).send(`<p style="font-family:system-ui;padding:40px">This tool is private. ${email} isn't on the list.</p>`);
      return;
    }
    if (!refresh) throw new Error("Google didn't give a long-term login, try signing in again");
    setSession(res, { email, refresh });
    res.redirect(302, "/");
  } catch (e) {
    res.status(400).send(`<p style="font-family:system-ui;padding:40px">Sign-in failed: ${e.message}. <a href="/">Try again</a></p>`);
  }
}
