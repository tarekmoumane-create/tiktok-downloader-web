import { loginUrl } from "../../lib/google.js";
export default function handler(req, res) {
  res.redirect(302, loginUrl(req, "go"));
}
