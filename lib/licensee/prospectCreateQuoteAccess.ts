/**
 * Pure Create Quote visibility decision.
 * No database and no session switch. The server adapter confirms the
 * relationship before anything is shown.
 */

import { prospectCreateQuoteEstimateHref } from "@/lib/licensee/prospectCreateQuoteHref";
import { parseLicenseeOriginCookieValue } from "@/services/licensee/licenseeOriginCookie";
import {
  isOrganizationLanguage,
  type OrganizationLanguage,
} from "@/services/organizationLanguage";

const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export type ProspectCreateQuoteOrigin = {
  masterUserId: string;
  licenseeAccountId: string;
  organizationId: string;
  prospectId: string;
};

export type ProspectCreateQuoteAccess = {
  visible: true;
  organizationId: string;
  prospectId: string;
  language: OrganizationLanguage;
  href: string;
};

export type ProspectCreateQuoteAccessDeps = {
  getAccount: (
    masterUserId: string,
  ) => Promise<{ id: string; defaultLanguage: string | null } | null>;
  isMasterActive: (masterUserId: string) => Promise<boolean>;
  ownsSubAccount: (
    licenseeAccountId: string,
    organizationId: string,
  ) => Promise<boolean>;
};

function isUuid(value: string): boolean {
  return UUID_RE.test(value);
}

/**
 * A cookie for another organization is rejected before any relationship lookup.
 */
export function evaluateProspectCreateQuoteOrigin(input: {
  organizationId: string;
  prospectId: string;
  originCookieValue: string | null | undefined;
}): ProspectCreateQuoteOrigin | null {
  const organizationId = input.organizationId.trim();
  const prospectId = input.prospectId.trim();
  if (!isUuid(organizationId) || !isUuid(prospectId)) return null;
  const origin = parseLicenseeOriginCookieValue(input.originCookieValue);
  if (!origin) return null;
  if (origin.organizationId !== organizationId) return null;
  if (!isUuid(origin.masterUserId) || !isUuid(origin.licenseeAccountId)) {
    return null;
  }
  return {
    masterUserId: origin.masterUserId,
    licenseeAccountId: origin.licenseeAccountId,
    organizationId,
    prospectId,
  };
}

export async function confirmProspectCreateQuoteAccess(
  origin: ProspectCreateQuoteOrigin,
  deps: ProspectCreateQuoteAccessDeps,
): Promise<ProspectCreateQuoteAccess | null> {
  const account = await deps.getAccount(origin.masterUserId);
  if (!account || account.id !== origin.licenseeAccountId) return null;
  const active = await deps.isMasterActive(origin.masterUserId);
  if (!active) return null;
  const owns = await deps.ownsSubAccount(
    origin.licenseeAccountId,
    origin.organizationId,
  );
  if (!owns) return null;
  const language = isOrganizationLanguage(account.defaultLanguage)
    ? account.defaultLanguage
    : "en";
  return {
    visible: true,
    organizationId: origin.organizationId,
    prospectId: origin.prospectId,
    language,
    href: prospectCreateQuoteEstimateHref(origin.organizationId, origin.prospectId),
  };
}
