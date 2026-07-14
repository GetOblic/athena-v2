"use client";

import { useEffect, useState } from "react";
import { parseJsonResponse } from "@/lib/safeJsonResponse";
import type { AssetCopyTrackingContext } from "@/components/deployment/CopyButton";
import {
  ASSET_USAGE_TAG_LABELS,
  ASSET_USAGE_TAGS,
  type AssetUsageTag,
} from "@/services/assetInteractions/assetUsageTags";

type AssetUsageTagControlsProps = {
  tracking: AssetCopyTrackingContext;
  initiallyTags?: AssetUsageTag[];
  onTagsChange?: (tags: AssetUsageTag[]) => void;
};

export function AssetUsageTagControls({
  tracking,
  initiallyTags = [],
  onTagsChange,
}: AssetUsageTagControlsProps) {
  const [tags, setTags] = useState<AssetUsageTag[]>(initiallyTags);
  const [error, setError] = useState<string | null>(null);
  const [pendingTag, setPendingTag] = useState<AssetUsageTag | null>(null);
  const initiallyTagsKey = initiallyTags.join("|");
  const trackingKey = [
    tracking.sourceType,
    tracking.sourceId,
    tracking.executiveVersionId ?? "",
    tracking.assetType,
  ].join("|");

  // Sync from server load / version switch only (stable by value, not array identity).
  useEffect(() => {
    setTags(initiallyTags);
    setError(null);
    // eslint-disable-next-line react-hooks/exhaustive-deps -- initiallyTagsKey encodes value
  }, [initiallyTagsKey, trackingKey]);

  async function toggleTag(tag: AssetUsageTag) {
    if (pendingTag) return;

    const wasActive = tags.includes(tag);
    const previous = tags;
    const next = wasActive
      ? previous.filter((value) => value !== tag)
      : [...previous, tag];

    setError(null);
    setTags(next);
    setPendingTag(tag);
    onTagsChange?.(next);

    try {
      const response = await fetch("/api/asset-interactions", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          sourceType: tracking.sourceType,
          sourceId: tracking.sourceId,
          executiveVersionId: tracking.executiveVersionId,
          assetType: tracking.assetType,
          usageTag: tag,
          action: wasActive ? "remove" : "add",
        }),
      });
      const payload = await parseJsonResponse<{
        ok?: boolean;
        tags?: AssetUsageTag[];
        error?: { message?: string };
      }>(response);

      if (!response.ok || !payload.ok) {
        setTags(previous);
        onTagsChange?.(previous);
        setError("Could not save tag.");
        return;
      }

      if (Array.isArray(payload.tags)) {
        setTags(payload.tags);
        onTagsChange?.(payload.tags);
      }
    } catch {
      setTags(previous);
      onTagsChange?.(previous);
      setError("Could not save tag.");
    } finally {
      setPendingTag(null);
    }
  }

  return (
    <div className="flex max-w-[16rem] flex-col items-end gap-1">
      <div className="flex flex-wrap justify-end gap-1.5">
        {ASSET_USAGE_TAGS.map((tag) => {
          const active = tags.includes(tag);
          return (
            <button
              key={tag}
              type="button"
              disabled={pendingTag === tag}
              onClick={() => void toggleTag(tag)}
              aria-pressed={active}
              className={
                active
                  ? "rounded-full border border-[var(--athena-orange)]/45 bg-[var(--athena-orange)]/15 px-2.5 py-1 text-[11px] font-semibold uppercase tracking-[0.12em] text-[var(--athena-orange)] transition hover:bg-[var(--athena-orange)]/25 disabled:opacity-60"
                  : "rounded-full border border-white/10 bg-white/[0.03] px-2.5 py-1 text-[11px] font-semibold uppercase tracking-[0.12em] text-white/40 transition hover:border-white/20 hover:text-white/60 disabled:opacity-60"
              }
            >
              {ASSET_USAGE_TAG_LABELS[tag]}
            </button>
          );
        })}
      </div>
      {error ? <span className="text-xs text-rose-300/80">{error}</span> : null}
    </div>
  );
}
