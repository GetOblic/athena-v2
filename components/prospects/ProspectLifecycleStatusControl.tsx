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
import { ListChecks } from "lucide-react";
import { PROSPECT_LIFECYCLE_COMPACT_CLASS } from "@/lib/prospects/prospectDetailPresentation";
import { getLocalizedProspectLifecycleLabel } from "@/lib/tenantI18n/prospectPresentation";
import type { TenantMessages } from "@/lib/tenantI18n/types";

type ProspectLifecycleStatusControlProps = {
  prospect: Prospect;
  messages?: TenantMessages;
  compact?: boolean;
};

export function ProspectLifecycleStatusControl({
  prospect,
  messages,
  compact = true,
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
            : payload.error?.message ||
              (messages?.prospects.lifecycle.updateFailed ??
                "Failed to update Prospect status.");
        throw new Error(message);
      }

      setSuccess(
        messages?.prospects.lifecycle.updated ?? "Prospect status updated.",
      );
      router.refresh();
    } catch (saveError) {
      setLifecycleStatus(
        normalizeProspectLifecycleStatus(prospect.lifecycle_status),
      );
      setError(
        saveError instanceof Error
          ? saveError.message
          : (messages?.prospects.lifecycle.updateFailed ??
            "Failed to update Prospect status."),
      );
    } finally {
      setIsSaving(false);
    }
  }

  const label = messages?.prospects.lifecycle.label ?? "Prospect Status";
  const statusColor = getProspectLifecycleColor(lifecycleStatus);

  if (compact) {
    return (
      <div
        data-prospect-header-action="lifecycle"
        className={PROSPECT_LIFECYCLE_COMPACT_CLASS}
      >
        <span className={statusColor} aria-hidden="true">
          <ListChecks className="size-4" />
        </span>
        <span className="text-[10px] font-semibold uppercase tracking-[0.16em] text-white/40">
          {label}
        </span>
        <select
          value={lifecycleStatus}
          onChange={(event) => void handleChange(event.target.value)}
          disabled={isSaving}
          aria-label={label}
          className="h-8 min-w-0 rounded-xl border border-white/10 bg-black/30 px-2 text-xs text-white outline-none disabled:opacity-50"
        >
          {PROSPECT_LIFECYCLE_STATUSES.map((option) => (
            <option key={option} value={option}>
              {messages
                ? getLocalizedProspectLifecycleLabel(messages, option)
                : option}
            </option>
          ))}
        </select>
        {success ? (
          <span className="text-[11px] text-emerald-300">{success}</span>
        ) : null}
        {error ? <span className="text-[11px] text-red-300">{error}</span> : null}
      </div>
    );
  }

  return (
    <div className="rounded-[20px] border border-white/10 bg-[var(--athena-card)] p-5">
      <div className="text-xs uppercase tracking-[0.2em] text-white/35">
        {label}
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
              {messages
                ? getLocalizedProspectLifecycleLabel(messages, option)
                : option}
            </option>
          ))}
        </select>

        <span className={`text-sm font-medium ${statusColor}`}>
          {messages
            ? getLocalizedProspectLifecycleLabel(messages, lifecycleStatus)
            : lifecycleStatus}
        </span>
      </div>

      {success && <div className="mt-3 text-xs text-emerald-300">{success}</div>}
      {error && <div className="mt-3 text-xs text-red-300">{error}</div>}
    </div>
  );
}
