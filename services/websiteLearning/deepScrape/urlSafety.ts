/**
 * SSRF / same-domain / DNS-rebinding guards for Deep Website Scrape.
 *
 * Uses Node's BlockList for deterministic CIDR classification.
 * Public IPv4 and public IPv6 (including compressed forms) are accepted.
 * The previous blanket `includes(":") => private` bug is removed.
 */

import { lookup } from "node:dns/promises";
import { BlockList, isIP } from "node:net";
import { logDeepScrapeEvent } from "@/services/websiteLearning/deepScrape/observability";

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

/** Diagnostic classification labels required by production observability. */
export type AddressClassification =
  | "public_ipv4"
  | "private_ipv4"
  | "loopback_ipv4"
  | "link_local_ipv4"
  | "metadata_ipv4"
  | "cgnat_ipv4"
  | "reserved_ipv4"
  | "unspecified_ipv4"
  | "multicast_ipv4"
  | "public_ipv6"
  | "ula_ipv6"
  | "loopback_ipv6"
  | "link_local_ipv6"
  | "multicast_ipv6"
  | "reserved_ipv6"
  | "unspecified_ipv6"
  | "ipv4_mapped_public"
  | "ipv4_mapped_private"
  | "malformed";

export type HostnameSafetyContext = {
  jobId?: string | null;
  organizationId?: string | null;
  sourceType?: "brain" | "prospect" | null;
  fetchPurpose?: "robots" | "sitemap" | "homepage" | "page";
  redirectDepth?: number;
};

const blockedIpv4 = new BlockList();
const blockedIpv6 = new BlockList();

function initBlockLists(): void {
  // IPv4 special-use / private ranges.
  blockedIpv4.addSubnet("0.0.0.0", 8, "ipv4");
  blockedIpv4.addSubnet("10.0.0.0", 8, "ipv4");
  blockedIpv4.addSubnet("100.64.0.0", 10, "ipv4");
  blockedIpv4.addSubnet("127.0.0.0", 8, "ipv4");
  blockedIpv4.addSubnet("169.254.0.0", 16, "ipv4");
  blockedIpv4.addSubnet("172.16.0.0", 12, "ipv4");
  blockedIpv4.addSubnet("192.0.0.0", 24, "ipv4");
  blockedIpv4.addSubnet("192.0.2.0", 24, "ipv4");
  blockedIpv4.addSubnet("192.168.0.0", 16, "ipv4");
  blockedIpv4.addSubnet("198.18.0.0", 15, "ipv4");
  blockedIpv4.addSubnet("198.51.100.0", 24, "ipv4");
  blockedIpv4.addSubnet("203.0.113.0", 24, "ipv4");
  blockedIpv4.addSubnet("224.0.0.0", 4, "ipv4");
  blockedIpv4.addSubnet("240.0.0.0", 4, "ipv4");

  // IPv6 special-use / private ranges.
  blockedIpv6.addAddress("::", "ipv6");
  blockedIpv6.addAddress("::1", "ipv6");
  blockedIpv6.addSubnet("fc00::", 7, "ipv6"); // ULA
  blockedIpv6.addSubnet("fe80::", 10, "ipv6"); // link-local
  blockedIpv6.addSubnet("ff00::", 8, "ipv6"); // multicast
  blockedIpv6.addSubnet("2001:db8::", 32, "ipv6"); // documentation
}

initBlockLists();

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

/** Normalize IP literals: brackets, zone ids, case. */
export function normalizeIpLiteral(ip: string): string | null {
  let value = ip.trim().toLowerCase();
  if (!value) return null;
  if (value.startsWith("[") && value.endsWith("]")) {
    value = value.slice(1, -1);
  }
  const zoneIndex = value.indexOf("%");
  if (zoneIndex >= 0) {
    value = value.slice(0, zoneIndex);
  }
  if (!isIP(value)) {
    return null;
  }
  return value;
}

function extractIpv4Mapped(ip: string): string | null {
  const lowered = ip.toLowerCase();
  const dotted = lowered.match(/::ffff:(\d{1,3}(?:\.\d{1,3}){3})$/);
  if (dotted?.[1] && isIP(dotted[1]) === 4) {
    return dotted[1];
  }
  const hex = lowered.match(/::ffff:([0-9a-f]{1,4}):([0-9a-f]{1,4})$/i);
  if (!hex) return null;
  const hi = Number.parseInt(hex[1], 16);
  const lo = Number.parseInt(hex[2], 16);
  if (Number.isNaN(hi) || Number.isNaN(lo)) return null;
  const mapped = `${(hi >> 8) & 255}.${hi & 255}.${(lo >> 8) & 255}.${lo & 255}`;
  return isIP(mapped) === 4 ? mapped : null;
}

