/**
 * Slim server-only Home snapshot. Tenant-scoped reads, no generation,
 * no /prospects library enrichment, no N+1 job queries.
 */

import {
  extractProspectDeploymentAssetKeys,
  isCompleteProspectDeploymentAssetSet,
} from "@/lib/prospectDeploymentAssetContract";
import { buildHomePipelineData, type HomePipelineData } from "@/lib/home/homePipeline";
import { createTenantScope } from "@/lib/tenantDatabase";
import { supabaseAdmin } from "@/lib/supabaseAdmin";
import { getGenerationJobStateForDiscussions } from "@/services/generationJobs/generationJobService";
import {
  GETOBLIC_LISTING_LINKS_TABLE,
  ACTIVE_GETOBLIC_RELATIONSHIP_STATUSES,
  type ActiveGetOblicRelationshipStatus,
} from "@/services/getoblicDirectory/getoblicDirectoryTypes";
import {
  getGetOblicListingCapacity,
  getGetOblicProspectLinkPresence,
} from "@/services/getoblicDirectory/getoblicDirectoryService";
import { excludeReleasedOnlyGetOblicProspectsFromLibrary } from "@/services/prospects/prospectLibraryEnrichment";
import { resolveProspectDisplayStatus } from "@/services/prospects/prospectDisplay";
import { computeProspectIntelligenceCompleteness } from "@/services/prospects/prospectIntelligenceCompleteness";
import { normalizeProspectLifecycleStatus } from "@/services/prospects/prospectLifecycle";
import { normalizeSeoGenerationType } from "@/services/seo/seoGenerationType";
import type { SeoGenerationType } from "@/services/seo/seoGenerationType";

export type HomeDomainResult<T> =
  | { status: "ok"; data: T }
  | { status: "error" };

export type HomeIdentityRow = {
  greetingName: string | null;
  aboutYou: string | null;
  expertise: string | null;
  website: string | null;
  brainStatus: string;
  brainLastUpdated: string | null;
  lastDeepScrapeAt: string | null;
};

export type HomeSeoLatest = {
  id: string;
  name: string;
  status: string;
  generationType: SeoGenerationType;
  createdAt: string;
  updatedAt: string;
};

export type HomeTractionData = {
  audienceCount: number;
};

export type { HomePipelineData };

export type HomeConvertData = HomePipelineData;

export type HomeCapacityData =
  | { configured: false }
  | {
      configured: true;
      listingCapacity: number;
      currentlyHeld: number;
      available: number;
      claiming: number | null;
      linked: number | null;
      remoteMissing: number | null;
    };

export type HomeSnapshot = {
  define: HomeDomainResult<HomeIdentityRow | null>;
  visibility: HomeDomainResult<HomeSeoLatest | null>;
  traction: HomeDomainResult<HomeTractionData>;
  convert: HomeDomainResult<HomePipelineData>;
  capacity: HomeDomainResult<HomeCapacityData>;
};

const IDENTITY_COLUMNS =
  "greeting_name, about_you, expertise, website, brain_status, brain_last_updated, last_deep_scrape_at";

const SEO_COLUMNS = "id, name, status, brief_json, created_at, updated_at";

const HOME_PROSPECT_COLUMNS = [
  "id",
  "linked_discussion_id",
  "status",
  "lifecycle_status",
  "business_name",
  "category",
  "industry",
  "city",
  "state",
  "country",
  "address",
  "email",
  "phone",
  "whatsapp_number",
  "website",
  "website_intelligence",
  "linkedin",
  "facebook",
  "instagram",
  "google_business_url",
  "ads_content",
  "notes",
  "additional_context",
  "raw_json",
].join(", ");

const HOME_VERSION_COLUMNS =
  "discussion_id, is_current, blueprint_id, intelligence->analysis->suggested_cta";

const VERSION_CHUNK = 100;

