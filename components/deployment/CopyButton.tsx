"use client";

import { useEffect, useState } from "react";
import { parseJsonResponse } from "@/lib/safeJsonResponse";

export type AssetCopyTrackingContext = {
  sourceType: "discussion" | "prospect";
  sourceId: string;
  executiveVersionId: string | null;
  assetType: string;
};

type CopyButtonProps = {
  text: string;
  /** When provided, durable Done is recorded after successful clipboard copy. */
  tracking?: AssetCopyTrackingContext | null;
  /** Initial Done state from server/load. */
  initiallyDone?: boolean;
  onDoneChange?: (done: boolean) => void;
};

export function CopyButton({
  text,
  tracking = null,
  initiallyDone = false,
  onDoneChange,
}: CopyButtonProps) {
  const [copied, setCopied] = useState(false);
  const [done, setDone] = useState(initiallyDone);
  const [copyError, setCopyError] = useState<string | null>(null);

  useEffect(() => {
    setDone(initiallyDone);
  }, [initiallyDone]);

  async function handleCopy() {
    setCopyError(null);
    try {
      await navigator.clipboard.writeText(text);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);

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
        }>(response);

        if (response.ok && payload.ok) {
          setDone(true);
          onDoneChange?.(true);
        } else {
          console.error("[ASSET_COPY] persistence_failed", payload);
        }
      } catch (persistError) {
        console.error("[ASSET_COPY] persistence_error", persistError);
      }
    } catch {
      setCopied(false);
      setCopyError("Copy failed");
    }
  }

  return (
    <div className="flex shrink-0 flex-col items-end gap-1">
      <div className="flex items-center gap-2">
        {done ? (
          <span
            className="inline-flex items-center gap-1 rounded-full border border-emerald-400/20 bg-emerald-400/10 px-2.5 py-1 text-[11px] font-semibold uppercase tracking-[0.14em] text-emerald-300/90"
            aria-label="Copied at least once"
          >
            <span aria-hidden="true">✓</span>
            Done
          </span>
        ) : null}
        <button
          type="button"
          onClick={() => void handleCopy()}
          className="rounded-xl border border-[var(--athena-orange)]/30 bg-[var(--athena-orange)]/10 px-4 py-2 text-sm font-medium text-[var(--athena-orange)] transition hover:bg-[var(--athena-orange)]/20"
        >
          {copied ? "Copied" : "Copy"}
        </button>
      </div>
      {copyError ? (
        <span className="text-xs text-rose-300/80">{copyError}</span>
      ) : null}
    </div>
  );
}
