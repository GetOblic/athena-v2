/**
 * Bounded cross-organization reuse of prospects.website_intelligence
 * for an exact GetOblic wordpress_listing_id.
 *
 * Privileged historical lookup stays inside this server-only module.
 * Do not expose source organization or source Prospect identifiers.
 * Do not scrape, generate, or queue intelligence from this path.
 */

import { supabaseAdmin } from "@/lib/supabaseAdmin";
import { GETOBLIC_LISTING_LINKS_TABLE } from "@/services/getoblicDirectory/getoblicDirectoryTypes";
import { websiteIntelligenceHasUsableContent } from "@/services/prospects/prospectWebsiteLearningPolicy";
import { normalizeWebsiteUrl } from "@/services/prospects/prospectUtils";
import { DEEP_WEBSITE_INTELLIGENCE_PROVIDER } from "@/services/websiteLearning/deepScrape/deepWebsiteIntelligence";

const HISTORICAL_LINK_LIMIT = 100;
const PROSPECT_INTELLIGENCE_COLUMNS =
  "id, organization_id, website_intelligence" as const;
const RELEASED_LINK_COLUMNS =
  "organization_id, prospect_id, wordpress_listing_id, relationship_status, released_at, created_at" as const;

const TENANT_IDENTIFYING_KEYS = [
  "prospect_id",
  "organization_id",
  "user_id",
  "community_id",
  "linked_discussion_id",
  "source_prospect_id",
  "source_organization_id",
] as const;

export type FindReusableWebsiteIntelligenceInput = {
  currentOrganizationId: string;
  wordpressListingId: number;
  currentWebsite: string | null;
};

export type ReusableWebsiteIntelligenceLinkRecord = {
  organization_id: string;
  prospect_id: string;
  wordpress_listing_id: number;
  relationship_status: string;
  released_at: string | null;
  created_at: string | null;
};

export type ReusableWebsiteIntelligenceProspectRecord = {
  id: string;
  organization_id: string;
  website_intelligence: unknown;
};

export type ReusableWebsiteIntelligenceCandidate = {
  organizationId: string;
  prospectId: string;
  website_intelligence: Record<string, unknown>;
  released_at: string | null;
  created_at: string | null;
};

export type ReusableWebsiteIntelligenceLookup = {
  findReleasedHistoricalLinks: (
    wordpressListingId: number,
    currentOrganizationId: string,
  ) => Promise<ReusableWebsiteIntelligenceLinkRecord[]>;
  loadProspectWebsiteIntelligence: (
    prospectIds: string[],
  ) => Promise<ReusableWebsiteIntelligenceProspectRecord[]>;
};

export async function findReusableWebsiteIntelligenceForListing(
  input: FindReusableWebsiteIntelligenceInput,
  lookup: ReusableWebsiteIntelligenceLookup = defaultReusableWebsiteIntelligenceLookup,
): Promise<Record<string, unknown> | null> {
  try {
    return await resolveReusableWebsiteIntelligence(input, lookup);
  } catch (error) {
    console.error(
      "Reusable GetOblic website intelligence lookup failed:",
      error,
    );
    return null;
  }
}

export async function resolveReusableWebsiteIntelligence(
  input: FindReusableWebsiteIntelligenceInput,
  lookup: ReusableWebsiteIntelligenceLookup,
): Promise<Record<string, unknown> | null> {
  const currentOrganizationId = input.currentOrganizationId.trim();
  if (!currentOrganizationId || input.wordpressListingId <= 0) {
    return null;
  }

  const currentHost = normalizeReusableWebsiteHost(input.currentWebsite);
  if (!currentHost) {
    return null;
  }

  const links = await lookup.findReleasedHistoricalLinks(
    input.wordpressListingId,
    currentOrganizationId,
  );
  const eligibleLinks = links.filter((link) =>
    isEligibleHistoricalLink(
      link,
      currentOrganizationId,
      input.wordpressListingId,
    ),
  );
  const prospectIds = uniqueIds(
    eligibleLinks.map((link) => link.prospect_id),
  );
  if (prospectIds.length === 0) {
    return null;
  }

  const prospects = await lookup.loadProspectWebsiteIntelligence(prospectIds);
  const prospectsById = new Map(
    prospects
      .filter(
        (row) =>
          row.id &&
          row.organization_id &&
          row.organization_id !== currentOrganizationId,
      )
      .map((row) => [row.id, row]),
  );

  const candidates: ReusableWebsiteIntelligenceCandidate[] = [];
  for (const link of eligibleLinks) {
    const prospect = prospectsById.get(link.prospect_id);
    if (!prospect || prospect.organization_id === currentOrganizationId) {
      continue;
    }
    const intelligence = sanitizeReusableWebsiteIntelligence(
      prospect.website_intelligence,
    );
    if (!intelligence) {
      continue;
    }
    const intelligenceHost = normalizeReusableWebsiteHost(
      readWebsiteIntelligenceUrl(intelligence),
    );
    if (!intelligenceHost || intelligenceHost !== currentHost) {
      continue;
    }
    candidates.push({
      organizationId: prospect.organization_id,
      prospectId: prospect.id,
      website_intelligence: intelligence,
      released_at: link.released_at,
      created_at: link.created_at,
    });
  }

  const winner = selectReusableWebsiteIntelligenceWinner(candidates);
  return winner ? clonePlainJson(winner.website_intelligence) : null;
}