type HomeSlimProspectRow = {
  id: string;
  linked_discussion_id: string | null;
  status: string;
  lifecycle_status: string;
  business_name?: string | null;
  category?: string | null;
  industry?: string | null;
  city?: string | null;
  state?: string | null;
  country?: string | null;
  address?: string | null;
  email?: string | null;
  phone?: string | null;
  whatsapp_number?: string | null;
  website?: string | null;
  website_intelligence?: Record<string, unknown> | null;
  linkedin?: string | null;
  facebook?: string | null;
  instagram?: string | null;
  google_business_url?: string | null;
  ads_content?: string | null;
  notes?: string | null;
  additional_context?: string | null;
  raw_json?: Record<string, unknown> | null;
};

function optionalText(value: unknown): string | null {
  if (typeof value !== "string") return null;
  return value;
}

function asRecord(value: unknown): Record<string, unknown> | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return null;
  }
  return value as Record<string, unknown>;
}

function generationTypeFromBrief(brief: unknown): SeoGenerationType {
  if (!brief || typeof brief !== "object" || Array.isArray(brief)) {
    return normalizeSeoGenerationType(undefined);
  }
  return normalizeSeoGenerationType(
    (brief as Record<string, unknown>).generationType,
  );
}

function readSuggestedCta(row: Record<string, unknown>): string {
  const direct = row.suggested_cta;
  if (typeof direct === "string") return direct;
  const analysis = asRecord(row.analysis);
  if (typeof analysis?.suggested_cta === "string") {
    return analysis.suggested_cta;
  }
  const intelligence = asRecord(row.intelligence);
  const nested = asRecord(intelligence?.analysis);
  if (typeof nested?.suggested_cta === "string") {
    return nested.suggested_cta;
  }
  return "";
}

function isCompleteCurrentVersionRow(row: Record<string, unknown>): boolean {
  const intelligence = asRecord(row.intelligence);
  const blueprintId =
    optionalText(row.blueprint_id) ??
    optionalText(asRecord(intelligence?.blueprint)?.id);
  if (!blueprintId) return false;
  return isCompleteProspectDeploymentAssetSet(
    extractProspectDeploymentAssetKeys(readSuggestedCta(row)),
  );
}

async function loadIdentity(
  organizationId: string,
  userId: string,
): Promise<HomeDomainResult<HomeIdentityRow | null>> {
  try {
    const tenant = createTenantScope(organizationId);
    const { data, error } = await tenant
      .from("athena_identity")
      .select(IDENTITY_COLUMNS)
      .eq("user_id", userId)
      .maybeSingle();

    if (error) {
      console.error("[ATHENA_HOME] identity_failed", {
        organizationId,
        error: error.message,
      });
      return { status: "error" };
    }

    if (!data) {
      return { status: "ok", data: null };
    }

    const row = data as Record<string, unknown>;
    return {
      status: "ok",
      data: {
        greetingName: optionalText(row.greeting_name),
        aboutYou: optionalText(row.about_you),
        expertise: optionalText(row.expertise),
        website: optionalText(row.website),
        brainStatus: String(row.brain_status ?? ""),
        brainLastUpdated: optionalText(row.brain_last_updated),
        lastDeepScrapeAt: optionalText(row.last_deep_scrape_at),
      },
    };
  } catch (error) {
    console.error("[ATHENA_HOME] identity_failed", {
      organizationId,
      error: error instanceof Error ? error.message : "unknown",
    });
    return { status: "error" };
  }
}

async function loadLatestSeo(
  organizationId: string,
): Promise<HomeDomainResult<HomeSeoLatest | null>> {
  try {
    const tenant = createTenantScope(organizationId);
    const { data, error } = await tenant
      .from("seo_reports")
      .select(SEO_COLUMNS)
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle();

    if (error) {
      console.error("[ATHENA_HOME] seo_failed", {
        organizationId,
        error: error.message,
      });
      return { status: "error" };
    }

    if (!data) {
      return { status: "ok", data: null };
    }

    const row = data as Record<string, unknown>;
    return {
      status: "ok",
      data: {
        id: String(row.id),
        name: String(row.name ?? ""),
        status: String(row.status ?? ""),
        generationType: generationTypeFromBrief(row.brief_json),
        createdAt: String(row.created_at ?? ""),
        updatedAt: String(row.updated_at ?? ""),
      },
    };
  } catch (error) {
    console.error("[ATHENA_HOME] seo_failed", {
      organizationId,
      error: error instanceof Error ? error.message : "unknown",
    });
    return { status: "error" };
  }
}

