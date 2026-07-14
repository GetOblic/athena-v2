"use client";

import { CollapsiblePromptBlock } from "@/components/assetBlueprints/CollapsiblePromptBlock";
import type { AssetCopyTrackingContext } from "@/components/deployment/CopyButton";
import { ATHENA_EXECUTIVE_CARD_OUTLINE_CLASS } from "@/components/ui/athenaExecutiveCard";
import type { AssetUsageTag } from "@/services/assetInteractions/assetUsageTags";

export type DeploymentAsset = {
  /** Canonical interaction key when available. */
  assetKey?: string;
  title: string;
  objective: string;
  content: string;
};

type DeploymentAssetsProps = {
  assets: DeploymentAsset[];
  copyContext?: Omit<AssetCopyTrackingContext, "assetType"> | null;
  doneByAssetType?: Record<string, boolean>;
  tagsByAssetType?: Record<string, AssetUsageTag[]>;
};

export function DeploymentAssets({
  assets,
  copyContext = null,
  doneByAssetType = {},
  tagsByAssetType = {},
}: DeploymentAssetsProps) {
  const visibleAssets = assets.filter((asset) => asset.content.trim());

  if (visibleAssets.length === 0) {
    return null;
  }

  return (
    <section
      className={`rounded-[28px] ${ATHENA_EXECUTIVE_CARD_OUTLINE_CLASS} bg-gradient-to-br from-[var(--athena-card)] to-[#16161f] p-8 shadow-[0_0_40px_rgba(255,102,0,0.06)] lg:p-10`}
    >
      <h2 className="text-3xl font-semibold tracking-tight text-[var(--athena-orange)]">
        Deployment Assets
      </h2>

      <p className="mt-2 max-w-2xl text-base text-white/50">
        Ready-to-use content generated from Athena&apos;s analysis.
      </p>

      <div className="mt-8 grid gap-5 lg:grid-cols-2">
        {visibleAssets.map((asset) => {
          const assetType =
            asset.assetKey ??
            asset.title.toLowerCase().replace(/\s+/g, "_");
          return (
            <CollapsiblePromptBlock
              key={`${assetType}-${asset.content.slice(0, 32)}`}
              label={asset.title}
              description={asset.objective}
              text={asset.content}
              defaultOpen={false}
              assetType={assetType}
              copyContext={copyContext}
              initiallyDone={Boolean(doneByAssetType[assetType])}
              initiallyTags={tagsByAssetType[assetType] ?? []}
            />
          );
        })}
      </div>
    </section>
  );
}
