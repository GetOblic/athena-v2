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
  COMMUNITY_DISCOVERY_MAX_SEARCH_PAGES,
  COMMUNITY_DISCOVERY_QUALIFICATION_TIMEOUT_MS,
  COMMUNITY_DISCOVERY_SEARCH_LIMIT,
  COMMUNITY_DISCOVERY_SEARCH_TIMEOUT_MS,
} from "@/services/communityDiscovery/communityDiscoveryLimits";
import type { CommunityDiscoveryLedger } from "@/services/communityDiscovery/communityDiscoveryLedger";
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
  PublicCommunityDisplayNameRepair,
  PublicCommunityRecord,
} from "@/services/communityDiscovery/communityDiscoveryPersistence";
import { PUBLIC_COMMUNITY_CATALOG_SOURCE } from "@/services/communityDiscovery/communityDiscoveryPersistence";
import {
  CommunitySearchError,
  type CommunitySearchHit,
  type CommunitySearchProvider,
  type CommunitySearchProviderId,
} from "@/services/communityDiscovery/communitySearchProvider";
import { facebookGroupsListingKind } from "@/services/communityDiscovery/facebookGroupsUrl";
import {
  boundCommunityEvidenceSnippet,
  facebookGroupDisplayNameFromTitle,
  facebookGroupRootEvidenceSnippet,
  isReliableFacebookGroupCatalogName,
  sanitizePublicCommunityDisplayName,
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

export type CommunityDiscoveryContinuation = {
  moreAvailable: boolean;
  exhausted: boolean;
  /** Opaque server token for the next page. The client cannot choose a Brave offset. */
  token: string | null;
  /** Opaque receipt so a refresh can ask whether results are still recoverable. */
  sessionToken: string | null;
};

export type CommunityDiscoveryRecovery = "active" | "lost";

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
  continuation: CommunityDiscoveryContinuation;
  recovery: CommunityDiscoveryRecovery | null;
};

