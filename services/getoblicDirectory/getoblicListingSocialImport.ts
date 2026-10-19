/**
 * Maps GetOblic listing social values onto existing Prospect columns.
 * Dedicated facebook, instagram, linkedin, and whatsapp are authoritative.
 * listing.social[] fills only a platform whose dedicated value is absent.
 * Unsupported networks are ignored and remain provenance-only.
 */

import { buildWhatsAppMeUrl } from "@/services/prospects/prospectWhatsApp";

/** Same cap conversion already applies to imported profile URLs. */
const SOCIAL_URL_MAX = 500;
/** Same cap conversion already applies to imported WhatsApp numbers. */
const WHATSAPP_NUMBER_MAX = 120;
const SOCIAL_ENTRY_MAX = 24;
const URL_PARSE_MAX = 2000;

const FACEBOOK_HOSTS = ["facebook.com", "fb.com", "fb.me"] as const;
const INSTAGRAM_HOSTS = ["instagram.com"] as const;
const LINKEDIN_HOSTS = ["linkedin.com", "lnkd.in"] as const;
const WHATSAPP_LINK_HOSTS = new Set([
  "wa.me",
  "www.wa.me",
  "api.whatsapp.com",
  "web.whatsapp.com",
]);

export type GetOblicListingSocialFields = {
  facebook: string | null;
  instagram: string | null;
  linkedin: string | null;
  whatsapp: string | null;
};

type SocialNetwork = keyof GetOblicListingSocialFields;

type DedicatedSocial =
  | { kind: "absent" }
  | { kind: "rejected" }
  | { kind: "accepted"; value: string };

const PROFILE_HOSTS: Record<
  Exclude<SocialNetwork, "whatsapp">,
  readonly string[]
> = {
  facebook: FACEBOOK_HOSTS,
  instagram: INSTAGRAM_HOSTS,
  linkedin: LINKEDIN_HOSTS,
};

export function mapGetOblicListingSocial(
  listing: {
    facebook?: unknown;
    instagram?: unknown;
    linkedin?: unknown;
    whatsapp?: unknown;
    social?: unknown;
  } | null
  | undefined,
): GetOblicListingSocialFields {
  const result: GetOblicListingSocialFields = {
    facebook: null,
    instagram: null,
    linkedin: null,
    whatsapp: null,
  };
  const dedicatedPresent: Record<SocialNetwork, boolean> = {
    facebook: false,
    instagram: false,
    linkedin: false,
    whatsapp: false,
  };

  for (const network of ["facebook", "instagram", "linkedin"] as const) {
    const dedicated = mapDedicatedProfile(listing?.[network], PROFILE_HOSTS[network]);
    if (dedicated.kind === "absent") continue;
    dedicatedPresent[network] = true;
    if (dedicated.kind === "accepted") {
      result[network] = dedicated.value;
    }
  }

  const dedicatedWhatsApp = mapDedicatedWhatsApp(listing?.whatsapp);
  if (dedicatedWhatsApp.kind !== "absent") {
    dedicatedPresent.whatsapp = true;
    if (dedicatedWhatsApp.kind === "accepted") {
      result.whatsapp = dedicatedWhatsApp.value;
    }
  }

  for (const entry of readSocialEntries(listing?.social)) {
    const network = supportedNetwork(entry.network);
    if (!network || dedicatedPresent[network] || result[network]) continue;
    const value =
      network === "whatsapp"
        ? acceptedValue(mapDedicatedWhatsApp(entry.url))
        : socialProfileUrl(entry.url, PROFILE_HOSTS[network]);
    if (value) {
      result[network] = value;
    }
  }

  return result;
}

function mapDedicatedProfile(
  value: unknown,
  hosts: readonly string[],
): DedicatedSocial {
  if (typeof value !== "string") return { kind: "absent" };
  const trimmed = value.trim();
  if (!trimmed) return { kind: "absent" };
  if (isUrlLike(trimmed)) {
    if (!acceptProfileUrl(trimmed, hosts)) return { kind: "rejected" };
    return { kind: "accepted", value: cap(trimmed, SOCIAL_URL_MAX) };
  }
  return { kind: "accepted", value: cap(trimmed, SOCIAL_URL_MAX) };
}

function mapDedicatedWhatsApp(value: unknown): DedicatedSocial {
  if (typeof value !== "string") return { kind: "absent" };
  const trimmed = value.trim();
  if (!trimmed) return { kind: "absent" };
  if (isUrlLike(trimmed)) {
    const extracted = extractWhatsAppPhone(trimmed);
    return extracted
      ? { kind: "accepted", value: extracted }
      : { kind: "rejected" };
  }
  if (trimmed.length > WHATSAPP_NUMBER_MAX) return { kind: "rejected" };
  const direct = directWhatsAppNumber(trimmed);
  return direct
    ? { kind: "accepted", value: direct }
    : { kind: "rejected" };
}

function socialProfileUrl(
  value: unknown,
  hosts: readonly string[],
): string | null {
  if (typeof value !== "string" || !isUrlLike(value.trim())) return null;
  return acceptedValue(mapDedicatedProfile(value, hosts));
}

