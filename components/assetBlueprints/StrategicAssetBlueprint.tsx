"use client";

import {
  CollapsiblePromptBlock,
  type DiscussWithAthenaPayload,
} from "@/components/assetBlueprints/CollapsiblePromptBlock";
import type { AssetCopyTrackingContext } from "@/components/deployment/CopyButton";
import { formatBlueprintReadiness } from "@/lib/blueprintReadiness";
import { BLUEPRINT_ASSET_TYPES } from "@/services/assetInteractions/assetInteractionKeys";
import type { AthenaAssetBlueprint } from "@/services/assetBlueprints/assetBlueprintService";
import type { AiWorkspacePreferences } from "@/services/assetContinuation/destinationRegistry";
import type { AssetUsageTag } from "@/services/assetInteractions/assetUsageTags";
import {
  composeBlueprintPromptWithBrandDirection,
  type BlueprintBrandDirectionInput,
} from "@/services/identity/blueprintBrandDirection";
import { ATHENA_EXECUTIVE_CARD_OUTLINE_CLASS } from "@/components/ui/athenaExecutiveCard";

export type BlueprintDiscussPayload = DiscussWithAthenaPayload & {
  executiveVersionId: string;
};

type StrategicAssetBlueprintProps = {
  blueprint: AthenaAssetBlueprint;
  copyContext?: Omit<AssetCopyTrackingContext, "assetType"> | null;
  doneByAssetType?: Record<string, boolean>;
  tagsByAssetType?: Record<string, AssetUsageTag[]>;
  /** Current organization brand — display/copy overlay only; never persisted. */
  brandDirection?: BlueprintBrandDirectionInput | null;
  continuationPreferences?: AiWorkspacePreferences | null;
  /** Identifiers only — blueprint body is resolved server-side. */
  onDiscussWithAthena?: (payload: BlueprintDiscussPayload) => void;
};