async function countPersonas(
  organizationId: string,
): Promise<HomeDomainResult<HomeTractionData>> {
  try {
    const tenant = createTenantScope(organizationId);
    const { count, error } = await tenant
      .from("personas")
      .select("id", { count: "exact", head: true });

    if (error) {
      console.error("[ATHENA_HOME] persona_count_failed", {
        organizationId,
        error: error.message,
      });
      return { status: "error" };
    }

    return { status: "ok", data: { audienceCount: count ?? 0 } };
  } catch (error) {
    console.error("[ATHENA_HOME] persona_count_failed", {
      organizationId,
      error: error instanceof Error ? error.message : "unknown",
    });
    return { status: "error" };
  }
}

async function loadCurrentVersionFlags(
  organizationId: string,
  discussionIds: readonly string[],
): Promise<{
  hasCurrentVersion: Map<string, boolean>;
  hasCompleteCurrentVersion: Map<string, boolean>;
} | null> {
  const hasCurrentVersion = new Map<string, boolean>();
  const hasCompleteCurrentVersion = new Map<string, boolean>();
  const uniqueIds = [
    ...new Set(
      discussionIds.filter((id) => typeof id === "string" && id.length > 0),
    ),
  ];
  if (uniqueIds.length === 0) {
    return { hasCurrentVersion, hasCompleteCurrentVersion };
  }

  for (let index = 0; index < uniqueIds.length; index += VERSION_CHUNK) {
    const chunk = uniqueIds.slice(index, index + VERSION_CHUNK);
    const { data, error } = await supabaseAdmin
      .from("athena_executive_intelligence_versions")
      .select(HOME_VERSION_COLUMNS)
      .eq("organization_id", organizationId)
      .in("discussion_id", chunk)
      .eq("is_current", true);

    if (error) {
      console.error("[ATHENA_HOME] versions_failed", {
        organizationId,
        error: error.message,
      });
      return null;
    }

    for (const raw of data ?? []) {
      const row = raw as Record<string, unknown>;
      const discussionId = optionalText(row.discussion_id);
      if (!discussionId) continue;
      hasCurrentVersion.set(discussionId, true);
      hasCompleteCurrentVersion.set(
        discussionId,
        isCompleteCurrentVersionRow(row),
      );
    }
  }

  return { hasCurrentVersion, hasCompleteCurrentVersion };
}