export function normalizeReusableWebsiteHost(
  value: string | null | undefined,
): string | null {
  if (value == null) {
    return null;
  }
  const raw = String(value).trim();
  if (!raw) {
    return null;
  }

  const normalized = normalizeWebsiteUrl(raw);
  const candidate = normalized ?? tryHttpUrl(raw);
  if (!candidate) {
    return null;
  }

  try {
    const hostname = new URL(candidate).hostname
      .toLowerCase()
      .replace(/\.$/, "");
    if (!hostname.includes(".")) {
      return null;
    }
    return hostname.replace(/^www\./, "");
  } catch {
    return null;
  }
}

export function reusableWebsiteHostsMatch(
  left: string | null | undefined,
  right: string | null | undefined,
): boolean {
  const leftHost = normalizeReusableWebsiteHost(left);
  const rightHost = normalizeReusableWebsiteHost(right);
  return leftHost != null && leftHost === rightHost;
}

export function sanitizeReusableWebsiteIntelligence(
  value: unknown,
): Record<string, unknown> | null {
  const cloned = clonePlainJson(value);
  if (!cloned) {
    return null;
  }
  for (const key of TENANT_IDENTIFYING_KEYS) {
    delete cloned[key];
  }
  if (!websiteIntelligenceHasUsableContent(cloned)) {
    return null;
  }
  return cloned;
}

export function selectReusableWebsiteIntelligenceWinner(
  candidates: readonly ReusableWebsiteIntelligenceCandidate[],
): ReusableWebsiteIntelligenceCandidate | null {
  if (candidates.length === 0) {
    return null;
  }

  const deep = candidates.filter((candidate) =>
    isDeepReusableProvider(candidate.website_intelligence),
  );
  const pool = deep.length > 0 ? deep : candidates;
  const preferPagesAnalyzed = deep.length > 0;

  return [...pool].sort((left, right) => {
    if (preferPagesAnalyzed) {
      const pagesCmp =
        readPagesAnalyzed(right.website_intelligence) -
        readPagesAnalyzed(left.website_intelligence);
      if (pagesCmp !== 0) {
        return pagesCmp;
      }
    }

    const scrapedCmp = compareIsoDescNullsLast(
      readScrapedAt(left.website_intelligence),
      readScrapedAt(right.website_intelligence),
    );
    if (scrapedCmp !== 0) {
      return scrapedCmp;
    }

    const releasedCmp = compareIsoDescNullsLast(
      left.released_at,
      right.released_at,
    );
    if (releasedCmp !== 0) {
      return releasedCmp;
    }

    const createdCmp = compareIsoDescNullsLast(
      left.created_at,
      right.created_at,
    );
    if (createdCmp !== 0) {
      return createdCmp;
    }

    return left.prospectId.localeCompare(right.prospectId);
  })[0] ?? null;
}

export const defaultReusableWebsiteIntelligenceLookup: ReusableWebsiteIntelligenceLookup =
  {
    findReleasedHistoricalLinks: loadReleasedHistoricalLinks,
    loadProspectWebsiteIntelligence: loadProspectWebsiteIntelligenceRows,
  };

async function loadReleasedHistoricalLinks(
  wordpressListingId: number,
  currentOrganizationId: string,
): Promise<ReusableWebsiteIntelligenceLinkRecord[]> {
  const { data, error } = await supabaseAdmin
    .from(GETOBLIC_LISTING_LINKS_TABLE)
    .select(RELEASED_LINK_COLUMNS)
    .eq("wordpress_listing_id", wordpressListingId)
    .eq("relationship_status", "released")
    .neq("organization_id", currentOrganizationId)
    .order("released_at", { ascending: false, nullsFirst: false })
    .order("created_at", { ascending: false })
    .limit(HISTORICAL_LINK_LIMIT);

  if (error) {
    throw error;
  }

  return ((data ?? []) as Record<string, unknown>[])
    .map(mapReleasedLinkRecord)
    .filter((row): row is ReusableWebsiteIntelligenceLinkRecord => row != null);
}

