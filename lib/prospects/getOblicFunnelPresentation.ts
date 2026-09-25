/**
 * Pure GetOblic Funnel hrefs for Prospect Detail.
 * Paths follow the controlling Licensee's default_language.
 * Server-safe. No Licensee, settings, or WordPress I/O.
 */

import type { OrganizationLanguage } from "@/services/organizationLanguage";

const GETOBLIC_FUNNEL_ORIGIN = "https://claim.getoblic.com";

const GETOBLIC_FUNNEL_PATHS = {
  aiAgents: "/business-portfolio-ai-agent-page",
  virtualPhone: "/business-portfolio-virtual-line-page",
  calendar: "/business-portfolio-booking-page",
} as const;

const GETOBLIC_FUNNEL_FRENCH_PATHS = {
  aiAgents: "/business-portfolio-agent-ia",
  virtualPhone: "/business-portfolio-ligne-virtuelle",
  calendar: "/business-portfolio-calendrier-ia",
} as const;

type GetOblicFunnelPathname =
  | (typeof GETOBLIC_FUNNEL_PATHS)[keyof typeof GETOBLIC_FUNNEL_PATHS]
  | (typeof GETOBLIC_FUNNEL_FRENCH_PATHS)[keyof typeof GETOBLIC_FUNNEL_FRENCH_PATHS];

function selectGetOblicFunnelPaths(language: OrganizationLanguage): {
  aiAgents: GetOblicFunnelPathname;
  virtualPhone: GetOblicFunnelPathname;
  calendar: GetOblicFunnelPathname;
} {
  return language === "fr" ? GETOBLIC_FUNNEL_FRENCH_PATHS : GETOBLIC_FUNNEL_PATHS;
}

export type GetOblicFunnelPresentation = {
  aiAgentsHref: string;
  virtualPhoneHref: string;
  calendarHref: string;
};

export function readGetOblicFunnelPositiveInteger(value: unknown): number | null {
  if (typeof value !== "number" || !Number.isSafeInteger(value) || value <= 0) {
    return null;
  }
  return value;
}

export function readLinkedGetOblicFunnelContactId(
  link:
    | {
        relationship_status?: string | null;
        wordpress_listing_id?: unknown;
      }
    | null
    | undefined,
): number | null {
  if (link?.relationship_status !== "linked") {
    return null;
  }
  return readGetOblicFunnelPositiveInteger(link.wordpress_listing_id);
}

function readBusinessName(value: unknown): string | null {
  if (typeof value !== "string") {
    return null;
  }
  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : null;
}

function buildGetOblicFunnelUrl(
  pathname: GetOblicFunnelPathname,
  authorId: number,
  contactId: number,
  businessName: string,
): string | null {
  const url = new URL(pathname, GETOBLIC_FUNNEL_ORIGIN);
  if (url.origin !== GETOBLIC_FUNNEL_ORIGIN || url.pathname !== pathname) {
    return null;
  }
  url.hash = "";
  url.search = "";
  url.searchParams.set("author_id", String(authorId));
  url.searchParams.set("contact_id", String(contactId));
  url.searchParams.set("business_name", businessName);
  if (url.origin !== GETOBLIC_FUNNEL_ORIGIN || url.pathname !== pathname) {
    return null;
  }
  if (url.searchParams.get("author_id") !== String(authorId)) {
    return null;
  }
  if (url.searchParams.get("contact_id") !== String(contactId)) {
    return null;
  }
  if (url.searchParams.get("business_name") !== businessName) {
    return null;
  }
  if ([...url.searchParams.keys()].length !== 3) {
    return null;
  }
  return url.toString();
}

export function buildGetOblicFunnelPresentation(input: {
  authorId: unknown;
  contactId: unknown;
  businessName: unknown;
  licenseeDefaultLanguage: OrganizationLanguage;
}): GetOblicFunnelPresentation | null {
  const authorId = readGetOblicFunnelPositiveInteger(input.authorId);
  const contactId = readGetOblicFunnelPositiveInteger(input.contactId);
  const businessName = readBusinessName(input.businessName);
  if (authorId == null || contactId == null || !businessName) {
    return null;
  }

  const paths = selectGetOblicFunnelPaths(input.licenseeDefaultLanguage);
  const aiAgentsHref = buildGetOblicFunnelUrl(
    paths.aiAgents,
    authorId,
    contactId,
    businessName,
  );
  const virtualPhoneHref = buildGetOblicFunnelUrl(
    paths.virtualPhone,
    authorId,
    contactId,
    businessName,
  );
  const calendarHref = buildGetOblicFunnelUrl(
    paths.calendar,
    authorId,
    contactId,
    businessName,
  );
  if (!aiAgentsHref || !virtualPhoneHref || !calendarHref) {
    return null;
  }

  return {
    aiAgentsHref,
    virtualPhoneHref,
    calendarHref,
  };
}
