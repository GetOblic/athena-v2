/**
 * Create / regenerate SEO reports with failure-safe job enqueue.
 */

import {
  createSeoReport,
  getSeoReportById,
  markSeoReportEnqueueFailed,
  type SeoReport,
} from "@/services/seo/seoReportService";
import type { SeoReportBrief } from "@/services/seo/seoReportTypes";
import {
  ActiveSeoGenerationJobConflictError,
  enqueueSeoGenerationJob,
} from "@/services/seo/seoGenerationJobs/seoGenerationJobService";
import type { AthenaSeoGenerationJob } from "@/services/seo/seoGenerationJobs/seoGenerationJobTypes";

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

export async function createSeoReportWithJob(input: {
  organizationId: string;
  userId: string | null;
  brief?: SeoReportBrief;
}): Promise<{ report: SeoReport; job: AthenaSeoGenerationJob }> {
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
