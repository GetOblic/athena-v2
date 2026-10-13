import {
  readBusinessContextWithinBudget,
  readCommunityDiscoveryBusinessContext,
} from "@/services/communityDiscovery/communityDiscoveryBusinessContext";
import {
  CommunityDiscoveryRequestError,
  communityDiscoveryPersistenceFailure,
} from "@/services/communityDiscovery/communityDiscoveryErrors";
import {
  COMMUNITY_DISCOVERY_IDENTITY_READ_TIMEOUT_MS,
  COMMUNITY_DISCOVERY_QUALIFICATION_TIMEOUT_MS,
  COMMUNITY_DISCOVERY_SEARCH_LIMIT,
  COMMUNITY_DISCOVERY_SEARCH_TIMEOUT_MS,
} from "@/services/communityDiscovery/communityDiscoveryLimits";
import {
  qualifyDiscoveredCommunities,
  type CommunityQualificationOutcome,
  type CommunityQualificationReason,
} from "@/services/communityDiscovery/communityDiscoveryQualification";
import {
  assertDiscoveryObjective,
  buildFacebookGroupsSearchQuery,
} from "@/services/communityDiscovery/communityDiscoveryQuery";
import type {
  PublicCommunityCatalog,
  PublicCommunityRecord,
} from "@/services/communityDiscovery/communityDiscoveryPersistence";
import { PUBLIC_COMMUNITY_CATALOG_SOURCE } from "@/services/communityDiscovery/communityDiscoveryPersistence";
import {
  CommunitySearchError,
  type CommunitySearchHit,
  type CommunitySearchProvider,
  type CommunitySearchProviderId,
} from "@/services/communityDiscovery/communitySearchProvider";
import {
  boundCommunityEvidenceSnippet,
  sanitizePublicCommunityDisplayName,
  specificFacebookGroupEvidenceSnippet,
} from "@/services/communityDiscovery/publicCommunityName";
import type { SocialCommunityPlatform } from "@/services/communityDiscovery/socialCommunityPlatform";
import { normalizeSocialCommunityUrl } from "@/services/communityDiscovery/socialCommunityRegistry";

export type CommunityDiscoveryQualification =
  | {
      status: "available";
      /** Relevance explanation from the qualification completion. */
      explanation?: string;
      /** Short engagement note. Not the post. */
      engagementGuidance?: string;
      /** Ready-to-paste message. Present only when the draft passed validation. */
      suggestedContribution?: string;
      /** A draft or guidance was returned, but no usable message remains. */
      readyToPasteUnavailable?: boolean;
    }
  | {
      status: "unavailable";
      reason: CommunityQualificationReason | "not_provided";
    };

export type CommunityDiscoveryResult = {
  platform: SocialCommunityPlatform;
  canonicalIdentity: string;
  canonicalUrl: string;
  displayName: string;
  source: typeof PUBLIC_COMMUNITY_CATALOG_SOURCE;
  sourcedAt: string;
  catalog: "reused" | "created";
  evidence: {
    title: string;
    snippet: string;
  };
  qualification: CommunityDiscoveryQualification;
};

export type CommunityDiscoveryResponse = {
  platform: "facebook_groups";
  objective: string;
  searchProvider: CommunitySearchProviderId;
  qualification:
    | { status: "available" }
    | {
        status: "unavailable";
        reason: CommunityQualificationReason | "not_needed";
      };
  results: CommunityDiscoveryResult[];
};

type DiscoveryCandidate = {
  platform: SocialCommunityPlatform;
  canonicalIdentity: string;
  canonicalUrl: string;
  displayName: string;
  evidenceTitle: string;
  evidenceSnippet: string;
};

function assertOrganizationId(organizationId: string): string {
  if (typeof organizationId !== "string" || organizationId.trim() === "") {
    throw new CommunityDiscoveryRequestError(
      "INVALID_REQUEST",
      "Organization context is required.",
      400,
    );
  }
  return organizationId.trim();
}

function withTimeout(parent: AbortSignal | undefined, timeoutMs: number): AbortSignal {
  const timeout = AbortSignal.timeout(timeoutMs);
  return parent ? AbortSignal.any([parent, timeout]) : timeout;
}

function rethrowSearchError(error: unknown): never {
  if (error instanceof CommunitySearchError) {
    if (error.code === "unconfigured") {
      throw new CommunityDiscoveryRequestError(
        "PROVIDER_UNCONFIGURED",
        "Community search is not configured.",
        503,
      );
    }
    if (error.code === "timeout") {
      throw new CommunityDiscoveryRequestError(
        "PROVIDER_TIMEOUT",
        "Community search timed out.",
        504,
      );
    }
    throw new CommunityDiscoveryRequestError(
      "PROVIDER_UNAVAILABLE",
      "Community search is unavailable.",
      502,
    );
  }
  throw error;
}

