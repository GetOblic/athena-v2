/**
 * Bounded source context for independent GetOblic Description and Knowledge
 * Base drafts.
 *
 * Uses the original Prospect, its prospect-intelligence discussion, and
 * exactly one current Executive Intelligence version in the source
 * organization. Client Brain and the Client Identity snapshot are not read.
 */

import { isDeepV1WebsiteIntelligenceProvider } from "@/services/ai/prompts/knowledgeBaseEnhancementConstraints";
import type { ExecutiveIntelligenceVersion } from "@/services/executiveVersions/executiveVersionTypes";
import { listExecutiveVersions } from "@/services/executiveVersions/executiveVersionService";
import { getDiscussionById, type Discussion } from "@/services/discussionService";
import {
  retainAuthorizedExecutiveVersions,
  retainAuthorizedProspectDiscussion,
  selectSingleCurrentExecutiveVersion,
} from "@/services/clientProspectIntelligence/clientProspectIntelligenceRead";
import {
  extractUsableWebsiteIntelligence,
  type GetoblicDescriptionIdentityAnchors,
} from "@/services/prospects/prospectGetoblicDescription";
import { getProspectById, type Prospect } from "@/services/prospects/prospectService";

export const GETOBLIC_CONTENT_EXECUTIVE_FACT_MAX_CHARS = 1_000;
export const GETOBLIC_CONTENT_BUSINESS_FACT_MAX_CHARS = 800;

export class GetoblicContentDraftError extends Error {
  readonly code: string;
  readonly httpStatus: number;

  constructor(code: string, message: string, httpStatus: number) {
    super(message);
    this.name = "GetoblicContentDraftError";
    this.code = code;
    this.httpStatus = httpStatus;
  }
}

export type GetoblicContentExecutiveFacts = {
  summary: string | null;
  painPoints: string | null;
  intent: string | null;
  opportunityTitle: string | null;
  opportunityReason: string | null;
  briefingSummary: string | null;
};

export type GetoblicContentBusinessFacts = {
  industry: string | null;
  category: string | null;
  website: string | null;
  phone: string | null;
  email: string | null;
  address: string | null;
  notes: string | null;
  additionalContext: string | null;
};

export type GetoblicContentGenerationContext = {
  sourceOrganizationId: string;
  prospectId: string;
  discussionId: string;
  executiveVersionId: string;
  identity: GetoblicDescriptionIdentityAnchors;
  businessFacts: GetoblicContentBusinessFacts;
  websiteIntelligence: Record<string, string>;
  usesDeepWebsiteIntelligence: boolean;
  executiveFacts: GetoblicContentExecutiveFacts;
};

export type GetoblicContentGenerationContextDeps = {
  getProspect?: (
    id: string,
    organizationId: string,
  ) => Promise<Prospect | null>;
  getDiscussion?: (
    id: string,
    organizationId: string,
  ) => Promise<Discussion | null>;
  listExecutiveVersions?: (
    discussionId: string,
    organizationId: string,
  ) => Promise<ExecutiveIntelligenceVersion[]>;
};

function unavailable(): never {
  throw new GetoblicContentDraftError(
    "CURRENT_EXECUTIVE_VERSION_UNAVAILABLE",
    "A single current Executive Intelligence version is required.",
    409,
  );
}

function notFound(): never {
  throw new GetoblicContentDraftError(
    "NOT_FOUND",
    "Prospect not found.",
    404,
  );
}

function readRecord(value: unknown): Record<string, unknown> | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  return value as Record<string, unknown>;
}

function boundedText(value: unknown, max: number): string | null {
  if (typeof value !== "string") return null;
  const trimmed = value.replace(/\s+/g, " ").trim();
  if (!trimmed) return null;
  return trimmed.length > max ? trimmed.slice(0, max).trim() : trimmed;
}