const IDLE_CONTINUATION: CommunityDiscoveryContinuation = {
  moreAvailable: false,
  exhausted: false,
  token: null,
  sessionToken: null,
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

function candidateFromHit(
  hit: CommunitySearchHit,
): { key: string; candidate: DiscoveryCandidate; groupRoot: boolean } | null {
  if (typeof hit?.title !== "string" || typeof hit.url !== "string") return null;
  const listingKind = facebookGroupsListingKind(hit.url);
  const normalized = normalizeSocialCommunityUrl(hit.url);
  if (!normalized.ok) return null;

  const facebook = normalized.community.platform === "facebook_groups";
  // A post, permalink, or other subpage never establishes a group name.
  if (facebook && listingKind !== "group_root") return null;

  const displayName = facebook
    ? facebookGroupDisplayNameFromTitle(
        hit.title,
        normalized.community.canonicalIdentity,
      )
    : sanitizePublicCommunityDisplayName(hit.title);
  if (!displayName) return null;

  return {
    key: `${normalized.community.platform}:${normalized.community.canonicalIdentity}`,
    groupRoot: facebook,
    candidate: {
      platform: normalized.community.platform,
      canonicalIdentity: normalized.community.canonicalIdentity,
      canonicalUrl: normalized.community.canonicalUrl,
      displayName,
      evidenceTitle: displayName,
      evidenceSnippet: facebook
        ? facebookGroupRootEvidenceSnippet(hit.snippet, displayName)
        : boundCommunityEvidenceSnippet(hit.snippet),
    },
  };
}

function candidatesFromHits(hits: readonly CommunitySearchHit[]): DiscoveryCandidate[] {
  const selected: DiscoveryCandidate[] = [];
  const groupRootByKey = new Map<string, boolean>();
  const indexByKey = new Map<string, number>();

  for (const hit of hits.slice(0, COMMUNITY_DISCOVERY_SEARCH_LIMIT)) {
    const next = candidateFromHit(hit);
    if (!next) continue;
    const existingIndex = indexByKey.get(next.key);
    if (existingIndex === undefined) {
      indexByKey.set(next.key, selected.length);
      groupRootByKey.set(next.key, next.groupRoot);
      selected.push(next.candidate);
      continue;
    }
    if (next.groupRoot && groupRootByKey.get(next.key) !== true) {
      groupRootByKey.set(next.key, true);
      selected[existingIndex] = next.candidate;
      continue;
    }
    const current = selected[existingIndex];
    if (next.groupRoot && current && !current.evidenceSnippet && next.candidate.evidenceSnippet) {
      selected[existingIndex] = {
        ...current,
        evidenceSnippet: next.candidate.evidenceSnippet,
      };
    }
  }

  return selected;
}

function reliableCatalogDisplayName(record: PublicCommunityRecord): boolean {
  if (record.platform === "facebook_groups") {
    return isReliableFacebookGroupCatalogName(
      record.displayName,
      record.canonicalIdentity,
    );
  }
  return sanitizePublicCommunityDisplayName(record.displayName) === record.displayName;
}

function displayNameRepairs(
  group: readonly DiscoveryCandidate[],
  existingByIdentity: ReadonlyMap<string, PublicCommunityRecord>,
): PublicCommunityDisplayNameRepair[] {
  const repairs: PublicCommunityDisplayNameRepair[] = [];
  for (const candidate of group) {
    const record = existingByIdentity.get(candidate.canonicalIdentity);
    if (!record || record.platform !== "facebook_groups") continue;
    if (
      isReliableFacebookGroupCatalogName(
        record.displayName,
        record.canonicalIdentity,
      )
    ) {
      continue;
    }
    repairs.push({
      platform: record.platform,
      canonicalIdentity: record.canonicalIdentity,
      canonicalUrl: record.canonicalUrl,
      currentDisplayName: record.displayName,
      displayName: candidate.displayName,
    });
  }
  return repairs;
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

type DiscoveryBatch = {
  objective: string;
  searchProvider: CommunitySearchProviderId;
  qualification: CommunityDiscoveryResponse["qualification"];
  results: CommunityDiscoveryResult[];
  searchHitCount: number;
  pageIdentities: string[];
};

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
  offset?: number;
  seenIdentities?: ReadonlySet<string>;
}): Promise<DiscoveryBatch> {
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
      offset: input.offset ?? 0,
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

  const pageCandidates = candidatesFromHits(hits);
  const seenIdentities = input.seenIdentities ?? new Set<string>();
  const candidates = pageCandidates.filter(
    (candidate) => !seenIdentities.has(candidate.canonicalIdentity),
  );
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
    const repairs = displayNameRepairs(group, existingByIdentity);
    const repaired =
      repairs.length > 0
        ? await input.catalog.repairInvalidDisplayNames(repairs)
        : [];
    const repairedIds = new Set(
      repaired.map((record) => record.canonicalIdentity),
    );
    for (const record of repaired) {
      resolvedByIdentity.set(record.canonicalIdentity, record);
    }
    const unresolved = identities.filter((identity) => {
      if (!resolvedByIdentity.has(identity)) return true;
      return repairs.some(
        (repair) =>
          repair.canonicalIdentity === identity && !repairedIds.has(identity),
      );
    });
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
      if (!reliableCatalogDisplayName(record)) continue;
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
    searchHitCount: hits.length,
    pageIdentities: pageCandidates.map((candidate) => candidate.canonicalIdentity),
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

function publicDiscovery(
  batch: DiscoveryBatch,
  continuation: CommunityDiscoveryContinuation,
  recovery: CommunityDiscoveryRecovery | null,
): CommunityDiscoveryResponse {
  return {
    platform: "facebook_groups",
    objective: batch.objective,
    searchProvider: batch.searchProvider,
    qualification: batch.qualification,
    results: batch.results,
    continuation,
    recovery,
  };
}

export function communityDiscoveryRecoveryResponse(
  recovery: CommunityDiscoveryRecovery,
): CommunityDiscoveryResponse {
  return {
    platform: "facebook_groups",
    objective: "",
    searchProvider: "brave_search",
    qualification: { status: "unavailable", reason: "not_needed" },
    results: [],
    continuation: IDLE_CONTINUATION,
    recovery,
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
  continuationToken?: string | null;
  ledger?: CommunityDiscoveryLedger;
}): Promise<CommunityDiscoveryResponse> {
  const objective = assertDiscoveryObjective(input.objective);
  const organizationId = input.organizationId.trim();
  if (!organizationId) {
    throw new CommunityDiscoveryRequestError(
      "INVALID_REQUEST",
      "Organization context is required.",
      400,
    );
  }

  const ledger = input.ledger;
  const acquisition = ledger
    ? ledger.acquire({
        organizationId,
        objective,
        continuationToken: input.continuationToken?.trim() || null,
      })
    : null;

  if (acquisition?.status === "recovery") {
    return {
      ...communityDiscoveryRecoveryResponse("active"),
      objective,
      searchProvider: input.provider.providerId,
    };
  }
  if (acquisition?.status === "exhausted") {
    return publicDiscovery(
      {
        objective,
        searchProvider: input.provider.providerId,
        qualification: { status: "unavailable", reason: "not_needed" },
        results: [],
        searchHitCount: 0,
        pageIdentities: [],
      },
      { ...IDLE_CONTINUATION, exhausted: true },
      null,
    );
  }
  if (acquisition?.status === "in_flight") {
    throw new CommunityDiscoveryRequestError(
      "CONTINUATION_IN_FLIGHT",
      "A search for this objective is already in progress.",
      409,
    );
  }
  if (acquisition?.status === "invalid_token") {
    throw new CommunityDiscoveryRequestError(
      "INVALID_CONTINUATION",
      "This additional search is no longer available.",
      400,
    );
  }

  const hold = acquisition?.status === "acquired" ? acquisition.hold : null;
  try {
    const batch = await discoverSocialCommunities({
      organizationId,
      objective,
      searchQuery: buildFacebookGroupsSearchQuery(objective),
      provider: input.provider,
      catalog: input.catalog,
      qualify: input.qualify,
      readBusinessContext: input.readBusinessContext,
      identityReadTimeoutMs: input.identityReadTimeoutMs,
      now: input.now,
      signal: input.signal,
      offset: hold?.page ?? 0,
      seenIdentities: new Set(hold?.seenIdentities ?? []),
    });
    if (!ledger || !hold) {
      return publicDiscovery(batch, IDLE_CONTINUATION, null);
    }
    const moreAvailable =
      batch.searchHitCount >= COMMUNITY_DISCOVERY_SEARCH_LIMIT &&
      hold.page < COMMUNITY_DISCOVERY_MAX_SEARCH_PAGES - 1;
    const committed = ledger.commit({
      holdId: hold.id,
      identities: batch.pageIdentities,
      moreAvailable,
    });
    return publicDiscovery(
      batch,
      {
        moreAvailable: committed?.continuationToken ? moreAvailable : false,
        exhausted: committed ? committed.exhausted : !moreAvailable,
        token: committed?.continuationToken ?? null,
        sessionToken: committed?.sessionToken ?? null,
      },
      null,
    );
  } catch (error) {
    if (ledger && hold) ledger.release(hold.id);
    throw error;
  }
}
