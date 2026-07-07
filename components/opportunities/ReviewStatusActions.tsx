"use client";

import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { BriefingStatusBadge } from "@/components/briefings/BriefingStatusBadge";
import {
  isApprovedStatus,
  isNeedsRevisionStatus,
} from "@/lib/briefingStatus";

export function ReviewStatusActions({
  reviewId,
  currentStatus,
}: {
  reviewId: string;
  currentStatus: string;
}) {
  const router = useRouter();
  const [status, setStatus] = useState(currentStatus);
  const [isUpdating, setIsUpdating] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);

  useEffect(() => {
    setStatus(currentStatus);
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

  const isApproved = isApprovedStatus(status);
  const needsRevision = isNeedsRevisionStatus(status);

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
        throw new Error(data.error || "Failed to update briefing status");
      }

      setStatus(data.review.status);
      setSuccess(
        action === "approve"
          ? "Briefing approved successfully."
          : "Revision requested successfully.",
      );
      router.refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Unknown error");
    } finally {
      setIsUpdating(false);
    }
  }

  return (
    <div className="flex flex-col items-start gap-3">
      <div className="text-sm text-white/40">
        Status: <BriefingStatusBadge status={status} />
      </div>

      <div className="flex flex-wrap gap-3">
        <button
          type="button"
          onClick={() => updateStatus("approve")}
          disabled={isUpdating || isApproved}
          className="rounded-2xl bg-emerald-500 px-5 py-2 text-sm font-semibold text-white transition hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-40"
        >
          {isApproved ? "Briefing Approved" : "Approve Briefing"}
        </button>

        <button
          type="button"
          onClick={() => updateStatus("request_revision")}
          disabled={isUpdating || needsRevision}
          className="rounded-2xl bg-red-500 px-5 py-2 text-sm font-semibold text-white transition hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-40"
        >
          {needsRevision ? "Revision Requested" : "Request Revision"}
        </button>
      </div>

      {success && <div className="text-sm text-emerald-300">{success}</div>}
      {error && <div className="text-sm text-red-400">{error}</div>}
    </div>
  );
}