function acceptedValue(value: DedicatedSocial): string | null {
  return value.kind === "accepted" ? value.value : null;
}

function readSocialEntries(
  value: unknown,
): Array<{ network: unknown; url: unknown }> {
  if (!Array.isArray(value)) return [];
  const entries: Array<{ network: unknown; url: unknown }> = [];
  for (const item of value) {
    if (!item || typeof item !== "object" || Array.isArray(item)) continue;
    const record = item as { network?: unknown; url?: unknown };
    entries.push({ network: record.network, url: record.url });
    if (entries.length >= SOCIAL_ENTRY_MAX) break;
  }
  return entries;
}

function supportedNetwork(value: unknown): SocialNetwork | null {
  if (typeof value !== "string") return null;
  const network = value.trim().toLowerCase();
  if (
    network === "facebook" ||
    network === "instagram" ||
    network === "linkedin" ||
    network === "whatsapp"
  ) {
    return network;
  }
  return null;
}

function acceptProfileUrl(value: string, hosts: readonly string[]): boolean {
  const parsed = parseHttpUrl(value);
  if (!parsed) return false;
  return matchesRecognizedHost(parsed.hostname, hosts);
}

function extractWhatsAppPhone(value: string): string | null {
  if (value.length > URL_PARSE_MAX || value.includes("\\") || value.startsWith("//")) {
    return null;
  }
  let parsed: URL;
  try {
    parsed = new URL(hasExplicitScheme(value) ? value : `https://${value}`);
  } catch {
    return null;
  }
  if (parsed.username || parsed.password) return null;

  let token: string | null = null;
  if (parsed.protocol === "http:" || parsed.protocol === "https:") {
    const host = canonicalHost(parsed.hostname);
    if (!WHATSAPP_LINK_HOSTS.has(host)) return null;
    if (host === "wa.me" || host === "www.wa.me") {
      const segments = parsed.pathname.split("/").filter(Boolean);
      if (segments.length !== 1) return null;
      token = safeDecode(segments[0]);
    } else {
      const path = parsed.pathname.replace(/\/+$/, "") || "/";
      if (path !== "/send") return null;
      token = parsed.searchParams.get("phone");
    }
  } else if (parsed.protocol === "whatsapp:") {
    const host = canonicalHost(parsed.hostname);
    if (host !== "send") return null;
    token = parsed.searchParams.get("phone");
  } else {
    return null;
  }

  const digits = phoneTokenDigits(token);
  if (!digits) return null;
  const stored = `+${digits}`;
  if (stored.length > WHATSAPP_NUMBER_MAX) return null;
  if (buildWhatsAppMeUrl(stored) !== `https://wa.me/${digits}`) return null;
  return stored;
}

function directWhatsAppNumber(value: string): string | null {
  if (!/^[+0-9\s().-]+$/.test(value)) return null;
  const plusCount = value.split("+").length - 1;
  if (plusCount > 1) return null;
  if (plusCount === 1 && !value.startsWith("+")) return null;
  const digits = value.replace(/\D/g, "");
  if (digits.length < 8 || digits.length > 15) return null;
  if (buildWhatsAppMeUrl(value) !== `https://wa.me/${digits}`) return null;
  return value;
}

function phoneTokenDigits(value: string | null): string | null {
  if (!value) return null;
  const trimmed = value.trim();
  if (!/^\+?[0-9]{8,15}$/.test(trimmed)) return null;
  return trimmed.replace(/\D/g, "");
}

function parseHttpUrl(value: string): URL | null {
  if (value.length > URL_PARSE_MAX || value.includes("\\") || value.startsWith("//")) {
    return null;
  }
  if (hasExplicitScheme(value)) {
    const protocol = value.slice(0, value.indexOf(":")).toLowerCase();
    if (protocol !== "http" && protocol !== "https") return null;
  }
  try {
    const parsed = new URL(hasExplicitScheme(value) ? value : `https://${value}`);
    if (parsed.username || parsed.password) return null;
    if (parsed.protocol !== "http:" && parsed.protocol !== "https:") return null;
    return parsed;
  } catch {
    return null;
  }
}

function matchesRecognizedHost(
  hostname: string,
  bases: readonly string[],
): boolean {
  const host = canonicalHost(hostname);
  if (!/^[a-z0-9.-]+$/.test(host)) return false;
  return bases.some((base) => host === base || host.endsWith(`.${base}`));
}

function canonicalHost(hostname: string): string {
  return hostname.trim().toLowerCase().replace(/\.$/, "");
}

function isUrlLike(value: string): boolean {
  return (
    hasExplicitScheme(value) ||
    value.startsWith("//") ||
    /^[a-z0-9.-]+\.[a-z]{2,}(?:[/:?#]|$)/i.test(value)
  );
}

function hasExplicitScheme(value: string): boolean {
  return /^[a-z][a-z0-9+.-]*:/i.test(value);
}

function safeDecode(value: string): string {
  try {
    return decodeURIComponent(value);
  } catch {
    return value;
  }
}

function cap(value: string, max: number): string {
  return value.length <= max ? value : value.slice(0, max);
}
