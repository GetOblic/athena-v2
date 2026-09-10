"use client";

import { useEffect, useRef, useState } from "react";
import { Copy } from "lucide-react";
import { AssetUsageTagControls } from "@/components/deployment/AssetUsageTagControls";
import { ContinueButton } from "@/components/deployment/ContinueButton";
import { writeClipboardText } from "@/lib/clipboard";
import { parseJsonResponse } from "@/lib/safeJsonResponse";
import type { ContinueToastChrome } from "@/services/assetContinuation/continueInExternalWorkspace";
import type { AiWorkspacePreferences } from "@/services/assetContinuation/destinationRegistry";
import type { AssetUsageTag } from "@/services/assetInteractions/assetUsageTags";

export type AssetCopyTrackingContext = {
  sourceType: "discussion" | "prospect" | "social_calendar";
  sourceId: string;
  executiveVersionId: string | null;
  assetType: string;
};

export type CopyButtonChrome = {
  copy?: string;
  copied?: string;
  done?: string;
  copyAria?: string;
  copiedAria?: string;
  doneAria?: string;
  copyFailed?: string;
  saveDoneFailed?: string;
  continue?: string;
  continueAria?: string;
  saveTagFailed?: string;
  usageTagLabels?: Partial<Record<AssetUsageTag, string>>;
  continueToasts?: ContinueToastChrome;
};

type CopyButtonProps = {
  text: string;
  /** When provided, durable Done is recorded after successful clipboard copy. */
  tracking?: AssetCopyTrackingContext | null;
  /** Initial Done state from server/load. */
  initiallyDone?: boolean;
  /** Initial usage tags from server/load (tracking metadata only). */
  initiallyTags?: AssetUsageTag[];
  onDoneChange?: (done: boolean) => void;
  onTagsChange?: (tags: AssetUsageTag[]) => void;
  /** Show Continue beside Copy (default true for shared asset cards). */
  showContinue?: boolean;
  /** Utility is a compact secondary action. Default keeps the existing orange Copy. */
  variant?: "default" | "utility";
  /** Asset type for Continue destination routing (falls back to tracking.assetType). */
  assetType?: string | null;
  continuationPreferences?: AiWorkspacePreferences | null;
  chrome?: CopyButtonChrome | null;
};

function resolveCopyChrome(chrome?: CopyButtonChrome | null) {
  return {
    copy: chrome?.copy ?? "Copy",
    copied: chrome?.copied ?? "Copied",
    done: chrome?.done ?? "Done",
    copyAria: chrome?.copyAria ?? "Copy to clipboard",
    copiedAria: chrome?.copiedAria ?? "Copied to clipboard",
    doneAria: chrome?.doneAria ?? "Copied at least once",
    copyFailed: chrome?.copyFailed ?? "Copy failed",
    saveDoneFailed: chrome?.saveDoneFailed ?? "Could not save Done.",
    continue: chrome?.continue ?? "Continue",
    continueAria: chrome?.continueAria ?? "Continue in external workspace",
    saveTagFailed: chrome?.saveTagFailed ?? "Could not save tag.",
    usageTagLabels: chrome?.usageTagLabels,
    continueToasts: chrome?.continueToasts,
  };
}

const ACK_MS = 2000;

