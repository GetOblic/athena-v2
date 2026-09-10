"use client";

import { useState } from "react";
import { ChevronDown, FileText } from "lucide-react";
import {
  CopyButton,
  type AssetCopyTrackingContext,
  type CopyButtonChrome,
} from "@/components/deployment/CopyButton";
import {
  PERSONA_ASSET_CARD_ORANGE_CLASS,
  PERSONA_ASSET_CARD_VIOLET_CLASS,
  PERSONA_DETAIL_ICON,
} from "@/lib/personas/personaPagePresentation";
import type { AiWorkspacePreferences } from "@/services/assetContinuation/destinationRegistry";
import type { AssetUsageTag } from "@/services/assetInteractions/assetUsageTags";

export type DiscussWithAthenaPayload = {
  assetKind: "deployment" | "blueprint";
  assetKey: string;
};

type CollapsiblePromptBlockProps = {
  label: string;
  /** Optional supporting line shown in the collapsed header (e.g. Deployment objective). */
  description?: string | null;
  text?: string | null;
  fullWidth?: boolean;
  defaultOpen?: boolean;
  assetType?: string;
  copyContext?: Omit<AssetCopyTrackingContext, "assetType"> | null;
  initiallyDone?: boolean;
  initiallyTags?: AssetUsageTag[];
  /** Org Continue destination preferences (defaults apply when omitted). */
  continuationPreferences?: AiWorkspacePreferences | null;
  /** Contained Discuss action — identifiers only; no asset body. */
  discussAssetKind?: "deployment" | "blueprint" | null;
  onDiscussWithAthena?: (payload: DiscussWithAthenaPayload) => void;
  copyChrome?: CopyButtonChrome | null;
  discussWithAthenaLabel?: string;
  emptyPromptLabel?: string;
  /**
   * Persona-only opt-in. Default keeps Discussions / Prospects / Ads chrome.
   */
  presentation?: "default" | "persona";
  personaAccent?: "violet" | "orange";
};

export function CollapsiblePromptBlock({
  label,
  description,
  text,
  fullWidth,
  defaultOpen = false,
  assetType,
  copyContext = null,
  initiallyDone = false,
  initiallyTags = [],
  continuationPreferences = null,
  discussAssetKind = null,
  onDiscussWithAthena,
  copyChrome,
  discussWithAthenaLabel = "Discuss with Athena",
  emptyPromptLabel = "No prompt generated yet.",
  presentation = "default",
  personaAccent = "violet",
}: CollapsiblePromptBlockProps) {
  const [isOpen, setIsOpen] = useState(defaultOpen);
  const content = text?.trim();
  const hasContent = Boolean(content);
  const descriptionText = description?.trim();
  const canDiscuss =
    Boolean(onDiscussWithAthena) &&
    Boolean(discussAssetKind) &&
    Boolean(assetType?.trim()) &&
    hasContent;
  const personaSurface = presentation === "persona";
  const cardClass = personaSurface
    ? personaAccent === "orange"
      ? PERSONA_ASSET_CARD_ORANGE_CLASS
      : PERSONA_ASSET_CARD_VIOLET_CLASS
    : "rounded-2xl border border-white/10 bg-black/25";
  const iconWellClass =
    personaAccent === "orange"
      ? PERSONA_DETAIL_ICON.orange
      : PERSONA_DETAIL_ICON.violet;

  return (
    <article
      className={`${cardClass} ${fullWidth ? "lg:col-span-2" : ""}`}
      data-asset-presentation={personaSurface ? "persona" : "default"}
    >
      <div className="flex w-full items-center justify-between gap-4 p-5 transition hover:bg-white/[0.02]">
        <button
          type="button"
          onClick={() => setIsOpen((open) => !open)}
          className="flex min-w-0 flex-1 cursor-pointer items-center gap-3 text-left"
          aria-expanded={isOpen}
        >
          {personaSurface ? (
            <span
              className={`grid size-8 shrink-0 place-items-center rounded-xl ${iconWellClass}`}
              aria-hidden="true"
            >
              <FileText className="size-4" />
            </span>
          ) : null}
          <span className="min-w-0 flex-1">
            <span
              className={
                personaSurface
                  ? "block text-sm font-semibold tracking-tight text-white"
                  : "block text-sm font-medium text-white/55"
              }
            >
              {label}
            </span>
            {descriptionText ? (
              <span className="mt-1 block text-sm leading-6 text-white/45">
                {descriptionText}
              </span>
            ) : null}
          </span>
          {personaSurface ? (
            <ChevronDown
              className={`size-5 shrink-0 text-white/45 transition-transform duration-200 ${isOpen ? "rotate-180" : ""}`}
              aria-hidden="true"
            />
          ) : (
            <span className="shrink-0 text-xs text-white/30">
              {isOpen ? "▲" : "▼"}
            </span>
          )}
        </button>
        <div className="flex shrink-0 flex-wrap items-center gap-2">
          {canDiscuss ? (
            <button
              type="button"
              onClick={() =>
                onDiscussWithAthena?.({
                  assetKind: discussAssetKind!,
                  assetKey: assetType!.trim(),
                })
              }
              className="rounded-lg border border-white/10 bg-white/[0.03] px-3 py-1.5 text-xs font-medium text-white/65 transition hover:bg-white/[0.06] hover:text-white focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--athena-orange)]"
            >
              {discussWithAthenaLabel}
            </button>
          ) : null}
          {hasContent && content && isOpen && (
            <CopyButton
              text={content}
              initiallyDone={initiallyDone}
              initiallyTags={initiallyTags}
              tracking={
                copyContext && assetType
                  ? { ...copyContext, assetType }
                  : null
              }
              showContinue
              assetType={assetType}
              continuationPreferences={continuationPreferences}
              chrome={copyChrome}
            />
          )}
        </div>
      </div>

      {isOpen && (
        <div className="border-t border-white/10 px-5 pb-5 pt-4">
          <div className="rounded-xl border border-white/10 bg-[var(--athena-bg)]/70 p-4 shadow-inner shadow-black/20">
            <p
              className={`whitespace-pre-wrap text-sm leading-7 ${
                hasContent ? "text-white/85" : "text-white/30"
              }`}
            >
              {hasContent ? content : emptyPromptLabel}
            </p>
          </div>
        </div>
      )}
    </article>
  );
}
