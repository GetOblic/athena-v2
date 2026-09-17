/**
 * Read-only trained Free Home snapshot.
 * Reuses existing Free page-state loaders and starter Home reads.
 * Read paths only. Does not mutate Free starter state or generate.
 */

import {
  presentFreeTrainedHome,
  type FreeTrainedHomeView,
} from "@/lib/home/freeTrainedHome";
import type { FreeStarterHomeView } from "@/lib/home/freeStarterHome";
import { loadFreeTractionPageState } from "@/services/ads/freeTractionPageState";
import { loadFreeStarterHomeView } from "@/services/home/freeStarterHomeReadService";
import { loadFreeAudiencePageState } from "@/services/personas/freeAudiencePageState";
import { loadFreeConvertPageState } from "@/services/prospects/freeConvertPageState";
import { loadFreeVisibilityPageState } from "@/services/seo/freeVisibilityPageState";
import type { TenantMessages } from "@/lib/tenantI18n/types";

export type FreeTrainedHomeLoadedView = {
  starter: FreeStarterHomeView;
  presentation: FreeTrainedHomeView;
};

export async function loadFreeTrainedHomeView(input: {
  organizationId: string;
  messages: TenantMessages;
}): Promise<FreeTrainedHomeLoadedView> {
  const [starter, visibility, audience, advertising, convert] = await Promise.all([
    loadFreeStarterHomeView(input.organizationId),
    loadFreeVisibilityPageState(),
    loadFreeAudiencePageState(),
    loadFreeTractionPageState(),
    loadFreeConvertPageState(),
  ]);

  return {
    starter,
    presentation: presentFreeTrainedHome({
      athenaPlan: visibility.athenaPlan,
      defineKind: visibility.defineKind,
      visibilityPresentation: visibility.presentation,
      visibilityReportId: visibility.visibility.reportId,
      audiencePresentation: audience.presentation,
      audiencePersonaId: audience.audience.personaId,
      advertisingPresentation: advertising.presentation,
      advertisingCampaignId: advertising.traction.campaignId,
      starter,
      convertPresentation: convert.presentation,
      convertProspectId: convert.convert.prospectId,
      copy: input.messages.dashboard.freeProgression,
      upgrade: input.messages.upgrade,
    }),
  };
}
