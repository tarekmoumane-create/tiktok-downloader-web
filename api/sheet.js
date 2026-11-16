import { unzipSync, strFromU8 } from "fflate";
import { findLinks } from "../lib/tiktok.js";
import { requireUser } from "../lib/session.js";
import { accessToken } from "../lib/google.js";

// Every TikTok link in a Google Sheet: the open tab as plain text first, then the
// whole workbook's hidden hyperlinks if that finds nothing.
const XLSX = "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet";

async function exportSheet(id, fmt, gid, token) {
  const ok = (r) => r.ok && !/text\/html/.test(r.headers.get("content-type") || "");
  const url = (g) => `https://docs.google.com/spreadsheets/d/${id}/export?format=${fmt}${g ? `&gid=${g}` : ""}`;
  // shared or public sheet: plain export, with the linked tab first, then whatever tab is default
  for (const g of gid ? [gid, ""] : [""]) {
    const r = await fetch(url(g), { redirect: "follow" });
    if (ok(r)) return Buffer.from(await r.arrayBuffer());
  }
  // the user's own private sheet: go through the Drive API with their login
  const r = await fetch(`https://www.googleapis.com/drive/v3/files/${id}/export?mimeType=${encodeURIComponent(fmt === "csv" ? "text/csv" : XLSX)}`,
    { headers: { Authorization: `Bearer ${await token()}` } });
  if (r.ok) return Buffer.from(await r.arrayBuffer());
  throw new Error(r.status === 404
    ? "Can't find that sheet in your Google account. Share it with the account you signed in with, or set it to \"Anyone with the link\"."
    : "Couldn't open that sheet. Set sharing to \"Anyone with the link\", or make sure it's in your Google account.");
}

export function linksFromXlsx(buf) {
  const parts = [];
  for (const [name, data] of Object.entries(unzipSync(new Uint8Array(buf)))) {
    if (/\.(xml|rels)$/.test(name)) parts.push(strFromU8(data).replace(/&amp;/g, "&"));
  }
  return findLinks(parts.join("\n"));
}

export default async function handler(req, res) {
  const session = requireUser(req, res);
  if (!session) return;
  try {
    const link = String((req.body && req.body.url) || "");
    const m = /\/spreadsheets\/d\/([a-zA-Z0-9-_]+)/.exec(link);
    if (!m) throw new Error("That doesn't look like a Google Sheet link.");
    const gid = (/[#&?]gid=(\d+)/.exec(link) || [])[1] || "";
    let cached;
    const token = async () => (cached ||= await accessToken(session));
    let links = findLinks((await exportSheet(m[1], "csv", gid, token)).toString("utf8"));
    if (!links.length) links = linksFromXlsx(await exportSheet(m[1], "xlsx", "", token));
    res.json({ links });
  } catch (e) {
    res.status(400).json({ error: e.message });
  }
}
