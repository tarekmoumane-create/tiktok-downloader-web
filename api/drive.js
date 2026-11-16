import { resolve, openVideo, TikTokError } from "../lib/tiktok.js";
import { requireUser } from "../lib/session.js";
import { accessToken, drive } from "../lib/google.js";

// Pulls one TikTok and drops it straight into the given Drive folder.
export default async function handler(req, res) {
  const session = requireUser(req, res);
  if (!session) return;
  try {
    const { url, folderId, n } = req.body || {};
    const info = await resolve(String(url || ""));
    const video = await openVideo(info);
    const bytes = Buffer.from(await video.arrayBuffer());
    const name = `${String(n || "").padStart(3, "0")} - ${info.filename}`;
    const token = await accessToken(session);
    const boundary = "tt" + Date.now();
    const meta = JSON.stringify({ name, parents: [folderId] });
    const body = Buffer.concat([
      Buffer.from(`--${boundary}\r\nContent-Type: application/json; charset=UTF-8\r\n\r\n${meta}\r\n--${boundary}\r\nContent-Type: video/mp4\r\n\r\n`),
      bytes, Buffer.from(`\r\n--${boundary}--`),
    ]);
    const made = await drive(token, "/upload/drive/v3/files?uploadType=multipart&fields=id,webViewLink", {
      method: "POST", headers: { "Content-Type": `multipart/related; boundary=${boundary}` }, body,
    }).then((r) => r.json());
    res.json({ id: made.id, url: made.webViewLink, size: bytes.length });
  } catch (e) {
    res.status(e instanceof TikTokError ? 422 : 500).json({ error: e.message });
  }
}