export function CopyButton({
  text,
  tracking = null,
  initiallyDone = false,
  initiallyTags = [],
  onDoneChange,
  onTagsChange,
  showContinue = true,
  assetType = null,
  continuationPreferences = null,
  chrome,
  variant = "default",
}: CopyButtonProps) {
  const labels = resolveCopyChrome(chrome);
  const [copied, setCopied] = useState(false);
  const [done, setDone] = useState(initiallyDone);
  const [copyError, setCopyError] = useState<string | null>(null);
  const resetTimerRef = useRef<number | null>(null);

  useEffect(() => {
    setDone(initiallyDone);
  }, [initiallyDone]);

  useEffect(() => {
    return () => {
      if (resetTimerRef.current !== null) {
        window.clearTimeout(resetTimerRef.current);
      }
    };
  }, []);

  function acknowledgeCopied() {
    setCopied(true);
    if (resetTimerRef.current !== null) {
      window.clearTimeout(resetTimerRef.current);
    }
    resetTimerRef.current = window.setTimeout(() => {
      setCopied(false);
      resetTimerRef.current = null;
    }, ACK_MS);
  }

  async function handleCopy() {
    setCopyError(null);
    const value = text ?? "";
    if (!value.trim()) {
      return;
    }

    try {
      await writeClipboardText(value);
      acknowledgeCopied();

      if (!tracking) {
        return;
      }

      try {
        const response = await fetch("/api/asset-interactions", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            sourceType: tracking.sourceType,
            sourceId: tracking.sourceId,
            executiveVersionId: tracking.executiveVersionId,
            assetType: tracking.assetType,
          }),
        });
        const payload = await parseJsonResponse<{
          ok?: boolean;
          done?: boolean;
          error?: { message?: string };
        }>(response);

        if (response.ok && payload.ok) {
          setDone(true);
          onDoneChange?.(true);
        } else {
          console.error("[ASSET_COPY] persistence_failed", payload);
          setCopyError(labels.saveDoneFailed);
        }
      } catch (persistError) {
        console.error("[ASSET_COPY] persistence_error", persistError);
        setCopyError(labels.saveDoneFailed);
      }
    } catch {
      setCopied(false);
      setCopyError(labels.copyFailed);
    }
  }

  return (
    <div className="flex shrink-0 flex-col items-end gap-1">
      <div className="flex items-center gap-2">
        {done ? (
          <span
            className="inline-flex items-center gap-1 rounded-full border border-emerald-400/20 bg-emerald-400/10 px-2.5 py-1 text-[11px] font-semibold uppercase tracking-[0.14em] text-emerald-300/90"
            aria-label={labels.doneAria}
          >
            <span aria-hidden="true">✓</span>
            {labels.done}
          </span>
        ) : null}
        {showContinue ? (
          <ContinueButton
            text={text}
            assetType={assetType ?? tracking?.assetType ?? null}
            preferences={continuationPreferences}
            label={labels.continue}
            ariaLabel={labels.continueAria}
            toasts={labels.continueToasts}
          />
        ) : null}
        <button
          type="button"
          onClick={() => void handleCopy()}
          aria-live="polite"
          aria-label={copied ? labels.copiedAria : labels.copyAria}
          className={
            variant === "utility"
              ? "inline-flex items-center gap-1.5 rounded-lg border border-white/10 bg-white/[0.04] px-2.5 py-1.5 text-xs font-medium text-white/60 transition hover:border-[var(--athena-orange)]/35 hover:bg-[var(--athena-orange)]/10 hover:text-[var(--athena-orange)] focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--athena-orange)]"
              : "rounded-xl border border-[var(--athena-orange)]/30 bg-[var(--athena-orange)]/10 px-4 py-2 text-sm font-medium text-[var(--athena-orange)] transition hover:bg-[var(--athena-orange)]/20"
          }
          style={variant === "utility" ? undefined : { minWidth: "5.5rem" }}
        >
          {variant === "utility" ? (
            <Copy className="size-3.5" aria-hidden="true" />
          ) : null}
          {copied ? labels.copied : labels.copy}
        </button>
      </div>
      {tracking ? (
        <AssetUsageTagControls
          tracking={tracking}
          initiallyTags={initiallyTags}
          onTagsChange={onTagsChange}
          labels={labels.usageTagLabels}
          saveFailed={labels.saveTagFailed}
        />
      ) : null}
      {copyError ? (
        <span className="text-xs text-rose-300/80">{copyError}</span>
      ) : null}
    </div>
  );
}
