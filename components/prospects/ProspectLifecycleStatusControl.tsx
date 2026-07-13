"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import {
  getProspectLifecycleColor,
  normalizeProspectLifecycleStatus,
  PROSPECT_LIFECYCLE_STATUSES,
  type ProspectLifecycleStatus,
} from "@/services/prospects/prospectLifecycle";
import type { Prospect } from "@/services/prospects/prospectService";

type ProspectLifecycleStatusControlProps = {
  prospect: Prospect;
};

export function ProspectLifecycleStatusControl({
  prospect,
}: ProspectLifecycleStatusControlProps) {
  const router = useRouter();
  const [lifecycleStatus, setLifecycleStatus] = useState<ProspectLifecycleStatus>(
    normalizeProspectLifecycleStatus(prospect.lifecycle_status),
  );
  const [isSaving, setIsSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);

  async function handleChange(nextStatus: string) {
    if (!PROSPECT_LIFECYCLE_STATUSES.includes(nextStatus as ProspectLifecycleStatus)) {
      return;
    }

    setLifecycleStatus(nextStatus as ProspectLifecycleStatus);
    setIsSaving(true);
    setError(null);
    setSuccess(null);

    try {
      const response = await fetch(`/api/prospects/${prospect.id}/lifecycle`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ lifecycle_status: nextStatus }),
      });

      const payload = await response.json();

      if (!response.ok || !payload.ok) {
        const message =
          typeof payload.error === "string"
            ? payload.error
            : payload.error?.message || "Failed to update Prospect status.";
        throw new Error(message);
      }

      setSuccess("Prospect status updated.");
      router.refresh();
    } catch (saveError) {
      setLifecycleStatus(
        normalizeProspectLifecycleStatus(prospect.lifecycle_status),
      );
      setError(
        saveError instanceof Error
          ? saveError.message
          : "Failed to update Prospect status.",
      );
    } finally {
      setIsSaving(false);
    }
  }

  return (
    <div className="rounded-[20px] border border-[var(--athena-border)] bg-[var(--athena-card)] p-5">
      <div className="text-xs uppercase tracking-[0.2em] text-white/35">
        Prospect Status
      </div>

      <div className="mt-3 flex flex-wrap items-center gap-3">
        <select
          value={lifecycleStatus}
          onChange={(event) => void handleChange(event.target.value)}
          disabled={isSaving}
          className="rounded-2xl border border-white/10 bg-black/30 px-4 py-3 text-sm text-white outline-none disabled:opacity-50"
        >
          {PROSPECT_LIFECYCLE_STATUSES.map((option) => (
            <option key={option} value={option}>
              {option}
            </option>
          ))}
        </select>

        <span
          className={`text-sm font-medium ${getProspectLifecycleColor(lifecycleStatus)}`}
        >
          {lifecycleStatus}
        </span>
      </div>

      {success && <div className="mt-3 text-xs text-emerald-300">{success}</div>}
      {error && <div className="mt-3 text-xs text-red-300">{error}</div>}
    </div>
  );
}
