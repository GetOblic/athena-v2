"use client";

import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { OpportunityStatusBadge } from "@/components/queues/OpportunityStatusBadge";
import {
  getOpportunityStatusPresentation,
  normalizeOpportunityStatus,
  OPPORTUNITY_STATUS_ORDER,
  type OpportunityStatusKey,
} from "@/lib/opportunityStatus";

export function OpportunityStatusControl({
  opportunityId,
  currentStatus,
}: {
  opportunityId: string;
  currentStatus: string;
}) {
  const router = useRouter();
  const normalizedStatus = normalizeOpportunityStatus(currentStatus);
  const [status, setStatus] = useState<OpportunityStatusKey>(normalizedStatus);
  const [isSaving, setIsSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);

  useEffect(() => {
    setStatus(normalizeOpportunityStatus(currentStatus));
    setSuccess(null);
    setError(null);
  }, [currentStatus]);

  useEffect(() => {
    if (!success) {
      return;
    }

    const timer = window.setTimeout(() => {
      setSuccess(null);
    }, 3000);

    return () => window.clearTimeout(timer);
  }, [success]);

  async function saveStatus(nextStatus: OpportunityStatusKey) {
    setIsSaving(true);
    setError(null);
    setSuccess(null);

    try {
      const response = await fetch(`/api/opportunities/${opportunityId}/status`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ status: nextStatus }),
      });

      const data = (await response.json()) as {
        success?: boolean;
        error?: string;
        opportunity?: { id?: string; status?: string };
      };

      if (!response.ok || !data.success || !data.opportunity?.status) {
        throw new Error(data.error || "Failed to update sales status");
      }

      setStatus(normalizeOpportunityStatus(data.opportunity.status));
      setSuccess("Sales status updated.");
      router.refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Unknown error");
    } finally {
      setIsSaving(false);
    }
  }

  return (
    <div className="space-y-4">
      <div>
        <OpportunityStatusBadge status={status} size="lg" />
      </div>

      <div className="flex flex-col gap-3 sm:flex-row sm:items-end">
        <label className="flex-1">
          <span className="mb-2 block text-xs uppercase tracking-[0.2em] text-white/35">
            Update status
          </span>
          <select
            value={status}
            onChange={(event) =>
              setStatus(event.target.value as OpportunityStatusKey)
            }
            disabled={isSaving}
            className="w-full rounded-2xl border border-white/10 bg-[#111116] px-4 py-3 text-sm text-white outline-none transition focus:border-[var(--athena-orange)]/40 disabled:opacity-50"
          >
            {OPPORTUNITY_STATUS_ORDER.map((option) => (
              <option key={option} value={option}>
                {getOpportunityStatusPresentation(option).label}
              </option>
            ))}
          </select>
        </label>

        <button
          type="button"
          onClick={() => saveStatus(status)}
          disabled={isSaving || status === normalizedStatus}
          className="rounded-2xl bg-[var(--athena-orange)] px-5 py-3 text-sm font-semibold text-white transition hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-40"
        >
          {isSaving ? "Saving..." : "Save Status"}
        </button>
      </div>

      {success && <div className="text-sm text-emerald-300">{success}</div>}
      {error && <div className="text-sm text-red-400">{error}</div>}
    </div>
  );
}