function candidatesFromHits(hits: readonly CommunitySearchHit[]): DiscoveryCandidate[] {
  const seen = new Set<string>();
  const candidates: DiscoveryCandidate[] = [];

  for (const hit of hits.slice(0, COMMUNITY_DISCOVERY_SEARCH_LIMIT)) {
    const normalized = normalizeSocialCommunityUrl(hit.url);
    if (!normalized.ok) continue;
    const key = `${normalized.community.platform}:${normalized.community.canonicalIdentity}`;
    if (seen.has(key)) continue;
    if (typeof hit?.title !== "string" || typeof hit.url !== "string") continue;
    const displayName = sanitizePublicCommunityDisplayName(hit.title);
    if (!displayName) continue;
    seen.add(key);
    candidates.push({
      platform: normalized.community.platform,
      canonicalIdentity: normalized.community.canonicalIdentity,
      canonicalUrl: normalized.community.canonicalUrl,
      displayName,
      evidenceTitle: displayName,
      evidenceSnippet:
        normalized.community.platform === "facebook_groups"
          ? specificFacebookGroupEvidenceSnippet(hit.snippet, displayName)
          : boundCommunityEvidenceSnippet(hit.snippet),
    });
  }

  return candidates;
}

function resultQualification(
  outcome: CommunityQualificationOutcome,
  canonicalIdentity: string,
): CommunityDiscoveryQualification {
  if (outcome.status === "unavailable") {
    return { status: "unavailable", reason: outcome.reason };
  }
  const explanation = outcome.explanations.get(canonicalIdentity);
  const suggestedContribution = outcome.suggestions?.get(canonicalIdentity);
  const engagementGuidance = outcome.engagementGuidance?.get(canonicalIdentity);
  const readyToPasteUnavailable =
    outcome.readyToPasteUnavailable?.has(canonicalIdentity) === true;
  if (
    !explanation &&
    !suggestedContribution &&
    !engagementGuidance &&
    !readyToPasteUnavailable
  ) {
    return { status: "unavailable", reason: "not_provided" };
  }
  return {
    status: "available",
    ...(explanation ? { explanation } : {}),
    ...(engagementGuidance ? { engagementGuidance } : {}),
    ...(suggestedContribution ? { suggestedContribution } : {}),
    ...(!suggestedContribution && readyToPasteUnavailable
      ? { readyToPasteUnavailable: true as const }
      : {}),
  };
}