function classifyIpv4Literal(ip: string): AddressClassification {
  const parts = ip.split(".").map((part) => Number(part));
  if (parts.length !== 4 || parts.some((n) => Number.isNaN(n))) {
    return "malformed";
  }
  const [a, b, c, d] = parts;
  if (a === 127) return "loopback_ipv4";
  if (a === 0) return "unspecified_ipv4";
  if (a === 169 && b === 254 && c === 169 && d === 254) return "metadata_ipv4";
  if (a === 169 && b === 254) return "link_local_ipv4";
  if (a === 100 && b >= 64 && b <= 127) return "cgnat_ipv4";
  if (a === 10 || (a === 172 && b >= 16 && b <= 31) || (a === 192 && b === 168)) {
    return "private_ipv4";
  }
  if (a >= 224 && a <= 239) return "multicast_ipv4";
  if (!blockedIpv4.check(ip, "ipv4")) return "public_ipv4";
  return "reserved_ipv4";
}

function classifyIpv6Literal(ip: string): AddressClassification {
  if (ip === "::") return "unspecified_ipv6";
  if (ip === "::1") return "loopback_ipv6";
  if (blockedIpv6.check(ip, "ipv6")) {
    // Distinguish common blocked classes for diagnostics.
    if (ip.startsWith("fe80:")) return "link_local_ipv6";
    if (ip.startsWith("fc") || ip.startsWith("fd")) return "ula_ipv6";
    if (ip.startsWith("ff")) return "multicast_ipv6";
    return "reserved_ipv6";
  }
  return "public_ipv6";
}

export function classifyIpAddress(ip: string): AddressClassification {
  const normalized = normalizeIpLiteral(ip);
  if (!normalized) {
    // Still attempt mapped extraction from non-isIP forms before malformed.
    const mapped = extractIpv4Mapped(ip.toLowerCase().trim());
    if (!mapped) return "malformed";
    const embedded = classifyIpv4Literal(mapped);
    return embedded === "public_ipv4"
      ? "ipv4_mapped_public"
      : "ipv4_mapped_private";
  }

  const mapped = extractIpv4Mapped(normalized);
  if (mapped) {
    const embedded = classifyIpv4Literal(mapped);
    return embedded === "public_ipv4"
      ? "ipv4_mapped_public"
      : "ipv4_mapped_private";
  }

  const family = isIP(normalized);
  if (family === 4) return classifyIpv4Literal(normalized);
  if (family === 6) return classifyIpv6Literal(normalized);
  return "malformed";
}

export function isPrivateOrLocalIp(ip: string): boolean {
  const classification = classifyIpAddress(ip);
  return (
    classification !== "public_ipv4" &&
    classification !== "public_ipv6" &&
    classification !== "ipv4_mapped_public"
  );
}

function isBlockedByCidr(ip: string): boolean {
  const normalized = normalizeIpLiteral(ip);
  if (!normalized) return true;

  const mapped = extractIpv4Mapped(normalized);
  if (mapped) {
    return blockedIpv4.check(mapped, "ipv4");
  }

  const family = isIP(normalized);
  if (family === 4) return blockedIpv4.check(normalized, "ipv4");
  if (family === 6) return blockedIpv6.check(normalized, "ipv6");
  return true;
}

export async function assertPublicHostname(
  hostname: string,
  context: HostnameSafetyContext = {},
): Promise<string[]> {
  if (!hostname) {
    throw new Error("IP_LITERAL_REJECTED");
  }

  const literal = normalizeIpLiteral(hostname);
  if (literal || isIP(hostname)) {
    const classification = classifyIpAddress(hostname);
    logDeepScrapeEvent("deep_scrape_url_safety_diagnostic", {
      jobId: context.jobId,
      organizationId: context.organizationId,
      sourceType: context.sourceType,
      diagnostic: {
        hostname,
        fetchPurpose: context.fetchPurpose ?? null,
        redirectDepth: context.redirectDepth ?? 0,
        dnsResultCount: 1,
        addressFamily: isIP(literal ?? hostname) || null,
        classifications: [classification],
        rejected: true,
        rejectionCode: "IP_LITERAL_REJECTED",
      },
      failureCode: "IP_LITERAL_REJECTED",
    });
    throw new Error("IP_LITERAL_REJECTED");
  }

  const results = await lookup(hostname, { all: true, verbatim: true });
  if (!results.length) {
    throw new Error("DNS_LOOKUP_FAILED");
  }

  const classifications = results.map((entry) =>
    classifyIpAddress(entry.address),
  );
  const blockedIndex = results.findIndex(
    (entry) =>
      isBlockedByCidr(entry.address) || isPrivateOrLocalIp(entry.address),
  );
  const rejected = blockedIndex >= 0;

  logDeepScrapeEvent("deep_scrape_url_safety_diagnostic", {
    jobId: context.jobId,
    organizationId: context.organizationId,
    sourceType: context.sourceType,
    diagnostic: {
      hostname: stripWww(hostname),
      fetchPurpose: context.fetchPurpose ?? null,
      redirectDepth: context.redirectDepth ?? 0,
      dnsResultCount: results.length,
      addressFamily: results.map((entry) => entry.family),
      classifications,
      rejected,
      rejectionCode: rejected ? "PRIVATE_IP_REJECTED" : null,
      rejectionCategory: rejected ? classifications[blockedIndex] : null,
    },
    failureCode: rejected ? "PRIVATE_IP_REJECTED" : null,
  });

  if (rejected) {
    throw new Error("PRIVATE_IP_REJECTED");
  }

  return results.map((entry) => entry.address);
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
