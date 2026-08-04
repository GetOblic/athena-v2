/**
 * Organization-scoped SEO report persistence.
 * Ownership always comes from trusted server organizationId — never the client.
 */

import { supabaseAdmin } from "@/lib/supabaseAdmin";
import { defaultReportNameFromBrief } from "@/services/seo/seoReportBrief";
import { mapSeoReportRow } from "@/services/seo/seoReportMappers";
import type {
  SeoReport,
  SeoReportBrief,
  SeoReportGenerationStage,
  SeoReportStatus,
} from "@/services/seo/seoReportTypes";

export type { SeoReport } from "@/services/seo/seoReportTypes";
export { mapSeoReportRow } from "@/services/seo/seoReportMappers";

export class SeoReportNotFoundError extends Error {
  readonly code = "NOT_FOUND";
  constructor(message = "SEO report not found.") {
    super(message);
    this.name = "SeoReportNotFoundError";
  }
}

function touch(): string {
  return new Date().toISOString();
}

export async function listSeoReports(
  organizationId: string,
): Promise<SeoReport[]> {
  const { data, error } = await supabaseAdmin
    .from("seo_reports")
    .select("*")
    .eq("organization_id", organizationId)
    .order("created_at", { ascending: false });

  if (error) {
    console.error("[ATHENA_SEO] list_failed", {
      organizationId,
      error: error.message,
    });
    throw new Error("Failed to load SEO reports.");
  }

  return (data ?? []).map((row) =>
    mapSeoReportRow(row as Record<string, unknown>),
  );
}

export async function getSeoReportById(
  id: string,
  organizationId: string,
): Promise<SeoReport | null> {
  const { data, error } = await supabaseAdmin
    .from("seo_reports")
    .select("*")
    .eq("id", id)
    .eq("organization_id", organizationId)
    .maybeSingle();

  if (error) {
    console.error("[ATHENA_SEO] get_failed", {
      id,
      organizationId,
      error: error.message,
    });
    return null;
  }
  if (!data) return null;
  return mapSeoReportRow(data as Record<string, unknown>);
}

export async function createSeoReport(input: {
  organizationId: string;
  userId: string | null;
  brief?: SeoReportBrief;
}): Promise<SeoReport> {
  const brief = input.brief ?? {};
  const name = defaultReportNameFromBrief(brief);
  const now = touch();

  const { data, error } = await supabaseAdmin
    .from("seo_reports")
    .insert({
      organization_id: input.organizationId,
      user_id: input.userId,
      name,
      brief_json: brief,
      status: "Queued",
      generation_stage: null,
      package_json: null,
      error_code: null,
      error_message: null,
      created_at: now,
      updated_at: now,
    })
    .select("*")
    .single();

  if (error || !data) {
    console.error("[ATHENA_SEO] create_failed", {
      organizationId: input.organizationId,
      error: error?.message,
    });
    throw new Error("Failed to create SEO report.");
  }

  return mapSeoReportRow(data as Record<string, unknown>);
}

export async function markSeoReportEnqueueFailed(input: {
  reportId: string;
  organizationId: string;
  errorCode: string;
  errorMessage: string;
}): Promise<void> {
  await supabaseAdmin
    .from("seo_reports")
    .update({
      status: "Processing Failed",
      generation_stage: "failed",
      package_json: null,
      error_code: input.errorCode.slice(0, 120),
      error_message: input.errorMessage.slice(0, 1000),
      updated_at: touch(),
    })
    .eq("id", input.reportId)
    .eq("organization_id", input.organizationId);
}

export async function updateSeoReportStage(input: {
  reportId: string;
  organizationId: string;
  stage: SeoReportGenerationStage;
  status?: SeoReportStatus;
}): Promise<void> {
  await supabaseAdmin
    .from("seo_reports")
    .update({
      generation_stage: input.stage,
      status: input.status ?? "Processing",
      updated_at: touch(),
    })
    .eq("id", input.reportId)
    .eq("organization_id", input.organizationId);
}

export async function deleteSeoReport(
  id: string,
  organizationId: string,
): Promise<boolean> {
  const existing = await getSeoReportById(id, organizationId);
  if (!existing) return false;

  const { error } = await supabaseAdmin
    .from("seo_reports")
    .delete()
    .eq("id", id)
    .eq("organization_id", organizationId);

  if (error) {
    console.error("[ATHENA_SEO] delete_failed", {
      id,
      organizationId,
      error: error.message,
    });
    throw new Error("Failed to delete SEO report.");
  }
  return true;
}