export async function discoverSocialCommunities(input: {
  organizationId: string;
  objective: string;
  searchQuery: string;
  provider: CommunitySearchProvider;
  catalog: PublicCommunityCatalog;
  qualify?: typeof qualifyDiscoveredCommunities;
  readBusinessContext?: (organizationId: string) => Promise<string>;
  identityReadTimeoutMs?: number;
  now?: Date;
  signal?: AbortSignal;
}): Promise<Omit<CommunityDiscoveryResponse, "platform">> {
  const organizationId = assertOrganizationId(input.organizationId);
  const sourcedAt = (input.now ?? new Date()).toISOString();
  const searchSignal = withTimeout(
    input.signal,
    COMMUNITY_DISCOVERY_SEARCH_TIMEOUT_MS,
  );
  const businessContextPromise = readBusinessContextWithinBudget({
    organizationId,
    read: input.readBusinessContext ?? readCommunityDiscoveryBusinessContext,
    timeoutMs:
      input.identityReadTimeoutMs ?? COMMUNITY_DISCOVERY_IDENTITY_READ_TIMEOUT_MS,
  });

  let hits: CommunitySearchHit[];
  try {
    hits = await input.provider.search({
      query: input.searchQuery,
      limit: COMMUNITY_DISCOVERY_SEARCH_LIMIT,
      signal: searchSignal,
    });
  } catch (error) {
    await businessContextPromise;
    rethrowSearchError(error);
  }
  const businessContext = await businessContextPromise;
  if (!Array.isArray(hits)) {
    throw new CommunityDiscoveryRequestError(
      "PROVIDER_UNAVAILABLE",
      "Community search is unavailable.",
      502,
    );
  }

  const candidates = candidatesFromHits(hits);
  const byPlatform = new Map<SocialCommunityPlatform, DiscoveryCandidate[]>();
  for (const candidate of candidates) {
    const group = byPlatform.get(candidate.platform) ?? [];
    group.push(candidate);
    byPlatform.set(candidate.platform, group);
  }

  const resolved = new Map<
    string,
    { record: PublicCommunityRecord; catalog: "reused" | "created" }
  >();

  // One platform at a time. Each group is one identity lookup and, when any
  // identity is new, one insert. A second lookup runs only for identities the
  // insert representation did not return.
  for (const [platform, group] of byPlatform) {
    const identities = group.map((candidate) => candidate.canonicalIdentity);
    const existing = await input.catalog.findByIdentities(platform, identities);
    const existingByIdentity = new Map(
      existing.map((record) => [record.canonicalIdentity, record]),
    );
    const inserted = await input.catalog.insertMissing(
      group
        .filter(
          (candidate) => !existingByIdentity.has(candidate.canonicalIdentity),
        )
        .map((candidate) => ({
          platform: candidate.platform,
          canonicalIdentity: candidate.canonicalIdentity,
          canonicalUrl: candidate.canonicalUrl,
          displayName: candidate.displayName,
          sourcedAt,
        })),
    );
    const resolvedByIdentity = new Map(existingByIdentity);
    for (const record of inserted) {
      if (!resolvedByIdentity.has(record.canonicalIdentity)) {
        resolvedByIdentity.set(record.canonicalIdentity, record);
      }
    }
    const unresolved = identities.filter(
      (identity) => !resolvedByIdentity.has(identity),
    );
    if (unresolved.length > 0) {
      const after = await input.catalog.findByIdentities(platform, unresolved);
      for (const record of after) {
        resolvedByIdentity.set(record.canonicalIdentity, record);
      }
    }

    for (const candidate of group) {
      const record = resolvedByIdentity.get(candidate.canonicalIdentity);
      if (!record) communityDiscoveryPersistenceFailure();
      if (record.suppressionState !== "active") continue;
      resolved.set(`${platform}:${candidate.canonicalIdentity}`, {
        record,
        catalog: existingByIdentity.has(candidate.canonicalIdentity)
          ? "reused"
          : "created",
      });
    }
  }

  const visible = candidates.flatMap((candidate) => {
    const match = resolved.get(
      `${candidate.platform}:${candidate.canonicalIdentity}`,
    );
    return match ? [{ candidate, ...match }] : [];
  });

  let outcome: CommunityQualificationOutcome | null = null;
  if (visible.length > 0) {
    try {
      outcome = await (input.qualify ?? qualifyDiscoveredCommunities)({
        objective: input.objective,
        businessContext,
        signal: withTimeout(
          input.signal,
          COMMUNITY_DISCOVERY_QUALIFICATION_TIMEOUT_MS,
        ),
        candidates: visible.map((item) => ({
          canonicalIdentity: item.record.canonicalIdentity,
          canonicalUrl: item.record.canonicalUrl,
          title: item.candidate.evidenceTitle,
          snippet: item.candidate.evidenceSnippet,
        })),
      });
    } catch {
      outcome = { status: "unavailable", reason: "error" };
    }
  }

  const qualification =
    outcome === null
      ? ({ status: "unavailable", reason: "not_needed" } as const)
      : outcome.status === "available"
        ? ({ status: "available" } as const)
        : ({ status: "unavailable", reason: outcome.reason } as const);

  return {
    objective: input.objective,
    searchProvider: input.provider.providerId,
    qualification,
    results: visible.map((item) => ({
      platform: item.record.platform,
      canonicalIdentity: item.record.canonicalIdentity,
      canonicalUrl: item.record.canonicalUrl,
      displayName: item.record.displayName,
      source: item.record.source,
      sourcedAt: item.record.sourcedAt,
      catalog: item.catalog,
      evidence: {
        title: item.candidate.evidenceTitle,
        snippet: item.candidate.evidenceSnippet,
      },
      qualification: resultQualification(
        outcome ?? { status: "unavailable", reason: "error" },
        item.record.canonicalIdentity,
      ),
    })),
  };
}

export async function discoverFacebookGroups(input: {
  organizationId: string;
  objective: unknown;
  provider: CommunitySearchProvider;
  catalog: PublicCommunityCatalog;
  qualify?: typeof qualifyDiscoveredCommunities;
  readBusinessContext?: (organizationId: string) => Promise<string>;
  identityReadTimeoutMs?: number;
  now?: Date;
  signal?: AbortSignal;
}): Promise<CommunityDiscoveryResponse> {
  const objective = assertDiscoveryObjective(input.objective);
  const discovery = await discoverSocialCommunities({
    organizationId: input.organizationId,
    objective,
    searchQuery: buildFacebookGroupsSearchQuery(objective),
    provider: input.provider,
    catalog: input.catalog,
    qualify: input.qualify,
    readBusinessContext: input.readBusinessContext,
    identityReadTimeoutMs: input.identityReadTimeoutMs,
    now: input.now,
    signal: input.signal,
  });

  return {
    platform: "facebook_groups",
    ...discovery,
  };
}
