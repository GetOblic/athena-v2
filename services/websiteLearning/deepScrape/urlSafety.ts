/**
 * SSRF / same-domain / DNS-rebinding guards for Deep Website Scrape.
 */

import { lookup } from "node:dns/promises";
import { isIP } from "node:net";

const MULTI_PART_TLDS = new Set([
  "co.uk",
  "org.uk",
  "ac.uk",
  "gov.uk",
  "com.au",
  "net.au",
  "org.au",
  "co.nz",
  "co.za",
  "com.br",
  "com.mx",
]);

function stripWww(hostname: string): string {
  return hostname.toLowerCase().replace(/^www\./, "");
}

export function extractRegistrableDomain(hostname: string): string | null {
  const host = stripWww(hostname);
  if (!host || isIP(host)) return null;
  const parts = host.split(".").filter(Boolean);
  if (parts.length < 2) return null;
  const lastTwo = parts.slice(-2).join(".");
  if (parts.length >= 3) {
    const lastThree = parts.slice(-3).join(".");
    const tldCandidate = parts.slice(-2).join(".");
    if (MULTI_PART_TLDS.has(tldCandidate)) {
      return lastThree;
    }
  }
  return lastTwo;
}

export function normalizeRootWebsiteUrl(value: string | null | undefined): {
  url: string;
  hostname: string;
  registrableDomain: string;
} | null {
  const raw = String(value ?? "").trim();
  if (!raw) return null;
  try {
    const withProtocol = /^https?:\/\//i.test(raw) ? raw : `https://${raw}`;
    const parsed = new URL(withProtocol);
    if (parsed.protocol !== "http:" && parsed.protocol !== "https:") {
      return null;
    }
    if (parsed.username || parsed.password) {
      return null;
    }
    if (!parsed.hostname || !parsed.hostname.includes(".")) {
      return null;
    }
    if (isIP(parsed.hostname)) {
      return null;
    }
    const registrableDomain = extractRegistrableDomain(parsed.hostname);
    if (!registrableDomain) return null;
    parsed.hash = "";
    parsed.username = "";
    parsed.password = "";
    const url = parsed.toString().replace(/\/$/, "");
    return {
      url,
      hostname: stripWww(parsed.hostname),
      registrableDomain,
    };
  } catch {
    return null;
  }
}

export function canonicalizePageUrl(url: string): string | null {
  try {
    const parsed = new URL(url);
    parsed.hash = "";
    parsed.username = "";
    parsed.password = "";
    // Drop common tracking / session query params.
    const dropKeys: string[] = [];
    parsed.searchParams.forEach((_value, key) => {
      if (
        /^(utm_|fbclid|gclid|mc_|session|sid|ref)$/i.test(key) ||
        key.toLowerCase().startsWith("utm_")
      ) {
        dropKeys.push(key);
      }
    });
    for (const key of dropKeys) {
      parsed.searchParams.delete(key);
    }
    // Prefer no trailing slash except root.
    let href = parsed.toString();
    if (parsed.pathname !== "/" && href.endsWith("/")) {
      href = href.slice(0, -1);
    }
    return href;
  } catch {
    return null;
  }
}

export function isSameRegistrableDomain(
  candidateUrl: string,
  rootRegistrableDomain: string,
): boolean {
  try {
    const parsed = new URL(candidateUrl);
    if (parsed.protocol !== "http:" && parsed.protocol !== "https:") {
      return false;
    }
    if (isIP(parsed.hostname)) return false;
    const domain = extractRegistrableDomain(parsed.hostname);
    return domain === rootRegistrableDomain.toLowerCase();
  } catch {
    return false;
  }
}

export function isPrivateOrLocalIp(ip: string): boolean {
  const value = ip.toLowerCase().trim();
  if (!value) return true;

  if (value === "::1" || value === "0:0:0:0:0:0:0:1") return true;
  if (value.startsWith("fe80:") || value.startsWith("fc") || value.startsWith("fd")) {
    return true;
  }

  if (value.includes(":")) {
    // Other IPv6 — reject non-public for safety in v1.
    return true;
  }

  const parts = value.split(".").map((part) => Number(part));
  if (parts.length !== 4 || parts.some((n) => Number.isNaN(n) || n < 0 || n > 255)) {
    return true;
  }
  const [a, b] = parts;
  if (a === 10) return true;
  if (a === 127) return true;
  if (a === 0) return true;
  if (a === 169 && b === 254) return true;
  if (a === 172 && b >= 16 && b <= 31) return true;
  if (a === 192 && b === 168) return true;
  if (a === 100 && b >= 64 && b <= 127) return true; // CGNAT
  if (a >= 224) return true; // multicast / reserved
  return false;
}

export async function assertPublicHostname(hostname: string): Promise<string[]> {
  if (!hostname || isIP(hostname)) {
    throw new Error("IP_LITERAL_REJECTED");
  }
  const results = await lookup(hostname, { all: true, verbatim: true });
  if (!results.length) {
    throw new Error("DNS_LOOKUP_FAILED");
  }
  const addresses = results.map((entry) => entry.address);
  for (const address of addresses) {
    if (isPrivateOrLocalIp(address)) {
      throw new Error("PRIVATE_IP_REJECTED");
    }
  }
  return addresses;
}

export function resolveAbsoluteUrl(
  href: string,
  baseUrl: string,
): string | null {
  const trimmed = href.trim();
  if (!trimmed || trimmed.startsWith("#")) return null;
  if (/^(mailto|tel|javascript):/i.test(trimmed)) return null;
  try {
    return new URL(trimmed, baseUrl).toString();
  } catch {
    return null;
  }
}
