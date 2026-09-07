/**
 * Slim server-only Home snapshot. Tenant-scoped reads, no generation, no enrichment.
 */

import { createTenantScope } from "@/lib/tenantDatabase";
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

export type HomeConvertData = {
  total: number;
  newCount: number;
  followUpCount: number;
};

export type HomeSnapshot = {
  define: HomeDomainResult<HomeIdentityRow | null>;
  visibility: HomeDomainResult<HomeSeoLatest | null>;
  traction: HomeDomainResult<HomeTractionData>;
  convert: HomeDomainResult<HomeConvertData>;
};

const IDENTITY_COLUMNS =
  "greeting_name, about_you, expertise, website, brain_status, brain_last_updated, last_deep_scrape_at";

const SEO_COLUMNS = "id, name, status, brief_json, created_at, updated_at";

function optionalText(value: unknown): string | null {
  if (typeof value !== "string") return null;
  return value;
}

function generationTypeFromBrief(brief: unknown): SeoGenerationType {
  if (!brief || typeof brief !== "object" || Array.isArray(brief)) {
    return normalizeSeoGenerationType(undefined);
  }
  return normalizeSeoGenerationType(
    (brief as Record<string, unknown>).generationType,
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

async function countProspects(
  organizationId: string,
  lifecycleStatus?: "New" | "Follow-up",
): Promise<HomeDomainResult<number>> {
  try {
    const tenant = createTenantScope(organizationId);
    let query = tenant.from("prospects").select("id", {
      count: "exact",
      head: true,
    });
    if (lifecycleStatus) {
      query = query.eq("lifecycle_status", lifecycleStatus);
    }

    const { count, error } = await query;
    if (error) {
      console.error("[ATHENA_HOME] prospect_count_failed", {
        organizationId,
        lifecycleStatus: lifecycleStatus ?? "total",
        error: error.message,
      });
      return { status: "error" };
    }

    return { status: "ok", data: count ?? 0 };
  } catch (error) {
    console.error("[ATHENA_HOME] prospect_count_failed", {
      organizationId,
      lifecycleStatus: lifecycleStatus ?? "total",
      error: error instanceof Error ? error.message : "unknown",
    });
    return { status: "error" };
  }
}

export async function loadHomeSnapshot(
  organizationId: string,
  userId: string,
): Promise<HomeSnapshot> {
  const [
    define,
    visibility,
    traction,
    prospectTotal,
    prospectNew,
    prospectFollowUp,
  ] = await Promise.all([
    loadIdentity(organizationId, userId),
    loadLatestSeo(organizationId),
    countPersonas(organizationId),
    countProspects(organizationId),
    countProspects(organizationId, "New"),
    countProspects(organizationId, "Follow-up"),
  ]);

  const convert: HomeDomainResult<HomeConvertData> =
    prospectTotal.status === "error" ||
    prospectNew.status === "error" ||
    prospectFollowUp.status === "error"
      ? { status: "error" }
      : {
          status: "ok",
          data: {
            total: prospectTotal.data,
            newCount: prospectNew.data,
            followUpCount: prospectFollowUp.data,
          },
        };

  return { define, visibility, traction, convert };
}
