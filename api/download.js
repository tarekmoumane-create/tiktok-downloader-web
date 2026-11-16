import { Readable } from "node:stream";
import { resolve, openVideo, TikTokError } from "../lib/tiktok.js";
import { requireUser } from "../lib/session.js";

// Streams one TikTok video to the browser, with details about it in the headers.
export default async function handler(req, res) {
  if (!requireUser(req, res)) return;
  try {
    const info = await resolve(String(req.query.url || ""));
    const video = await openVideo(info);
    const n = String(req.query.n || "").padStart(3, "0");
    res.setHeader("Content-Type", "video/mp4");
    res.setHeader("Content-Disposition", `attachment; filename="${n ? n + " - " : ""}${info.filename}"`);
    const length = video.headers.get("content-length");
    if (length) res.setHeader("Content-Length", length);
    res.setHeader("X-Video", encodeURIComponent(JSON.stringify({
      id: info.id, creator: info.creator, title: info.title, thumb: info.thumb,
      width: info.width, height: info.height, size: Number(length) || info.size, filename: info.filename,
    })));
    res.setHeader("Access-Control-Expose-Headers", "X-Video");
    Readable.fromWeb(video.body).pipe(res);
  } catch (e) {
    res.status(e instanceof TikTokError ? 422 : 500).json({ error: e.message });
  }
}
