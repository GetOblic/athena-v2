"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { BriefingStatusBadge } from "@/components/briefings/BriefingStatusBadge";
import {
  getBriefingStatusPresentation,
  isApprovedStatus,
  isNeedsRevisionStatus,
  normalizeBriefingStatus,
  type BriefingStatusKey,
} from "@/lib/briefingStatus";

export type BriefingStatusPanelChrome = {
  status: string;
  approve: string;
  approved: string;
  requestRevision: string;
  revisionRequested: string;
  approvedSuccess: string;
  revisionSuccess: string;
  statusUpdateFailed: string;
  unknownError: string;
  statusLabels?: Partial<Record<BriefingStatusKey, string>>;
};

type BriefingStatusPanelProps = {
  reviewId: string;
  initialStatus: string;
  chrome?: BriefingStatusPanelChrome | null;
};

export function BriefingStatusPanel({
  reviewId,
  initialStatus,
  chrome,
}: BriefingStatusPanelProps) {
  const router = useRouter();
  const [status, setStatus] = useState(initialStatus);
  const [isUpdating, setIsUpdating] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);

  useEffect(() => {
    setStatus(initialStatus);
    setSuccess(null);
    setError(null);
  }, [initialStatus]);

  useEffect(() => {
    if (!success) {
      return;
    }

    const timer = window.setTimeout(() => {
      setSuccess(null);
    }, 3000);

    return () => window.clearTimeout(timer);
  }, [success]);

  async function updateStatus(action: "approve" | "request_revision") {
    setIsUpdating(true);
    setError(null);
    setSuccess(null);

    try {
      const response = await fetch(`/api/reviews/${reviewId}/status`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ action }),
      });

      const data = (await response.json()) as {
        success?: boolean;
        error?: string;
        review?: { id?: string; status?: string };
      };

      if (!response.ok || !data.success || !data.review?.status) {
        throw new Error(
          data.error ||
            chrome?.statusUpdateFailed ||
            "Failed to update briefing status",
        );
      }

      setStatus(data.review.status);
      setSuccess(
        action === "approve"
          ? (chrome?.approvedSuccess ?? "Briefing approved successfully.")
          : (chrome?.revisionSuccess ?? "Revision requested successfully."),
      );
      router.refresh();
    } catch (err) {
      setError(
        err instanceof Error
          ? err.message
          : (chrome?.unknownError ?? "Unknown error"),
      );
    } finally {
      setIsUpdating(false);
    }
  }

  const approved = isApprovedStatus(status);
  const needsRevision = isNeedsRevisionStatus(status);

  return (
    <div className="rounded-3xl border border-[var(--athena-border)] bg-[var(--athena-card)] p-8">
      <div className="text-white/40">{chrome?.status ?? "Status"}</div>
      <div className="mt-4">
        <BriefingStatusBadge
          status={status}
          size="lg"
          label={
            chrome?.statusLabels?.[normalizeBriefingStatus(status)] ??
            getBriefingStatusPresentation(status).label
          }
        />
      </div>

      <div className="mt-6 flex flex-wrap gap-3">
        <button
          type="button"
          onClick={() => updateStatus("approve")}
          disabled={isUpdating || approved}
          className="rounded-2xl bg-emerald-500 px-5 py-2 text-sm font-semibold text-white transition hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-40"
        >
          {approved
            ? (chrome?.approved ?? "Briefing Approved")
            : (chrome?.approve ?? "Approve Briefing")}
        </button>

        <button
          type="button"
          onClick={() => updateStatus("request_revision")}
          disabled={isUpdating || needsRevision}
          className="rounded-2xl bg-red-500 px-5 py-2 text-sm font-semibold text-white transition hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-40"
        >
          {needsRevision
            ? (chrome?.revisionRequested ?? "Revision Requested")
            : (chrome?.requestRevision ?? "Request Revision")}
        </button>
      </div>

      {success && <div className="mt-4 text-sm text-emerald-300">{success}</div>}
      {error && <div className="mt-4 text-sm text-red-400">{error}</div>}
    </div>
  );
}
