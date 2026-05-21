/** Allow localhost admin to call production /api/* (upload, store, videos). */

/** @param {import("http").ServerResponse} res */
export function setApiCorsHeaders(res) {
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "GET, POST, PUT, OPTIONS");
  res.setHeader(
    "Access-Control-Allow-Headers",
    "Authorization, Content-Type, X-Admin-Key, Accept",
  );
  res.setHeader("Access-Control-Max-Age", "86400");
}

/** @param {import("http").IncomingMessage} req @param {import("http").ServerResponse} res @returns {boolean} true if OPTIONS handled */
export function applyApiCors(req, res) {
  setApiCorsHeaders(res);
  if (req.method === "OPTIONS") {
    res.status(204).end();
    return true;
  }
  return false;
}
