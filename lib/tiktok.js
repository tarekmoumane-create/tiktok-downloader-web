// Finds the best no-watermark video file for a TikTok link.

const UA = "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Safari/537.36";

export const VIDEO_RE = /https?:\/\/(?:(?:www|m)\.)?tiktok\.com\/(?:@[\w.-]+\/(?:video|photo)\/\d+|t\/\w+|v\/\d+)|https?:\/\/(?:vm|vt)\.tiktok\.com\/\w+/gi;

export function findLinks(text) {
  const seen = new Set(), out = [];
  for (const m of String(text || "").matchAll(VIDEO_RE)) {
    const key = m[0].toLowerCase().replace(/\/$/, "");
    if (!seen.has(key)) { seen.add(key); out.push(m[0]); }
  }
  return out;
}

export class TikTokError extends Error {}

function cookieHeader(res) {
  const list = res.headers.getSetCookie ? res.headers.getSetCookie() : [];
  return list.map((c) => c.split(";")[0]).join("; ");
}

function pickBest(video) {
  const options = [];
  for (const b of video.bitrateInfo || []) {
    const p = b.PlayAddr || {};
    const url = (p.UrlList || []).find((u) => /^https?:/.test(u));
    if (!url) continue;
    options.push({
      url, all: p.UrlList,
      width: p.Width || video.width, height: p.Height || video.height,
      h264: /h264/i.test(b.CodecType || ""), bitrate: b.Bitrate || 0,
      size: Number(p.DataSize) || 0,
    });
  }
  // biggest resolution first; at equal resolution prefer h264 (plays everywhere), then bitrate
  options.sort((a, b) =>
    Math.min(b.width, b.height) - Math.min(a.width, a.height) || (b.h264 - a.h264) || b.bitrate - a.bitrate);
  if (options.length) return options[0];
  // "playAddr" is the clean copy; "downloadAddr" is TikTok's watermarked one, so it is never used
  if (video.playAddr) return { url: video.playAddr, all: [video.playAddr], width: video.width, height: video.height, size: 0 };
  return null;
}

export async function resolve(link) {
  const res = await fetch(link, { headers: { "User-Agent": UA, "Accept-Language": "en-US,en;q=0.9" }, redirect: "follow" });
  if (res.status === 404) throw new TikTokError("Video deleted or private");
  if (!res.ok) throw new TikTokError(`TikTok refused the request (${res.status})`);
  const html = await res.text();
  const cookies = cookieHeader(res);
  const m = html.match(/<script[^>]+id="__UNIVERSAL_DATA_FOR_REHYDRATION__"[^>]*>(.*?)<\/script>/s);
  if (!m) throw new TikTokError("TikTok blocked this request, try again in a minute");
  const scope = JSON.parse(m[1]).__DEFAULT_SCOPE__ || {};
  const detail = scope["webapp.video-detail"];
  if (!detail) throw new TikTokError("Link not recognised as a TikTok video");
  const item = detail.itemInfo && detail.itemInfo.itemStruct;
  if (!item) {
    const code = detail.statusCode;
    if (code === 10204 || code === 10216 || code === 10222) throw new TikTokError("Video deleted or private");
    throw new TikTokError(detail.statusMsg ? `Video unavailable (${detail.statusMsg})` : "Video unavailable (deleted, private, or blocked)");
  }
  if (item.imagePost) throw new TikTokError("Photo slideshow, not a video");
  const best = item.video && pickBest(item.video);
  if (!best) throw new TikTokError("No downloadable video found");
  const creator = (item.author && item.author.uniqueId) || "";
  return {
    id: item.id, creator, title: (item.desc || "").slice(0, 90),
    thumb: item.video.cover || item.video.originCover || "",
    width: best.width, height: best.height, size: best.size,
    url: best.url, urls: best.all, cookies,
    filename: `${creator || "tiktok"} - ${item.id}.mp4`.replace(/[^\w.@ -]+/g, "_"),
  };
}

// Opens the video file itself. Tries each mirror until one answers.
export async function openVideo(info) {
  let last;
  for (const url of info.urls || [info.url]) {
    const res = await fetch(url, { headers: { "User-Agent": UA, Referer: "https://www.tiktok.com/", Cookie: info.cookies || "" } });
    if (res.ok && res.body) return res;
    last = res.status;
  }
  throw new TikTokError(`TikTok wouldn't hand over the video file (${last})`);
}
