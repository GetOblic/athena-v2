import {
  DeploymentAssets,
  type DeploymentAsset,
  type DeploymentAssetsChrome,
  type DeploymentDiscussPayload,
} from "@/components/deployment/DeploymentAssets";
import { honestAnalysisTitle } from "@/lib/personas/personaDetailPresentation";
import type { AiWorkspacePreferences } from "@/services/assetContinuation/destinationRegistry";
import type { AssetUsageTag } from "@/services/assetInteractions/assetUsageTags";
import type { AssetCopyTrackingContext } from "@/components/deployment/CopyButton";

type PersonaEmbeddedAssetsProps = {
  assets: DeploymentAsset[];
  analysisTitles?: Record<string, string> | null;
  executiveVersionId?: string | null;
  copyContext?: Omit<AssetCopyTrackingContext, "assetType"> | null;
  doneByAssetType?: Record<string, boolean>;
  tagsByAssetType?: Record<string, AssetUsageTag[]>;
  continuationPreferences?: AiWorkspacePreferences | null;
  onDiscussWithAthena?: (payload: DeploymentDiscussPayload) => void;
  chrome?: DeploymentAssetsChrome | null;
  keyPrefix?: string;
};

export function PersonaEmbeddedAssets({
  assets,
  analysisTitles = null,
  executiveVersionId = null,
  copyContext = null,
  doneByAssetType = {},
  tagsByAssetType = {},
  continuationPreferences = null,
  onDiscussWithAthena,
  chrome = null,
  keyPrefix = "asset",
}: PersonaEmbeddedAssetsProps) {
  if (assets.length === 0) {
    return null;
  }

  const titled = assets.map((asset) => ({
    ...asset,
    title: honestAnalysisTitle(asset, analysisTitles),
  }));

  return (
    <div data-persona-embedded-assets={keyPrefix}>
      <DeploymentAssets
        executiveVersionId={executiveVersionId}
        assets={titled}
        copyContext={copyContext}
        doneByAssetType={doneByAssetType}
        tagsByAssetType={tagsByAssetType}
        continuationPreferences={continuationPreferences}
        onDiscussWithAthena={onDiscussWithAthena}
        chrome={{
          ...chrome,
          hideGalleryChrome: true,
          cardPresentation: "persona",
          personaAccent: "violet",
        }}
        variant="embedded"
      />
    </div>
  );
}