export function StrategicAssetBlueprint({
  blueprint,
  copyContext = null,
  doneByAssetType = {},
  tagsByAssetType = {},
  brandDirection = null,
  continuationPreferences = null,
  onDiscussWithAthena,
}: StrategicAssetBlueprintProps) {
  const executiveVersionId = copyContext?.executiveVersionId?.trim() || null;
  const discussEnabled = Boolean(executiveVersionId && onDiscussWithAthena);
  const readinessBadges = formatBlueprintReadiness(blueprint);
  const imagePromptText = composeBlueprintPromptWithBrandDirection(
    blueprint.image_prompt,
    brandDirection,
  );
  const pdfPromptText = composeBlueprintPromptWithBrandDirection(
    blueprint.pdf_prompt,
    brandDirection,
  );

  return (
    <section
      className={`rounded-[28px] ${ATHENA_EXECUTIVE_CARD_OUTLINE_CLASS} bg-gradient-to-br from-[var(--athena-card)] to-[#16161f] p-8 shadow-[0_0_40px_rgba(255,102,0,0.06)] lg:p-10`}
    >
      <div className="text-xs font-semibold uppercase tracking-[0.35em] text-[var(--athena-orange)]">
        Strategic Output
      </div>

      <h2 className="mt-3 text-3xl font-semibold tracking-tight text-white">
        Strategic Asset Blueprint
      </h2>

      <p className="mt-2 max-w-2xl text-base text-white/50">
        Reusable strategic asset specification — prompts ready for image, PDF,
        and social production.
      </p>

      {readinessBadges.length > 0 && (
        <div className="mt-6 rounded-2xl border border-white/10 bg-black/20 p-5">
          <div className="text-xs font-semibold uppercase tracking-[0.22em] text-white/35">
            Ready to Produce
          </div>
          <div className="mt-3 flex flex-wrap gap-2">
            {readinessBadges.map((badge) => (
              <span
                key={badge.key}
                className="rounded-full border border-[var(--athena-orange)]/30 bg-[var(--athena-orange)]/10 px-3 py-1 text-xs font-semibold uppercase tracking-[0.15em] text-[var(--athena-orange)]"
              >
                {badge.label}
              </span>
            ))}
          </div>
        </div>
      )}

      <div className="mt-8 rounded-2xl border border-white/10 bg-black/25 p-6">
        <div className="text-xs font-semibold uppercase tracking-[0.2em] text-[var(--athena-orange)]">
          Asset Overview
        </div>
        <h3 className="mt-3 text-2xl font-semibold text-white">
          {blueprint.asset_title || "Untitled Asset"}
        </h3>
        <div className="mt-2 inline-flex rounded-full border border-white/10 bg-white/[0.04] px-3 py-1 text-xs uppercase tracking-[0.15em] text-white/55">
          {blueprint.asset_type || "—"}
        </div>
      </div>

      <div className="mt-6 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <MetaField label="Business goal" value={blueprint.business_goal} />
        <MetaField label="Target audience" value={blueprint.target_audience} />
        <MetaField label="Priority" value={blueprint.priority} highlight />
        <MetaField
          label="Estimated reuse"
          value={
            blueprint.estimated_reuse != null
              ? `${blueprint.estimated_reuse} / 5`
              : null
          }
        />
      </div>

      <div className="mt-8 grid gap-6 lg:grid-cols-2">
        <CollapsiblePromptBlock
          label="Image Prompt"
          text={imagePromptText}
          assetType={BLUEPRINT_ASSET_TYPES.image_prompt}
          copyContext={copyContext}
          initiallyDone={Boolean(
            doneByAssetType[BLUEPRINT_ASSET_TYPES.image_prompt],
          )}
          initiallyTags={
            tagsByAssetType[BLUEPRINT_ASSET_TYPES.image_prompt] ?? []
          }
          continuationPreferences={continuationPreferences}
          discussAssetKind={discussEnabled ? "blueprint" : null}
          onDiscussWithAthena={
            discussEnabled
              ? (payload) =>
                  onDiscussWithAthena!({
                    ...payload,
                    executiveVersionId: executiveVersionId!,
                  })
              : undefined
          }
        />
        <CollapsiblePromptBlock
          label="PDF Prompt"
          text={pdfPromptText}
          assetType={BLUEPRINT_ASSET_TYPES.pdf_prompt}
          copyContext={copyContext}
          initiallyDone={Boolean(
            doneByAssetType[BLUEPRINT_ASSET_TYPES.pdf_prompt],
          )}
          initiallyTags={
            tagsByAssetType[BLUEPRINT_ASSET_TYPES.pdf_prompt] ?? []
          }
          continuationPreferences={continuationPreferences}
          discussAssetKind={discussEnabled ? "blueprint" : null}
          onDiscussWithAthena={
            discussEnabled
              ? (payload) =>
                  onDiscussWithAthena!({
                    ...payload,
                    executiveVersionId: executiveVersionId!,
                  })
              : undefined
          }
        />
        <CollapsiblePromptBlock
          label="Social Prompt"
          text={blueprint.social_prompt}
          assetType={BLUEPRINT_ASSET_TYPES.social_prompt}
          copyContext={copyContext}
          initiallyDone={Boolean(
            doneByAssetType[BLUEPRINT_ASSET_TYPES.social_prompt],
          )}
          initiallyTags={
            tagsByAssetType[BLUEPRINT_ASSET_TYPES.social_prompt] ?? []
          }
          continuationPreferences={continuationPreferences}
          discussAssetKind={discussEnabled ? "blueprint" : null}
          onDiscussWithAthena={
            discussEnabled
              ? (payload) =>
                  onDiscussWithAthena!({
                    ...payload,
                    executiveVersionId: executiveVersionId!,
                  })
              : undefined
          }
        />
        <CollapsiblePromptBlock
          label="Notes"
          text={blueprint.notes}
          fullWidth
          assetType={BLUEPRINT_ASSET_TYPES.notes}
          copyContext={copyContext}
          initiallyDone={Boolean(doneByAssetType[BLUEPRINT_ASSET_TYPES.notes])}
          initiallyTags={tagsByAssetType[BLUEPRINT_ASSET_TYPES.notes] ?? []}
          continuationPreferences={continuationPreferences}
          discussAssetKind={discussEnabled ? "blueprint" : null}
          onDiscussWithAthena={
            discussEnabled
              ? (payload) =>
                  onDiscussWithAthena!({
                    ...payload,
                    executiveVersionId: executiveVersionId!,
                  })
              : undefined
          }
        />
      </div>
    </section>
  );
}

function MetaField({
  label,
  value,
  highlight,
}: {
  label: string;
  value?: string | null;
  highlight?: boolean;
}) {
  return (
    <div className="rounded-2xl border border-white/10 bg-black/20 p-4">
      <div className="text-xs uppercase tracking-[0.2em] text-white/35">
        {label}
      </div>
      <div
        className={`mt-2 text-sm leading-6 ${
          highlight ? "font-semibold text-[var(--athena-orange)]" : "text-white/85"
        }`}
      >
        {value?.trim() || "—"}
      </div>
    </div>
  );
}
