/**
 * Public API shapes for SEO reports — never trust client org ownership.
 */

import {
  normalizeSeoGenerationType,
  resolveSeoGenerationType,
  type SeoGenerationType,
} from "@/services/seo/seoGenerationType";
import type {
  SeoReport,
  SeoReportBrief,
  SeoReportGenerationStage,
  SeoReportPackage,
  SeoReportStatus,
} from "@/services/seo/seoReportTypes";
import { isSeoTechnicalPackage } from "@/services/seo/seoReportTypes";

export type PublicSeoReportSummary = {
  id: string;
  name: string;
  status: SeoReportStatus;
  generationStage: SeoReportGenerationStage | null;
  generationType: SeoGenerationType;
  summary: string | null;
  createdAt: string;
  updatedAt: string;
  errorCode: string | null;
  errorMessage: string | null;
};

export type PublicSeoReportDetail = PublicSeoReportSummary & {
  brief: SeoReportBrief;
  package: SeoReportPackage | null;
};

function packageSummary(pkg: SeoReportPackage | null): string | null {
  if (!pkg) return null;
  if (isSeoTechnicalPackage(pkg)) {
    return pkg.executiveEvaluation.summary ?? null;
  }
  return pkg.executiveAssessment.summary ?? null;
}

/** Ready reports expose package; processing/failed never expose partial packages. */
export function toPublicSeoReportSummary(report: SeoReport): PublicSeoReportSummary {
  const isReady = report.status === "Ready";
  const pkg = isReady ? report.package_json : null;
  const generationType = resolveSeoGenerationType({
    brief: report.brief_json,
    package: pkg,
  });

  return {
    id: report.id,
    name: report.name,
    status: report.status,
    generationStage: report.generation_stage,
    generationType: normalizeSeoGenerationType(generationType),
    summary: packageSummary(pkg),
    createdAt: report.created_at,
    updatedAt: report.updated_at,
    errorCode: report.error_code,
    errorMessage: report.error_message,
  };
}

export function toPublicSeoReportDetail(report: SeoReport): PublicSeoReportDetail {
  const summary = toPublicSeoReportSummary(report);
  const isReady = report.status === "Ready";

  return {
    ...summary,
    brief: report.brief_json ?? { generationType: "intelligence" },
    package: isReady ? report.package_json : null,
  };
}

export type PublicSeoReportStatus = {
  id: string;
  status: SeoReportStatus;
  generationStage: SeoReportGenerationStage | null;
  errorCode: string | null;
  errorMessage: string | null;
  updatedAt: string;
  isReady: boolean;
  isFailed: boolean;
  isInFlight: boolean;
};

export function toPublicSeoReportStatus(report: SeoReport): PublicSeoReportStatus {
  return {
    id: report.id,
    status: report.status,
    generationStage: report.generation_stage,
    errorCode: report.error_code,
    errorMessage: report.error_message,
    updatedAt: report.updated_at,
    isReady: report.status === "Ready",
    isFailed: report.status === "Processing Failed",
    isInFlight: report.status === "Queued" || report.status === "Processing",
  };
}