async function loadPipeline(
  organizationId: string,
): Promise<HomeDomainResult<HomePipelineData>> {
  try {
    const tenant = createTenantScope(organizationId);
    const { data, error } = await tenant
      .from("prospects")
      .select(HOME_PROSPECT_COLUMNS)
      .order("created_at", { ascending: false });

    if (error) {
      console.error("[ATHENA_HOME] prospect_pipeline_failed", {
        organizationId,
        error: error.message,
      });
      return { status: "error" };
    }

    const prospects = ((data ?? []) as HomeSlimProspectRow[]).filter(
      (row) => typeof row.id === "string" && row.id.length > 0,
    );

    const presence = await getGetOblicProspectLinkPresence(
      organizationId,
      prospects.map((prospect) => prospect.id),
    );
    const visible = excludeReleasedOnlyGetOblicProspectsFromLibrary(
      prospects,
      presence,
    );

    const discussionIds = visible
      .map((prospect) => prospect.linked_discussion_id)
      .filter((id): id is string => Boolean(id));

    const [versionFlags, jobState] = await Promise.all([
      loadCurrentVersionFlags(organizationId, discussionIds),
      getGenerationJobStateForDiscussions(organizationId, discussionIds),
    ]);

    if (!versionFlags) {
      return { status: "error" };
    }

    const projections = visible.map((prospect) => {
      const discussionId = prospect.linked_discussion_id;
      const jobs = discussionId ? jobState.get(discussionId) : undefined;
      const hasCurrentVersion = discussionId
        ? Boolean(versionFlags.hasCurrentVersion.get(discussionId))
        : false;
      const hasCompleteCurrentVersion = discussionId
        ? Boolean(versionFlags.hasCompleteCurrentVersion.get(discussionId))
        : false;
      const getoblicStatus =
        presence.activeStatusByProspectId.get(prospect.id) ?? null;
      const hasTerminalJobFailure = Boolean(
        !jobs?.active &&
          jobs?.latest?.status === "failed" &&
          !hasCompleteCurrentVersion,
      );

      return {
        id: prospect.id,
        displayStatus: resolveProspectDisplayStatus({
          prospectStatus: prospect.status,
          jobStatus: jobs?.active?.status ?? null,
          jobStage: jobs?.active?.current_stage ?? null,
          hasCurrentVersion,
          hasCompleteCurrentVersion,
          hasTerminalJobFailure,
        }),
        lifecycleStatus: normalizeProspectLifecycleStatus(
          prospect.lifecycle_status,
        ),
        completeness: computeProspectIntelligenceCompleteness({
          prospect,
          hasCurrentExecutiveVersion: hasCurrentVersion,
          hasActiveGetOblicListingLink: getoblicStatus != null,
        }).score,
        getoblicStatus,
      };
    });

    return { status: "ok", data: buildHomePipelineData(projections) };
  } catch (error) {
    console.error("[ATHENA_HOME] prospect_pipeline_failed", {
      organizationId,
      error: error instanceof Error ? error.message : "unknown",
    });
    return { status: "error" };
  }
}

async function loadCapacity(
  organizationId: string,
): Promise<HomeDomainResult<HomeCapacityData>> {
  try {
    const capacity = await getGetOblicListingCapacity(organizationId);
    if (!capacity.configured) {
      return { status: "ok", data: { configured: false } };
    }

    const { data, error } = await supabaseAdmin
      .from(GETOBLIC_LISTING_LINKS_TABLE)
      .select("relationship_status")
      .eq("organization_id", organizationId)
      .in("relationship_status", [...ACTIVE_GETOBLIC_RELATIONSHIP_STATUSES]);

    if (error) {
      console.error("[ATHENA_HOME] getoblic_status_failed", {
        organizationId,
        error: error.message,
      });
      return {
        status: "ok",
        data: {
          configured: true,
          listingCapacity: capacity.listingCapacity,
          currentlyHeld: capacity.currentlyHeld,
          available: capacity.available,
          claiming: null,
          linked: null,
          remoteMissing: null,
        },
      };
    }

    let claiming = 0;
    let linked = 0;
    let remoteMissing = 0;
    for (const raw of data ?? []) {
      const status = String(
        (raw as { relationship_status?: unknown }).relationship_status ?? "",
      );
      if (status === "claiming") claiming += 1;
      else if (status === "linked") linked += 1;
      else if (status === "remote_missing") remoteMissing += 1;
      void (status as ActiveGetOblicRelationshipStatus);
    }

    return {
      status: "ok",
      data: {
        configured: true,
        listingCapacity: capacity.listingCapacity,
        currentlyHeld: capacity.currentlyHeld,
        available: capacity.available,
        claiming,
        linked,
        remoteMissing,
      },
    };
  } catch (error) {
    console.error("[ATHENA_HOME] getoblic_capacity_failed", {
      organizationId,
      error: error instanceof Error ? error.message : "unknown",
    });
    return { status: "error" };
  }
}

export async function loadHomeSnapshot(
  organizationId: string,
  userId: string,
): Promise<HomeSnapshot> {
  const [define, visibility, traction, convert, capacity] = await Promise.all([
    loadIdentity(organizationId, userId),
    loadLatestSeo(organizationId),
    countPersonas(organizationId),
    loadPipeline(organizationId),
    loadCapacity(organizationId),
  ]);

  return { define, visibility, traction, convert, capacity };
}
