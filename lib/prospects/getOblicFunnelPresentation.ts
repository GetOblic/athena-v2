/**
 * Pure GetOblic Funnel hrefs for Prospect Detail.
 * Paths follow the controlling Licensee's default_language.
 * Claim your AI reuses the business_created template and adds author_id.
 * Call your AI is a tel: URI. It is not an HTTP destination.
 * Server-safe. No Licensee, settings, or WordPress I/O.
 */

import { buildTemplateDestinationUrl } from "@/lib/getoblic-links/templates";
import {
  isOrganizationLanguage,
  type OrganizationLanguage,
} from "@/services/organizationLanguage";

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

const GETOBLIC_FUNNEL_CALL_TELEPHONE_FR = "+33939204080";
const GETOBLIC_FUNNEL_CALL_TELEPHONE_DEFAULT = "+18666658001";

const AUTHORIZED_GETOBLIC_FUNNEL_LISTING_MODES = new Set([
  "linked_owner",
  "unclaimed_authorized",
]);

/**
 * Listing id for the two new CTAs.
 * Only the resolver's authorized outcomes qualify.
 * Claiming, remote_missing, released, and any other mode fail closed.
 */
export function readAuthorizedGetOblicFunnelListingId(
  target:
    | {
        mode?: string | null;
        wordpressListingId?: unknown;
      }
    | null
    | undefined,
): number | null {
  if (!target || !AUTHORIZED_GETOBLIC_FUNNEL_LISTING_MODES.has(target.mode ?? "")) {
    return null;
  }
  return readGetOblicFunnelPositiveInteger(target.wordpressListingId);
}

export function buildGetOblicFunnelCallHref(input: {
  listingId: unknown;
  licenseeDefaultLanguage: unknown;
}): string | null {
  const listingId = readGetOblicFunnelPositiveInteger(input.listingId);
  if (listingId == null || !isOrganizationLanguage(input.licenseeDefaultLanguage)) {
    return null;
  }
  const telephone =
    input.licenseeDefaultLanguage === "fr"
      ? GETOBLIC_FUNNEL_CALL_TELEPHONE_FR
      : GETOBLIC_FUNNEL_CALL_TELEPHONE_DEFAULT;
  return `tel:${telephone},${listingId}#`;
}

export function buildGetOblicFunnelClaimHref(input: {
  authorId: unknown;
  listingId: unknown;
  businessName: unknown;
  licenseeDefaultLanguage: unknown;
}): string | null {
  const authorId = readGetOblicFunnelPositiveInteger(input.authorId);
  const listingId = readGetOblicFunnelPositiveInteger(input.listingId);
  const businessName = readBusinessName(input.businessName);
  if (
    authorId == null ||
    listingId == null ||
    !businessName ||
    !isOrganizationLanguage(input.licenseeDefaultLanguage)
  ) {
    return null;
  }

  let templateHref: string;
  try {
    templateHref = buildTemplateDestinationUrl({
      templateId: "business_created",
      language: input.licenseeDefaultLanguage,
      params: {
        contact_id: String(listingId),
        business_name: businessName,
      },
    });
  } catch {
    return null;
  }

  let templateUrl: URL;
  try {
    templateUrl = new URL(templateHref);
  } catch {
    return null;
  }
  if (
    templateUrl.origin !== GETOBLIC_FUNNEL_ORIGIN ||
    templateUrl.username !== "" ||
    templateUrl.password !== "" ||
    templateUrl.hash !== "" ||
    templateUrl.searchParams.get("contact_id") !== String(listingId) ||
    templateUrl.searchParams.get("business_name") !== businessName ||
    [...templateUrl.searchParams.keys()].length !== 2
  ) {
    return null;
  }

  const pathname = templateUrl.pathname;
  const url = new URL(pathname, GETOBLIC_FUNNEL_ORIGIN);
  if (url.origin !== GETOBLIC_FUNNEL_ORIGIN || url.pathname !== pathname) {
    return null;
  }
  url.hash = "";
  url.search = "";
  url.searchParams.set("author_id", String(authorId));
  url.searchParams.set("contact_id", String(listingId));
  url.searchParams.set("business_name", businessName);
  if (
    url.origin !== GETOBLIC_FUNNEL_ORIGIN ||
    url.pathname !== pathname ||
    url.searchParams.get("author_id") !== String(authorId) ||
    url.searchParams.get("contact_id") !== String(listingId) ||
    url.searchParams.get("business_name") !== businessName ||
    [...url.searchParams.keys()].length !== 3
  ) {
    return null;
  }

  const href = url.toString();
  if (href.split("?").length !== 2) {
    return null;
  }
  return href;
}
