/**
 * Licensee Master Useful Links hrefs.
 * Own Company author_id only. No Prospect contact or business name.
 * Paths follow the authenticated Licensee's default_language.
 * Server-safe. No settings, Licensee identity, or WordPress I/O.
 */

import type { OrganizationLanguage } from "@/services/organizationLanguage";

const LICENSEE_USEFUL_LINKS_ORIGIN = "https://claim.getoblic.com";

const LICENSEE_USEFUL_LINKS_PATHS = {
  aiAgents: "/business-portfolio-ai-agent-page",
  virtualPhone: "/business-portfolio-virtual-line-page",
  calendar: "/business-portfolio-booking-page",
} as const;

const LICENSEE_USEFUL_LINKS_FRENCH_PATHS = {
  aiAgents: "/business-portfolio-agent-ia",
  virtualPhone: "/business-portfolio-ligne-virtuelle",
  calendar: "/business-portfolio-calendrier-ia",
} as const;

type LicenseeUsefulLinkPathname =
  | (typeof LICENSEE_USEFUL_LINKS_PATHS)[keyof typeof LICENSEE_USEFUL_LINKS_PATHS]
  | (typeof LICENSEE_USEFUL_LINKS_FRENCH_PATHS)[keyof typeof LICENSEE_USEFUL_LINKS_FRENCH_PATHS];

function selectLicenseeUsefulLinkPaths(language: OrganizationLanguage): {
  aiAgents: LicenseeUsefulLinkPathname;
  virtualPhone: LicenseeUsefulLinkPathname;
  calendar: LicenseeUsefulLinkPathname;
} {
  return language === "fr"
    ? LICENSEE_USEFUL_LINKS_FRENCH_PATHS
    : LICENSEE_USEFUL_LINKS_PATHS;
}

export type LicenseeUsefulLinks = {
  aiAgentsHref: string;
  virtualPhoneHref: string;
  calendarHref: string;
};

export function readLicenseeUsefulLinksAuthorId(value: unknown): number | null {
  if (typeof value !== "number" || !Number.isSafeInteger(value) || value <= 0) {
    return null;
  }
  return value;
}

function buildLicenseeUsefulLink(
  pathname: LicenseeUsefulLinkPathname,
  authorId: number,
): string | null {
  const url = new URL(pathname, LICENSEE_USEFUL_LINKS_ORIGIN);
  if (url.origin !== LICENSEE_USEFUL_LINKS_ORIGIN || url.pathname !== pathname) {
    return null;
  }
  url.hash = "";
  url.search = "";
  url.searchParams.set("author_id", String(authorId));
  const keys = [...url.searchParams.keys()];
  if (
    url.origin !== LICENSEE_USEFUL_LINKS_ORIGIN ||
    url.pathname !== pathname ||
    keys.length !== 1 ||
    keys[0] !== "author_id" ||
    url.searchParams.get("author_id") !== String(authorId)
  ) {
    return null;
  }
  return url.toString();
}

export function buildLicenseeUsefulLinks(
  authorId: unknown,
  language: OrganizationLanguage,
): LicenseeUsefulLinks | null {
  const safeAuthorId = readLicenseeUsefulLinksAuthorId(authorId);
  if (safeAuthorId == null) {
    return null;
  }

  const paths = selectLicenseeUsefulLinkPaths(language);
  const aiAgentsHref = buildLicenseeUsefulLink(paths.aiAgents, safeAuthorId);
  const virtualPhoneHref = buildLicenseeUsefulLink(
    paths.virtualPhone,
    safeAuthorId,
  );
  const calendarHref = buildLicenseeUsefulLink(paths.calendar, safeAuthorId);
  if (!aiAgentsHref || !virtualPhoneHref || !calendarHref) {
    return null;
  }

  return {
    aiAgentsHref,
    virtualPhoneHref,
    calendarHref,
  };
}
