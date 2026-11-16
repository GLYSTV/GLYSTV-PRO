import { headers } from "next/headers";

/**
 * Small in-memory sliding-window rate limiter (per process). Enough to stop
 * credential stuffing on login / pairing and abuse of the public pairing
 * endpoint on a single-instance deployment.
 */
interface Bucket {
  hits: number[];
}

const g = globalThis as typeof globalThis & { __glystvRateLimit?: Map<string, Bucket> };
function store(): Map<string, Bucket> {
  if (!g.__glystvRateLimit) g.__glystvRateLimit = new Map();
  return g.__glystvRateLimit;
}

export interface RateLimitResult {
  ok: boolean;
  remaining: number;
  /** Seconds until the oldest hit leaves the window (only meaningful when !ok). */
  retryAfter: number;
}

export function rateLimit(key: string, limit: number, windowMs: number): RateLimitResult {
  const now = Date.now();
  const map = store();
  const bucket = map.get(key) ?? { hits: [] };
  bucket.hits = bucket.hits.filter((t) => now - t < windowMs);

  if (bucket.hits.length >= limit) {
    map.set(key, bucket);
    return { ok: false, remaining: 0, retryAfter: Math.ceil((bucket.hits[0] + windowMs - now) / 1000) };
  }
  bucket.hits.push(now);
  map.set(key, bucket);

  // Opportunistic cleanup so the map does not grow forever.
  if (map.size > 5000) {
    for (const [k, b] of map) {
      if (b.hits.every((t) => now - t >= windowMs)) map.delete(k);
    }
  }
  return { ok: true, remaining: limit - bucket.hits.length, retryAfter: 0 };
}

/** Best-effort client IP (works behind Caddy/Nginx/Railway/Render proxies). */
export async function clientIp(): Promise<string> {
  const h = await headers();
  const forwarded = h.get("x-forwarded-for");
  if (forwarded) return forwarded.split(",")[0].trim();
  return h.get("x-real-ip") ?? h.get("cf-connecting-ip") ?? "unknown";
}

export function tooManyRequests(retryAfter: number) {
  return Response.json(
    { error: `Demasiados intentos. Vuelve a intentarlo en ${retryAfter} s.` },
    { status: 429, headers: { "retry-after": String(retryAfter) } },
  );
}
