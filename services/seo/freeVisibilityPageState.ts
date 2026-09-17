/**
 * Server-owned Free Visibility presentation state for /seo family.
 * Reads only. Never reserves, binds, consumes, or releases.
 */

import {
  deriveFreeVisibilityPresentation,
  type FreeVisibilityPresentation,
} from "@/lib/seo/freeVisibilityPresentation";
import {
  loadFreeProgressionState,
  type FreeProgressionState,
} from "@/services/organization/freeProgressionState";
import {
  loadFreeVisibilityAuthority,
  type FreeVisibilityAuthority,
} from "@/services/organization/freeVisibilityAuthority";
import { requireCurrentOrganizationContext } from "@/services/organizationService";
import {
  getSeoReportById,
  organizationHasSeoReportWithStatus,
} from "@/services/seo/seoReportService";
import type { SeoReportStatus } from "@/services/seo/seoReportTypes";

export type FreeVisibilityPageState = FreeProgressionState & {
  visibility: FreeVisibilityAuthority;
  presentation: FreeVisibilityPresentation;
  boundReportStatus: SeoReportStatus | null;
};

const EMPTY_VISIBILITY_AUTHORITY: FreeVisibilityAuthority = {
  status: "available",
  reportId: null,
  reservedAt: null,
  reservationToken: null,
};

export async function loadFreeVisibilityPageState(): Promise<FreeVisibilityPageState> {
  const { organizationId } = await requireCurrentOrganizationContext();
  const freeProgression = await loadFreeProgressionState();
  if (freeProgression.athenaPlan !== "free") {
    return {
      ...freeProgression,
      visibility: EMPTY_VISIBILITY_AUTHORITY,
      presentation: "full",
      boundReportStatus: null,
    };
  }

  const visibility = await loadFreeVisibilityAuthority(organizationId);

  const [boundReport, hasReadyReport, hasInFlightReport] = await Promise.all([
    visibility.reportId
      ? getSeoReportById(visibility.reportId, organizationId)
      : Promise.resolve(null),
    organizationHasSeoReportWithStatus(organizationId, ["Ready"]),
    organizationHasSeoReportWithStatus(organizationId, ["Queued", "Processing"]),
  ]);

  const boundReportStatus = boundReport?.status ?? null;
  const presentation = deriveFreeVisibilityPresentation({
    athenaPlan: freeProgression.athenaPlan,
    defineKind: freeProgression.defineKind,
    visibilityStatus: visibility.status,
    boundReportId: visibility.reportId,
    boundReportStatus,
    hasReadyReport,
    hasInFlightReport,
  });

  return {
    ...freeProgression,
    visibility,
    presentation,
    boundReportStatus,
  };
}
