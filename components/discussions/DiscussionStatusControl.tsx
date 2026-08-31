"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import {
  DISCUSSION_STATUS_OPTIONS,
  formatDiscussionLifecycle,
  getDiscussionLifecycle,
  type DiscussionLifecycleKey,
  type DiscussionStatusOption,
} from "@/lib/discussionStatus";
import type { Discussion } from "@/services/discussionService";
import { ATHENA_EXECUTIVE_CARD_OUTLINE_CLASS } from "@/components/ui/athenaExecutiveCard";

type DiscussionStatusControlProps = {
  discussion: Discussion;
  hasAnalysis: boolean;
  label?: string;
  statusLabels?: Partial<Record<DiscussionStatusOption, string>>;
  lifecycleLabels?: Partial<Record<DiscussionLifecycleKey, string>>;
  successMessage?: string;
  errorFallback?: string;
};

export function DiscussionStatusControl({
  discussion,
  hasAnalysis,
  label = "Discussion Status",
  statusLabels,
  lifecycleLabels,
  successMessage = "Discussion status updated.",
  errorFallback = "Failed to update discussion status.",
}: DiscussionStatusControlProps) {
  const router = useRouter();
  const [status, setStatus] = useState(discussion.status || "New");
  const [isSaving, setIsSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);

  const lifecycle = getDiscussionLifecycle(
    { ...discussion, status },
    hasAnalysis,
  );

  async function handleChange(nextStatus: string) {
    setStatus(nextStatus);
    setIsSaving(true);
    setError(null);
    setSuccess(null);

    try {
      const response = await fetch(`/api/discussions/${discussion.id}/status`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ status: nextStatus }),
      });

      const payload = await response.json();

      if (!response.ok || !payload.success) {
        throw new Error(payload.error || errorFallback);
      }

      setSuccess(successMessage);
      router.refresh();
    } catch (saveError) {
      setStatus(discussion.status || "New");
      setError(
        saveError instanceof Error ? saveError.message : errorFallback,
      );
    } finally {
      setIsSaving(false);
    }
  }

  return (
    <div
      className={`rounded-[20px] ${ATHENA_EXECUTIVE_CARD_OUTLINE_CLASS} bg-[var(--athena-card)] p-5`}
    >
      <div className="text-xs uppercase tracking-[0.2em] text-white/35">
        {label}
      </div>

      <div className="mt-3 flex flex-wrap items-center gap-3">
        <select
          value={status}
          onChange={(event) => handleChange(event.target.value)}
          disabled={isSaving}
          className="rounded-2xl border border-white/10 bg-black/30 px-4 py-3 text-sm text-white outline-none disabled:opacity-50"
        >
          {DISCUSSION_STATUS_OPTIONS.map((option) => (
            <option key={option} value={option}>
              {statusLabels?.[option] ?? option}
            </option>
          ))}
        </select>

        <span className={`text-sm font-medium ${lifecycle.colorClass}`}>
          {lifecycleLabels?.[lifecycle.key] ??
            formatDiscussionLifecycle(
              { ...discussion, status },
              hasAnalysis,
            )}
        </span>
      </div>

      {success && <div className="mt-3 text-xs text-emerald-300">{success}</div>}
      {error && <div className="mt-3 text-xs text-red-300">{error}</div>}
    </div>
  );
}
