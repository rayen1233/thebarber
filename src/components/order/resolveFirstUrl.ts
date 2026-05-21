/** First URL that returns a successful GET (for backgrounds / models). */
export async function resolveFirstUrl(
  urls: readonly string[],
): Promise<string | null> {
  for (const url of urls) {
    try {
      const res = await fetch(url, { method: "GET", cache: "no-store" });
      if (res.ok) return url;
    } catch {
      /* next */
    }
  }
  return null;
}
