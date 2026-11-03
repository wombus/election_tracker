/**
 * Shared HTTP helper for providers.
 *
 * Uses conditional requests: we remember each URL's ETag / Last-Modified and
 * send If-None-Match / If-Modified-Since next time. If the file hasn't changed,
 * the CDN answers 304 with no body and we reuse the copy we already parsed.
 * That's polite to the publisher and nearly free for us.
 */
const USER_AGENT = "election-tracker/1.0 (personal results dashboard)";

interface CacheEntry {
  etag?: string;
  lastModified?: string;
  body: unknown;
}

const g = globalThis as typeof globalThis & { __httpCache?: Map<string, CacheEntry> };
const cache: Map<string, CacheEntry> = (g.__httpCache ??= new Map());

export class HttpError extends Error {
  constructor(
    readonly url: string,
    readonly status: number,
  ) {
    super(`${new URL(url).host} responded ${status}`);
    this.name = "HttpError";
  }
}

export async function fetchJson<T>(url: string, signal?: AbortSignal): Promise<{ data: T; changed: boolean }> {
  const prev = cache.get(url);
  const headers: Record<string, string> = { Accept: "application/json", "User-Agent": USER_AGENT };
  if (prev?.etag) headers["If-None-Match"] = prev.etag;
  if (prev?.lastModified) headers["If-Modified-Since"] = prev.lastModified;

  const res = await fetch(url, { headers, signal, cache: "no-store" });
  if (res.status === 304 && prev) return { data: prev.body as T, changed: false };
  if (!res.ok) throw new HttpError(url, res.status);

  const body = (await res.json()) as T;
  cache.set(url, {
    etag: res.headers.get("etag") ?? undefined,
    lastModified: res.headers.get("last-modified") ?? undefined,
    body,
  });
  return { data: body, changed: true };
}

/** Run async tasks with a concurrency limit (don't open 50 sockets at once). */
export async function mapLimit<T, R>(items: T[], limit: number, fn: (item: T) => Promise<R>): Promise<R[]> {
  const out: R[] = new Array(items.length);
  let next = 0;
  const workers = Array.from({ length: Math.min(limit, items.length) }, async () => {
    while (next < items.length) {
      const i = next++;
      out[i] = await fn(items[i]);
    }
  });
  await Promise.all(workers);
  return out;
}

/** Normalize the many ways outlets label parties into our three buckets. */
export function partyFromLabel(label: string | null | undefined): "D" | "R" | "I" {
  const s = (label ?? "").trim().toLowerCase();
  if (["d", "dem", "democrat", "democratic", "dfl"].includes(s)) return "D";
  if (["r", "rep", "gop", "republican"].includes(s)) return "R";
  return "I";
}
