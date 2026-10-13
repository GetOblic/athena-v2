/**
 * Server-side canonical Prospect Funnel destinations.
 * Organization, Prospect, author, contact, and listing come from trusted
 * loaders. Caller-supplied destination URLs are not accepted.
 */

import {
  buildGetOblicFunnelCallHref,
  buildGetOblicFunnelClaimHref,
  buildGetOblicFunnelPresentation,
  readAuthorizedGetOblicFunnelListingId,
  readLinkedGetOblicFunnelContactId,
} from "@/lib/prospects/getOblicFunnelPresentation";
import type { ProspectFunnelShortLinkMap } from "@/lib/prospects/prospectFunnelShortLinkDisplay";
import { resolveGetOblicOutboundContentTarget } from "@/services/getoblicDirectory/getoblicOutboundContentAuthorization";
import { getActiveGetOblicLinkForProspect } from "@/services/getoblicDirectory/getoblicDirectoryService";
import { resolveLicenseeOwnCompanyGetOblicAuthorId } from "@/services/prospects/getOblicFunnelAuthor";
import { getProspectById } from "@/services/prospects/prospectService";
import type { OrganizationLanguage } from "@/services/organizationLanguage";

type ProspectIdentity = {
  id: string;
  business_name: string;
};

type AuthorIdentity = {
  authorId: number | null;
  licenseeDefaultLanguage: OrganizationLanguage;
};

type LinkedIdentity = {
  relationship_status?: string | null;
  wordpress_listing_id?: unknown;
} | null;

export type ProspectFunnelEnsureContext = {
  organizationId: string;
  prospectId: string;
  destinations: ProspectFunnelShortLinkMap;
  callHref: string | null;
};

type ProspectFunnelLoaders = {
  loadProspect: (
    prospectId: string,
    organizationId: string,
  ) => Promise<ProspectIdentity | null>;
  loadAuthor: (organizationId: string) => Promise<AuthorIdentity | null>;
  loadActiveLink: (
    organizationId: string,
    prospectId: string,
  ) => Promise<LinkedIdentity>;
  loadListingId: (input: {
    organizationId: string;
    prospectId: string;
  }) => Promise<number | null>;
};

const defaultLoaders: ProspectFunnelLoaders = {
  loadProspect: getProspectById,
  loadAuthor: resolveLicenseeOwnCompanyGetOblicAuthorId,
  loadActiveLink: getActiveGetOblicLinkForProspect,
  async loadListingId(input) {
    try {
      return readAuthorizedGetOblicFunnelListingId(
        await resolveGetOblicOutboundContentTarget(input),
      );
    } catch {
      console.error("[PROSPECT_FUNNEL_LINKS] authorization_refused", {
        code: "AUTHORIZATION",
      });
      return null;
    }
  },
};

export async function resolveProspectFunnelEnsureContext(input: {
  organizationId: string;
  prospectId: string;
  loaders?: Partial<ProspectFunnelLoaders>;
}): Promise<ProspectFunnelEnsureContext | null> {
  const organizationId = input.organizationId.trim();
  const prospectId = input.prospectId.trim();
  if (!organizationId || !prospectId) return null;

  const loaders = { ...defaultLoaders, ...input.loaders };
  const prospect = await loaders.loadProspect(prospectId, organizationId);
  if (!prospect?.id || prospect.id !== prospectId) return null;

  const [author, activeLink, listingId] = await Promise.all([
    loaders.loadAuthor(organizationId),
    loaders.loadActiveLink(organizationId, prospect.id),
    loaders.loadListingId({
      organizationId,
      prospectId: prospect.id,
    }),
  ]);

  const presentation = author
    ? buildGetOblicFunnelPresentation({
        authorId: author.authorId,
        contactId: readLinkedGetOblicFunnelContactId(activeLink),
        businessName: prospect.business_name.trim(),
        licenseeDefaultLanguage: author.licenseeDefaultLanguage,
      })
    : null;
  const claimHref = buildGetOblicFunnelClaimHref({
    authorId: author?.authorId ?? null,
    listingId,
    businessName: prospect.business_name,
    licenseeDefaultLanguage: author?.licenseeDefaultLanguage ?? null,
  });
  const callHref = buildGetOblicFunnelCallHref({
    listingId,
    licenseeDefaultLanguage: author?.licenseeDefaultLanguage ?? null,
  });

  return {
    organizationId,
    prospectId: prospect.id,
    destinations: {
      ai_agents: presentation?.aiAgentsHref ?? null,
      virtual_phone: presentation?.virtualPhoneHref ?? null,
      calendar: presentation?.calendarHref ?? null,
      claim_your_ai: claimHref,
    },
    callHref,
  };
}
