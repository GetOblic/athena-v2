/**
 * Client-safe Prospect Funnel short-link display rules.
 * Does not create links, read storage, or call the Worker.
 */

import { GETOBLIC_SLUG_PATTERN } from "@/lib/getoblic-links/validation";

export const PROSPECT_FUNNEL_SHORT_LINK_CTAS = [
  "ai_agents",
  "virtual_phone",
  "calendar",
  "claim_your_ai",
] as const;

export type ProspectFunnelShortLinkCta =
  (typeof PROSPECT_FUNNEL_SHORT_LINK_CTAS)[number];

export type ProspectFunnelShortLinkMap = Record<
  ProspectFunnelShortLinkCta,
  string | null
>;

export type ProspectFunnelHttpsHrefs = {
  aiAgentsHref: string | null;
  virtualPhoneHref: string | null;
  calendarHref: string | null;
  claimHref: string | null;
};

const CTA_TO_HREF = {
  ai_agents: "aiAgentsHref",
  virtual_phone: "virtualPhoneHref",
  calendar: "calendarHref",
  claim_your_ai: "claimHref",
} as const;

export function isProspectFunnelShortUrl(value: unknown): value is string {
  if (typeof value !== "string" || !value.startsWith("https://")) {
    return false;
  }
  let url: URL;
  try {
    url = new URL(value);
  } catch {
    return false;
  }
  if (url.username || url.password || url.search || url.hash) {
    return false;
  }
  if (url.protocol !== "https:" || url.hostname === "claim.getoblic.com") {
    return false;
  }
  const slug = url.pathname.replace(/^\//, "");
  return url.pathname === `/${slug}` && GETOBLIC_SLUG_PATTERN.test(slug);
}

function isHttpsHref(value: string | null): value is string {
  return typeof value === "string" && value.startsWith("https://");
}

/**
 * Replace an authorized HTTPS CTA href with a short URL.
 * Tel links are not part of this map. Invalid or missing short URLs keep
 * the canonical long URL already rendered for that CTA.
 */
export function applyProspectFunnelShortLinkHrefs(
  canonical: ProspectFunnelHttpsHrefs,
  links: Partial<ProspectFunnelShortLinkMap> | null | undefined,
): ProspectFunnelHttpsHrefs {
  const next: ProspectFunnelHttpsHrefs = { ...canonical };
  if (!links) {
    return next;
  }
  for (const cta of PROSPECT_FUNNEL_SHORT_LINK_CTAS) {
    const hrefKey = CTA_TO_HREF[cta];
    const current = canonical[hrefKey];
    const shortUrl = links[cta];
    if (!isHttpsHref(current) || !isProspectFunnelShortUrl(shortUrl)) {
      continue;
    }
    next[hrefKey] = shortUrl;
  }
  return next;
}

export function readProspectFunnelShortLinkMap(
  payload: unknown,
): ProspectFunnelShortLinkMap | null {
  if (!payload || typeof payload !== "object" || Array.isArray(payload)) {
    return null;
  }
  const record = payload as Record<string, unknown>;
  if (record.ok !== true) {
    return null;
  }
  const links = record.links;
  if (!links || typeof links !== "object" || Array.isArray(links)) {
    return null;
  }
  const source = links as Record<string, unknown>;
  return {
    ai_agents: isProspectFunnelShortUrl(source.ai_agents) ? source.ai_agents : null,
    virtual_phone: isProspectFunnelShortUrl(source.virtual_phone)
      ? source.virtual_phone
      : null,
    calendar: isProspectFunnelShortUrl(source.calendar) ? source.calendar : null,
    claim_your_ai: isProspectFunnelShortUrl(source.claim_your_ai)
      ? source.claim_your_ai
      : null,
  };
}
