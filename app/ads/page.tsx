export const dynamic = "force-dynamic";

import { AdsLibraryClient } from "@/components/ads/AdsLibraryClient";
import { TenantAppShell } from "@/components/dashboard/TenantAppShell";
import { TractionPageHeader } from "@/components/traction/TractionPageHeader";
import { TractionSiblingNav } from "@/components/traction/TractionSiblingNav";
import {
  shouldShowAdsCreate,
  shouldShowFreeTractionContinuation,
} from "@/lib/ads/freeTractionPresentation";
import { UpgradeCompletionCard } from "@/components/upgrade/UpgradeCompletionCard";
import { advertisingUpgradeContent } from "@/lib/upgrade/freeFeatureUpgradePresentation";
import { getTenantLocalization } from "@/lib/tenantI18n/getTenantLocalization";
import { loadFreeTractionPageState } from "@/services/ads/freeTractionPageState";
import { toPublicAdCampaignSummary } from "@/services/ads/adCampaignPublic";
import { listAdCampaigns } from "@/services/ads/adCampaignService";
import { requireCurrentOrganizationContext } from "@/services/organizationService";

export default async function AdsPage() {
  const { organizationId } = await requireCurrentOrganizationContext();
  const [{ language, messages }, freeTraction] = await Promise.all([
    getTenantLocalization(),
    loadFreeTractionPageState(),
  ]);
  const copy = messages.ads;
  const {
    presentation,
    traction: _traction,
    boundCampaignStatus: _boundCampaignStatus,
    ...freeProgression
  } = freeTraction;
  const showCreate = shouldShowAdsCreate(presentation);
  const freeNote =
    presentation === "available"
      ? copy.free.availableContext
      : presentation === "processing"
        ? copy.free.processingNote
        : presentation === "failed"
          ? copy.free.failedNote
          : presentation === "consumed"
            ? copy.free.completedNote
            : null;

  let campaigns: ReturnType<typeof toPublicAdCampaignSummary>[] = [];
  let loadError: string | null = null;

  try {
    campaigns = (await listAdCampaigns(organizationId)).map(
      toPublicAdCampaignSummary,
    );
  } catch (error) {
    console.error("[ADS_LIBRARY] load_failed", error);
    loadError =
      error instanceof Error ? error.message : copy.loadFailed;
  }

  return (
    <TenantAppShell
      currentPath="/ads"
      messages={messages}
      {...freeProgression}
    >
      <TractionPageHeader
        eyebrow={copy.eyebrow}
        title={copy.title}
        subtitle={
          presentation === "available"
            ? copy.free.availableSubtitle
            : copy.subtitle
        }
      >
        <TractionSiblingNav
          links={[
            {
              href: "/personas",
              label: copy.traction.audiences,
            },
            {
              href: "/ads",
              label: copy.title,
              current: true,
            },
            {
              href: "/social-planner",
              label: copy.traction.socialContent,
            },
          ]}
        />
      </TractionPageHeader>

      {freeNote ? (
        <p className="mb-8 max-w-3xl text-sm leading-7 text-white/60">{freeNote}</p>
      ) : null}

      <AdsLibraryClient
        campaigns={campaigns}
        loadError={loadError}
        messages={messages}
        language={language}
        allowCreate={showCreate}
      />

      {shouldShowFreeTractionContinuation(presentation) ? (
        <div className="mt-10">
          <UpgradeCompletionCard
            {...advertisingUpgradeContent({
              continuation: copy.free.continuation,
              upgrade: messages.upgrade,
            })}
          />
        </div>
      ) : null}
    </TenantAppShell>
  );
}
