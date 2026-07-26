"use client";

import {
  CollapsiblePromptBlock,
  type DiscussWithAthenaPayload,
} from "@/components/assetBlueprints/CollapsiblePromptBlock";
import type { AssetCopyTrackingContext } from "@/components/deployment/CopyButton";
import { ATHENA_EXECUTIVE_CARD_OUTLINE_CLASS } from "@/components/ui/athenaExecutiveCard";
import type { AiWorkspacePreferences } from "@/services/assetContinuation/destinationRegistry";
import type { AssetUsageTag } from "@/services/assetInteractions/assetUsageTags";

export type DeploymentAsset = {
  /** Canonical interaction key when available. */
  assetKey?: string;
  title: string;
  objective: string;
  content: string;
};

export type DeploymentAssetCardModel = {
  /** Stable across version switches only when executiveVersionId is included. */
  key: string;
  assetType: string;
  label: string;
  description: string;
  text: string;
};

export type DeploymentDiscussPayload = DiscussWithAthenaPayload & {
  executiveVersionId: string;
};

type DeploymentAssetsProps = {
  assets: DeploymentAsset[];
  /**
   * Selected Executive Version UUID. Required for version-bound card identity so
   * historical ↔ historical switches never reuse another version's card state.
   */
  executiveVersionId?: string | null;
  copyContext?: Omit<AssetCopyTrackingContext, "assetType"> | null;
  doneByAssetType?: Record<string, boolean>;
  tagsByAssetType?: Record<string, AssetUsageTag[]>;
  continuationPreferences?: AiWorkspacePreferences | null;
  /** Identifiers only — never pass asset body/title as trusted input. */
  onDiscussWithAthena?: (payload: DeploymentDiscussPayload) => void;
};

/**
 * Pure card-model builder used by DeploymentAssets and production-path tests.
 * Keys always include executiveVersionId so V8/V9 never share React identity.
 */
export function buildDeploymentAssetCards(
  assets: DeploymentAsset[],
  executiveVersionId: string | null = null,
): DeploymentAssetCardModel[] {
  const versionKey = executiveVersionId?.trim() || "no-version";

  return assets
    .filter((asset) => asset.content.trim())
    .map((asset) => {
      const assetType =
        asset.assetKey ?? asset.title.toLowerCase().replace(/\s+/g, "_");
      return {
        key: `${versionKey}:${assetType}`,
        assetType,
        label: asset.title,
        description: asset.objective,
        text: asset.content,
      };
    });
}

export function DeploymentAssets({
  assets,
  executiveVersionId = null,
  copyContext = null,
  doneByAssetType = {},
  tagsByAssetType = {},
  continuationPreferences = null,
  onDiscussWithAthena,
}: DeploymentAssetsProps) {
  const cards = buildDeploymentAssetCards(assets, executiveVersionId);

  if (cards.length === 0) {
    return null;
  }

  return (
    <section
      data-executive-version-id={executiveVersionId ?? undefined}
      className={`rounded-[28px] ${ATHENA_EXECUTIVE_CARD_OUTLINE_CLASS} bg-gradient-to-br from-[var(--athena-card)] to-[#16161f] p-8 shadow-[0_0_40px_rgba(255,102,0,0.06)] lg:p-10`}
    >
      <h2 className="text-3xl font-semibold tracking-tight text-[var(--athena-orange)]">
        Deployment Assets
      </h2>

      <p className="mt-2 max-w-2xl text-base text-white/50">
        Ready-to-use content generated from Athena&apos;s analysis.
      </p>

      <div className="mt-8 grid gap-5 lg:grid-cols-2">
        {cards.map((card) => (
          <CollapsiblePromptBlock
            key={card.key}
            label={card.label}
            description={card.description}
            text={card.text}
            defaultOpen={false}
            assetType={card.assetType}
            copyContext={copyContext}
            initiallyDone={Boolean(doneByAssetType[card.assetType])}
            initiallyTags={tagsByAssetType[card.assetType] ?? []}
            continuationPreferences={continuationPreferences}
            discussAssetKind={
              executiveVersionId && onDiscussWithAthena
                ? "deployment"
                : null
            }
            onDiscussWithAthena={
              executiveVersionId && onDiscussWithAthena
                ? (payload) =>
                    onDiscussWithAthena({
                      ...payload,
                      executiveVersionId,
                    })
                : undefined
            }
          />
        ))}
      </div>
    </section>
  );
}
