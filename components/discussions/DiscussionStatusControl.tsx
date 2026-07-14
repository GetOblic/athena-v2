"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import {
  DISCUSSION_STATUS_OPTIONS,
  formatDiscussionLifecycle,
  getDiscussionLifecycle,
} from "@/lib/discussionStatus";
import type { Discussion } from "@/services/discussionService";
import { ATHENA_EXECUTIVE_CARD_OUTLINE_CLASS } from "@/components/ui/athenaExecutiveCard";

type DiscussionStatusControlProps = {
  discussion: Discussion;
  hasAnalysis: boolean;
};

export function DiscussionStatusControl({
  discussion,
  hasAnalysis,
}: DiscussionStatusControlProps) {
  const router = useRouter();
  const [status, setStatus] = useState(discussion.status || "New");
  const [isSaving, setIsSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);

  const lifecycle = getDiscussionLifecycle(discussion, hasAnalysis);

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
        throw new Error(payload.error || "Failed to update discussion status.");
      }

      setSuccess("Discussion status updated.");
      router.refresh();
    } catch (saveError) {
      setStatus(discussion.status || "New");
      setError(
        saveError instanceof Error
          ? saveError.message
          : "Failed to update discussion status.",
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
        Discussion Status
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
              {option}
            </option>
          ))}
        </select>

        <span className={`text-sm font-medium ${lifecycle.colorClass}`}>
          {formatDiscussionLifecycle(
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
