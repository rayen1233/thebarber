/**
 * Répond aux preflight OPTIONS depuis localhost (admin / migration vidéos).
 * @see https://vercel.com/docs/routing-middleware
 */
export const config = {
  matcher: "/api/:path*",
};

const CORS_HEADERS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, POST, PUT, OPTIONS",
  "Access-Control-Allow-Headers": "Authorization, Content-Type, X-Admin-Key, Accept",
  "Access-Control-Max-Age": "86400",
};

/** @param {import("@vercel/functions").RequestContext} request */
export default function middleware(request) {
  if (request.method === "OPTIONS") {
    return new Response(null, {
      status: 204,
      headers: CORS_HEADERS,
    });
  }
}