export function extractBoundedExecutiveFacts(
  intelligence: unknown,
): GetoblicContentExecutiveFacts {
  const root = readRecord(intelligence);
  const analysis = readRecord(root?.analysis);
  const opportunity = readRecord(root?.opportunity);
  const briefing = readRecord(root?.briefing);
  const max = GETOBLIC_CONTENT_EXECUTIVE_FACT_MAX_CHARS;
  return {
    summary: boundedText(analysis?.summary, max),
    painPoints: boundedText(analysis?.pain_points, max),
    intent: boundedText(analysis?.intent, max),
    opportunityTitle: boundedText(
      opportunity?.title ?? analysis?.opportunity_title,
      max,
    ),
    opportunityReason: boundedText(
      opportunity?.reason ?? analysis?.opportunity_reason,
      max,
    ),
    briefingSummary: boundedText(briefing?.summary, max),
  };
}

function businessFactsFrom(
  prospect: Pick<
    Prospect,
    | "industry"
    | "category"
    | "website"
    | "phone"
    | "email"
    | "address"
    | "notes"
    | "additional_context"
  >,
): GetoblicContentBusinessFacts {
  const max = GETOBLIC_CONTENT_BUSINESS_FACT_MAX_CHARS;
  return {
    industry: boundedText(prospect.industry, max),
    category: boundedText(prospect.category, max),
    website: boundedText(prospect.website, max),
    phone: boundedText(prospect.phone, max),
    email: boundedText(prospect.email, max),
    address: boundedText(prospect.address, max),
    notes: boundedText(prospect.notes, max),
    additionalContext: boundedText(prospect.additional_context, max),
  };
}

export function hasBoundedExecutiveFacts(
  facts: GetoblicContentExecutiveFacts,
): boolean {
  return Object.values(facts).some(
    (value) => typeof value === "string" && value.trim().length > 0,
  );
}

export async function loadGetoblicContentGenerationContext(
  input: {
    prospectId: string;
    sourceOrganizationId: string;
  },
  deps: GetoblicContentGenerationContextDeps = {},
): Promise<GetoblicContentGenerationContext> {
  const prospectId = input.prospectId.trim();
  const sourceOrganizationId = input.sourceOrganizationId.trim();
  if (!prospectId || !sourceOrganizationId) {
    notFound();
  }

  const loadProspect = deps.getProspect ?? getProspectById;
  const loadDiscussion = deps.getDiscussion ?? getDiscussionById;
  const loadVersions = deps.listExecutiveVersions ?? listExecutiveVersions;

  const prospect = await loadProspect(prospectId, sourceOrganizationId);
  if (
    !prospect ||
    prospect.id !== prospectId ||
    prospect.organization_id !== sourceOrganizationId
  ) {
    notFound();
  }

  const discussionId =
    typeof prospect.linked_discussion_id === "string"
      ? prospect.linked_discussion_id.trim()
      : "";
  if (!discussionId) unavailable();

  const discussion = retainAuthorizedProspectDiscussion(
    await loadDiscussion(discussionId, sourceOrganizationId),
    { discussionId, sourceOrganizationId },
  );
  if (!discussion) unavailable();

  const versions = retainAuthorizedExecutiveVersions(
    await loadVersions(discussion.id, sourceOrganizationId),
    { discussionId: discussion.id, sourceOrganizationId },
  );
  const current = selectSingleCurrentExecutiveVersion(versions);
  if (!current) unavailable();

  const name = boundedText(prospect.business_name, 200);
  if (!name) notFound();

  return {
    sourceOrganizationId,
    prospectId,
    discussionId: discussion.id,
    executiveVersionId: current.id,
    identity: {
      name,
      city: boundedText(prospect.city, 120),
      state: boundedText(prospect.state, 120),
      country: boundedText(prospect.country, 120),
    },
    businessFacts: businessFactsFrom(prospect),
    websiteIntelligence: extractUsableWebsiteIntelligence(
      prospect.website_intelligence,
    ),
    usesDeepWebsiteIntelligence: isDeepV1WebsiteIntelligenceProvider(
      prospect.website_intelligence,
    ),
    executiveFacts: extractBoundedExecutiveFacts(current.intelligence),
  };
}
