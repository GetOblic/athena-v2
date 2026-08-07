/**
 * Create / regenerate SEO reports with failure-safe job enqueue.
 */

import {
  createSeoReport,
  getSeoReportById,
  markSeoReportEnqueueFailed,
  type SeoReport,
} from "@/services/seo/seoReportService";
import { resolveBriefGenerationType } from "@/services/seo/seoReportBrief";
import type { SeoReportBrief } from "@/services/seo/seoReportTypes";
import {
  ActiveSeoGenerationJobConflictError,
  enqueueSeoGenerationJob,
} from "@/services/seo/seoGenerationJobs/seoGenerationJobService";
import type { AthenaSeoGenerationJob } from "@/services/seo/seoGenerationJobs/seoGenerationJobTypes";
import { loadOrganizationDeepWebsiteIntelligence } from "@/services/seo/seoContextComposer";
import {
  assessTechnicalSeoEvidenceSufficiency,
  TECHNICAL_SEO_EVIDENCE_INSUFFICIENT_CODE,
  TECHNICAL_SEO_EVIDENCE_INSUFFICIENT_MESSAGE,
} from "@/services/seo/seoTechnicalEvidence";

export class TechnicalSeoEvidenceInsufficientError extends Error {
  readonly code = TECHNICAL_SEO_EVIDENCE_INSUFFICIENT_CODE;
  constructor(message: string = TECHNICAL_SEO_EVIDENCE_INSUFFICIENT_MESSAGE) {
    super(message);
    this.name = "TechnicalSeoEvidenceInsufficientError";
  }
}

export class ReadySeoReportImmutableError extends Error {
  readonly code = "READY_IMMUTABLE";
  constructor(
    message = "Ready SEO reports cannot be overwritten. Use regenerate.",
  ) {
    super(message);
    this.name = "ReadySeoReportImmutableError";
  }
}

export class SeoReportOrchestrationNotFoundError extends Error {
  readonly code = "NOT_FOUND";
  constructor(message = "SEO report not found.") {
    super(message);
    this.name = "SeoReportOrchestrationNotFoundError";
  }
}

async function assertTechnicalEvidenceIfNeeded(
  organizationId: string,
  brief?: SeoReportBrief,
): Promise<void> {
  if (resolveBriefGenerationType(brief) !== "technical") {
    return;
  }
  const intelligence = await loadOrganizationDeepWebsiteIntelligence(
    organizationId,
  );
  const sufficiency = assessTechnicalSeoEvidenceSufficiency(intelligence);
  if (!sufficiency.sufficient) {
    throw new TechnicalSeoEvidenceInsufficientError(
      sufficiency.message ?? TECHNICAL_SEO_EVIDENCE_INSUFFICIENT_MESSAGE,
    );
  }
}

export async function createSeoReportWithJob(input: {
  organizationId: string;
  userId: string | null;
  brief?: SeoReportBrief;
}): Promise<{ report: SeoReport; job: AthenaSeoGenerationJob }> {
  await assertTechnicalEvidenceIfNeeded(input.organizationId, input.brief);

  const report = await createSeoReport({
    organizationId: input.organizationId,
    userId: input.userId,
    brief: input.brief,
  });

  try {
    const { job } = await enqueueSeoGenerationJob({
      organizationId: input.organizationId,
      reportId: report.id,
      requestedBy: input.userId,
      allowExisting: false,
    });
    return { report, job };
  } catch (error) {
    await markSeoReportEnqueueFailed({
      reportId: report.id,
      organizationId: input.organizationId,
      errorCode: "ENQUEUE_FAILED",
      errorMessage:
        error instanceof Error
          ? error.message
          : "Failed to enqueue SEO generation job.",
    });
    throw error;
  }
}

export async function enqueueGenerationForExistingReport(input: {
  reportId: string;
  organizationId: string;
  userId: string | null;
}): Promise<{ report: SeoReport; job: AthenaSeoGenerationJob; created: boolean }> {
  const report = await getSeoReportById(input.reportId, input.organizationId);
  if (!report) {
    throw new SeoReportOrchestrationNotFoundError();
  }

  if (report.status === "Ready") {
    throw new ReadySeoReportImmutableError();
  }

  await assertTechnicalEvidenceIfNeeded(
    input.organizationId,
    report.brief_json,
  );

  try {
    const { job, created } = await enqueueSeoGenerationJob({
      organizationId: input.organizationId,
      reportId: report.id,
      requestedBy: input.userId,
      allowExisting: false,
    });
    return { report, job, created };
  } catch (error) {
    if (error instanceof ActiveSeoGenerationJobConflictError) {
      throw error;
    }
    throw error;
  }
}

/**
 * Regenerate creates a NEW report row from the previous brief.
 * Ready reports are never silently overwritten.
 */
export async function regenerateSeoReport(input: {
  sourceReportId: string;
  organizationId: string;
  userId: string | null;
}): Promise<{ report: SeoReport; job: AthenaSeoGenerationJob }> {
  const source = await getSeoReportById(
    input.sourceReportId,
    input.organizationId,
  );
  if (!source) {
    throw new SeoReportOrchestrationNotFoundError();
  }

  return createSeoReportWithJob({
    organizationId: input.organizationId,
    userId: input.userId,
    brief: source.brief_json,
  });
}