async function loadProspectWebsiteIntelligenceRows(
  prospectIds: string[],
): Promise<ReusableWebsiteIntelligenceProspectRecord[]> {
  if (prospectIds.length === 0) {
    return [];
  }

  const { data, error } = await supabaseAdmin
    .from("prospects")
    .select(PROSPECT_INTELLIGENCE_COLUMNS)
    .in("id", prospectIds);

  if (error) {
    throw error;
  }

  return ((data ?? []) as Record<string, unknown>[])
    .map(mapProspectIntelligenceRecord)
    .filter(
      (row): row is ReusableWebsiteIntelligenceProspectRecord => row != null,
    );
}

function isEligibleHistoricalLink(
  link: ReusableWebsiteIntelligenceLinkRecord,
  currentOrganizationId: string,
  wordpressListingId: number,
): boolean {
  return (
    link.relationship_status === "released" &&
    link.wordpress_listing_id === wordpressListingId &&
    link.organization_id !== currentOrganizationId &&
    Boolean(link.prospect_id)
  );
}

function mapReleasedLinkRecord(
  row: Record<string, unknown>,
): ReusableWebsiteIntelligenceLinkRecord | null {
  const organizationId = readNonEmptyString(row.organization_id);
  const prospectId = readNonEmptyString(row.prospect_id);
  const listingId = readPositiveInteger(row.wordpress_listing_id);
  const status = readNonEmptyString(row.relationship_status);
  const createdAt = readNonEmptyString(row.created_at);
  if (!organizationId || !prospectId || listingId == null || !status || !createdAt) {
    return null;
  }
  return {
    organization_id: organizationId,
    prospect_id: prospectId,
    wordpress_listing_id: listingId,
    relationship_status: status,
    released_at: readNonEmptyString(row.released_at),
    created_at: createdAt,
  };
}

function mapProspectIntelligenceRecord(
  row: Record<string, unknown>,
): ReusableWebsiteIntelligenceProspectRecord | null {
  const id = readNonEmptyString(row.id);
  const organizationId = readNonEmptyString(row.organization_id);
  if (!id || !organizationId) {
    return null;
  }
  return {
    id,
    organization_id: organizationId,
    website_intelligence: row.website_intelligence,
  };
}

function isDeepReusableProvider(
  intelligence: Record<string, unknown>,
): boolean {
  return intelligence.provider === DEEP_WEBSITE_INTELLIGENCE_PROVIDER;
}

function readPagesAnalyzed(intelligence: Record<string, unknown>): number {
  return typeof intelligence.pages_analyzed === "number" &&
    Number.isFinite(intelligence.pages_analyzed)
    ? intelligence.pages_analyzed
    : 0;
}

function readScrapedAt(intelligence: Record<string, unknown>): string | null {
  return readNonEmptyString(intelligence.scraped_at);
}

function readWebsiteIntelligenceUrl(
  intelligence: Record<string, unknown>,
): string | null {
  return readNonEmptyString(intelligence.url);
}

function clonePlainJson(value: unknown): Record<string, unknown> | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return null;
  }
  try {
    const cloned = JSON.parse(JSON.stringify(value)) as unknown;
    if (!cloned || typeof cloned !== "object" || Array.isArray(cloned)) {
      return null;
    }
    return cloned as Record<string, unknown>;
  } catch {
    return null;
  }
}

function uniqueIds(values: string[]): string[] {
  return [...new Set(values.filter(Boolean))];
}

function tryHttpUrl(value: string): string | null {
  try {
    const withProtocol = /^https?:\/\//i.test(value) ? value : `https://${value}`;
    const url = new URL(withProtocol);
    if (!url.hostname.includes(".")) {
      return null;
    }
    return url.toString();
  } catch {
    return null;
  }
}

function compareIsoDescNullsLast(
  left: string | null,
  right: string | null,
): number {
  if (left == null && right == null) {
    return 0;
  }
  if (left == null) {
    return 1;
  }
  if (right == null) {
    return -1;
  }
  if (left === right) {
    return 0;
  }
  return left < right ? 1 : -1;
}

function readNonEmptyString(value: unknown): string | null {
  return typeof value === "string" && value.trim() ? value.trim() : null;
}

function readPositiveInteger(value: unknown): number | null {
  if (typeof value === "number" && Number.isFinite(value) && value > 0) {
    return value;
  }
  if (typeof value === "string" && /^\d+$/.test(value)) {
    const parsed = Number(value);
    return parsed > 0 ? parsed : null;
  }
  return null;
}
