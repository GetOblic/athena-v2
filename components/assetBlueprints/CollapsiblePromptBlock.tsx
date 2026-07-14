"use client";

import { useState } from "react";
import {
  CopyButton,
  type AssetCopyTrackingContext,
} from "@/components/deployment/CopyButton";
import type { AssetUsageTag } from "@/services/assetInteractions/assetUsageTags";

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
}: CollapsiblePromptBlockProps) {
  const [isOpen, setIsOpen] = useState(defaultOpen);
  const content = text?.trim();
  const hasContent = Boolean(content);
  const descriptionText = description?.trim();

  return (
    <article
      className={`rounded-2xl border border-white/10 bg-black/25 ${
        fullWidth ? "lg:col-span-2" : ""
      }`}
    >
      <div className="flex w-full items-center justify-between gap-4 p-5 transition hover:bg-white/[0.02]">
        <button
          type="button"
          onClick={() => setIsOpen((open) => !open)}
          className="flex min-w-0 flex-1 cursor-pointer items-center gap-3 text-left"
          aria-expanded={isOpen}
        >
          <span className="min-w-0 flex-1">
            <span className="block text-sm font-medium text-white/55">
              {label}
            </span>
            {descriptionText ? (
              <span className="mt-1 block text-sm leading-6 text-white/45">
                {descriptionText}
              </span>
            ) : null}
          </span>
          <span className="shrink-0 text-xs text-white/30">
            {isOpen ? "▲" : "▼"}
          </span>
        </button>
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
          />
        )}
      </div>

      {isOpen && (
        <div className="border-t border-white/10 px-5 pb-5 pt-4">
          <div className="rounded-xl border border-white/10 bg-[var(--athena-bg)]/70 p-4 shadow-inner shadow-black/20">
            <p
              className={`whitespace-pre-wrap text-sm leading-7 ${
                hasContent ? "text-white/85" : "text-white/30"
              }`}
            >
              {hasContent ? content : "No prompt generated yet."}
            </p>
          </div>
        </div>
      )}
    </article>
  );
}
