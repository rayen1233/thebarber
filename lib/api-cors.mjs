/** Allow localhost admin to call production /api/* (upload, store, videos). */

const LOCALHOST_ORIGIN = /^http:\/\/(localhost|127\.0\.0\.1)(:\d+)?$/;

/** @param {import("http").IncomingMessage | Request} req */
export function resolveCorsOrigin(req) {
  const origin = String(
    req.headers?.origin ?? req.headers?.get?.("origin") ?? "",
  ).trim();
  if (origin && LOCALHOST_ORIGIN.test(origin)) return origin;
  return "*";
}

/** @param {import("http").IncomingMessage | Request} req */
export function corsHeadersForRequest(req) {
  const origin = resolveCorsOrigin(req);
  const headers = {
    "Access-Control-Allow-Origin": origin,
    "Access-Control-Allow-Methods": "GET, POST, PUT, DELETE, OPTIONS",
    "Access-Control-Allow-Headers":
      "Authorization, Content-Type, X-Admin-Key, Accept",
    "Access-Control-Max-Age": "86400",
  };
  if (origin !== "*") headers.Vary = "Origin";
  return headers;
}

/** @param {import("http").IncomingMessage} req @param {import("http").ServerResponse} res */
export function setApiCorsHeaders(req, res) {
  for (const [key, value] of Object.entries(corsHeadersForRequest(req))) {
    res.setHeader(key, value);
  }
}

/** @param {import("http").IncomingMessage} req @param {import("http").ServerResponse} res @returns {boolean} true if OPTIONS handled */
export function applyApiCors(req, res) {
  setApiCorsHeaders(req, res);
  if (req.method === "OPTIONS") {
    res.status(204).end();
    return true;
  }
  return false;
}
