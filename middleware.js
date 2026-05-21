/**
 * Répond aux preflight OPTIONS depuis localhost (admin / migration vidéos).
 * @see https://vercel.com/docs/routing-middleware
 */
import { corsHeadersForRequest } from "./lib/api-cors.mjs";

export const config = {
  matcher: "/api/:path*",
};

/** @param {import("@vercel/functions").RequestContext} request */
export default function middleware(request) {
  const headers = corsHeadersForRequest(request);
  if (request.method === "OPTIONS") {
    return new Response(null, {
      status: 204,
      headers,
    });
  }
}
