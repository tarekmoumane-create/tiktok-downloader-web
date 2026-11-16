import { requireUser } from "../lib/session.js";
import { accessToken, drive } from "../lib/google.js";

const FOLDER = "application/vnd.google-apps.folder";

async function findOrCreate(token, name, parent) {
  const q = `name='${name.replace(/'/g, "\\'")}' and mimeType='${FOLDER}' and '${parent}' in parents and trashed=false`;
  const found = await drive(token, `/drive/v3/files?q=${encodeURIComponent(q)}&fields=files(id)`).then((r) => r.json());
  if (found.files && found.files.length) return found.files[0].id;
  const made = await drive(token, "/drive/v3/files?fields=id", {
    method: "POST", headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ name, mimeType: FOLDER, parents: [parent] }),
  }).then((r) => r.json());
  return made.id;
}

// Makes Drive folder "TikTok Downloads/<batch name>" and returns it.
export default async function handler(req, res) {
  const session = requireUser(req, res);
  if (!session) return;
  try {
    const token = await accessToken(session);
    const root = await findOrCreate(token, "TikTok Downloads", "root");
    const id = await findOrCreate(token, String((req.body && req.body.name) || "Batch"), root);
    res.json({ id, url: `https://drive.google.com/drive/folders/${id}` });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
}
