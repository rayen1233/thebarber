/**
 * Parse JSON body on Vercel Node handlers (req.body may be object, string, or unset).
 * @param {import("http").IncomingMessage & { body?: unknown }} req
 */
export async function readJsonBody(req) {
  const raw = req.body;
  if (raw && typeof raw === "object" && !Buffer.isBuffer(raw)) {
    return raw;
  }
  if (typeof raw === "string" && raw.trim()) {
    try {
      return JSON.parse(raw);
    } catch {
      return null;
    }
  }
  if (typeof req.read !== "function") return null;
  const chunks = [];
  for await (const chunk of req) {
    chunks.push(typeof chunk === "string" ? Buffer.from(chunk) : chunk);
  }
  const text = Buffer.concat(chunks).toString("utf8").trim();
  if (!text) return null;
  try {
    return JSON.parse(text);
  } catch {
    return null;
  }
}
