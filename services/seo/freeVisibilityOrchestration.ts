/**
 * Dedicated Free Visibility create / retry boundary.
 * Reserves before createSeoReport / enqueue. Reuses the existing
 * intelligence report + job architecture. Does not invent a Free pipeline.
 */

import { FreeVisibilityGenerationError } from "@/lib/organization/freeVisibilityGeneration";
import {
  bindFreeVisibilityReport,
  releaseFreeVisibilityIfReserved,
  reserveFreeVisibility,
} from "@/services/organization/freeVisibilityAuthority";
import {
  createSeoReport,
  markSeoReportEnqueueFailed,
  type SeoReport,
} from "@/services/seo/seoReportService";
import { enqueueGenerationForExistingReport } from "@/services/seo/seoReportOrchestration";
import { enqueueSeoGenerationJob } from "@/services/seo/seoGenerationJobs/seoGenerationJobService";
import type { AthenaSeoGenerationJob } from "@/services/seo/seoGenerationJobs/seoGenerationJobTypes";
import type { SeoReportBrief } from "@/services/seo/seoReportTypes";

export async function createFreeVisibilitySeoReportWithJob(input: {
  organizationId: string;
  userId: string | null;
  brief?: SeoReportBrief;
}): Promise<{ report: SeoReport; job: AthenaSeoGenerationJob }> {
  const reservation = await reserveFreeVisibility(input.organizationId);

  if (reservation.reportId) {
    try {
      return await enqueueGenerationForExistingReport({
        reportId: reservation.reportId,
        organizationId: input.organizationId,
        userId: input.userId,
      });
    } catch (error) {
      await releaseFreeVisibilityIfReserved({
        organizationId: input.organizationId,
        reportId: reservation.reportId,
        reservationToken: reservation.reservationToken,
      });
      throw error;
    }
  }

  let report: SeoReport;
  try {
    report = await createSeoReport({
      organizationId: input.organizationId,
      userId: input.userId,
      brief: {
        ...input.brief,
        generationType: "intelligence",
      },
    });
  } catch (error) {
    await releaseFreeVisibilityIfReserved({
      organizationId: input.organizationId,
      reservationToken: reservation.reservationToken,
    });
    throw error;
  }

  try {
    await bindFreeVisibilityReport({
      organizationId: input.organizationId,
      reservationToken: reservation.reservationToken,
      reportId: report.id,
    });
  } catch (error) {
    await markSeoReportEnqueueFailed({
      reportId: report.id,
      organizationId: input.organizationId,
      errorCode: "ENQUEUE_FAILED",
      errorMessage:
        error instanceof Error
          ? error.message
          : "Failed to bind Free Visibility reservation.",
    });
    await releaseFreeVisibilityIfReserved({
      organizationId: input.organizationId,
      reportId: report.id,
      reservationToken: reservation.reservationToken,
    });
    if (error instanceof FreeVisibilityGenerationError) {
      throw error;
    }
    throw error;
  }

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
    await releaseFreeVisibilityIfReserved({
      organizationId: input.organizationId,
      reportId: report.id,
      reservationToken: reservation.reservationToken,
    });
    throw error;
  }
}

export async function retryFreeVisibilitySeoReport(input: {
  organizationId: string;
  userId: string | null;
  reportId: string;
  alreadyReserved?: boolean;
}): Promise<{ report: SeoReport; job: AthenaSeoGenerationJob; created: boolean }> {
  if (input.alreadyReserved) {
    return enqueueGenerationForExistingReport({
      reportId: input.reportId,
      organizationId: input.organizationId,
      userId: input.userId,
    });
  }

  const reservation = await reserveFreeVisibility(input.organizationId);
  if (reservation.reportId && reservation.reportId !== input.reportId) {
    throw new FreeVisibilityGenerationError("FREE_VISIBILITY_RETRY_ONLY");
  }

  try {
    return await enqueueGenerationForExistingReport({
      reportId: input.reportId,
      organizationId: input.organizationId,
      userId: input.userId,
    });
  } catch (error) {
    await releaseFreeVisibilityIfReserved({
      organizationId: input.organizationId,
      reportId: input.reportId,
      reservationToken: reservation.reservationToken,
    });
    throw error;
  }
}
