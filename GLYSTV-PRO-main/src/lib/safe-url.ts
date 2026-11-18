import { isIP } from "node:net";

/**
 * Guards against SSRF: the app fetches user-supplied URLs (streams, playlists,
 * XMLTV, Xtream panels). Private / loopback / link-local destinations are
 * rejected so the server cannot be used to reach internal services.
 *
 * Set ALLOW_PRIVATE_URLS=1 to allow LAN providers (e.g. a local Xtream panel).
 */

const ALLOW_PRIVATE = process.env.ALLOW_PRIVATE_URLS === "1";

function ipv4ToInt(ip: string): number {
  return ip.split(".").reduce((acc, part) => (acc << 8) + Number(part), 0) >>> 0;
}

function inCidr(ip: number, base: string, bits: number): boolean {
  const mask = bits === 0 ? 0 : (~0 << (32 - bits)) >>> 0;
  return (ip & mask) === (ipv4ToInt(base) & mask);
}

export function isPrivateIpv4(ip: string): boolean {
  const n = ipv4ToInt(ip);
  return (
    inCidr(n, "0.0.0.0", 8) ||
    inCidr(n, "10.0.0.0", 8) ||
    inCidr(n, "100.64.0.0", 10) ||
    inCidr(n, "127.0.0.0", 8) ||
    inCidr(n, "169.254.0.0", 16) ||
    inCidr(n, "172.16.0.0", 12) ||
    inCidr(n, "192.0.0.0", 24) ||
    inCidr(n, "192.168.0.0", 16) ||
    inCidr(n, "198.18.0.0", 15) ||
    inCidr(n, "224.0.0.0", 3)
  );
}

export function isPrivateIpv6(ip: string): boolean {
  const lower = ip.toLowerCase().replace(/^\[|\]$/g, "");
  if (lower === "::" || lower === "::1") return true;
  if (lower.startsWith("fe80:") || lower.startsWith("fc") || lower.startsWith("fd")) return true;
  const v4 = /^::ffff:(\d+\.\d+\.\d+\.\d+)$/.exec(lower);
  if (v4) return isPrivateIpv4(v4[1]);
  return false;
}

export function isPrivateHostname(hostname: string): boolean {
  const host = hostname.toLowerCase().replace(/\.$/, "");
  if (host === "localhost" || host.endsWith(".localhost") || host.endsWith(".local") || host.endsWith(".internal")) {
    return true;
  }
  const version = isIP(host.replace(/^\[|\]$/g, ""));
  if (version === 4) return isPrivateIpv4(host);
  if (version === 6) return isPrivateIpv6(host);
  return false;
}

export type UrlCheck = { ok: true; url: URL } | { ok: false; reason: string };

/** Validates that a URL is http(s) and does not point at a private network. */
export function checkPublicUrl(raw: string): UrlCheck {
  let url: URL;
  try {
    url = new URL(raw);
  } catch {
    return { ok: false, reason: "URL inválida" };
  }
  if (url.protocol !== "http:" && url.protocol !== "https:") {
    return { ok: false, reason: "Solo se permiten URLs http(s)" };
  }
  if (url.username || url.password) {
    return { ok: false, reason: "No se admiten credenciales incrustadas en la URL" };
  }
  if (!ALLOW_PRIVATE && isPrivateHostname(url.hostname)) {
    return { ok: false, reason: "No se permiten direcciones de red privada o local" };
  }
  return { ok: true, url };
}

/**
 * `fetch` wrapper that follows redirects manually so every hop is validated
 * against the private-network rules (a public URL may redirect to 127.0.0.1).
 */
export async function safeFetch(raw: string, init: RequestInit = {}, maxRedirects = 5): Promise<Response> {
  let current = raw;
  for (let hop = 0; hop <= maxRedirects; hop++) {
    const check = checkPublicUrl(current);
    if (!check.ok) throw new Error(check.reason);
    const res = await fetch(check.url.toString(), { ...init, redirect: "manual" });
    if (res.status >= 300 && res.status < 400) {
      const location = res.headers.get("location");
      if (!location) return res;
      await res.body?.cancel().catch(() => undefined);
      current = new URL(location, check.url).toString();
      continue;
    }
    return res;
  }
  throw new Error("Demasiadas redirecciones");
}
