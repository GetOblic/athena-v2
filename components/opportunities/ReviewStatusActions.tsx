"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";

export function ReviewStatusActions({
  reviewId,
  currentStatus,
}: {
  reviewId: string;
  currentStatus: string;
}) {
  const router = useRouter();
  const [isUpdating, setIsUpdating] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function updateStatus(action: "approve" | "reject") {
    setIsUpdating(true);
    setError(null);

    try {
      const response = await fetch(`/api/reviews/${reviewId}/status`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ action }),
      });

      const data = await response.json();

      if (!response.ok || !data.success) {
        throw new Error(data.error || "Failed to update review status");
      }

      router.refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Unknown error");
    } finally {
      setIsUpdating(false);
    }
  }

  return (
    <div className="flex flex-col items-start gap-3">
      <div className="flex gap-3">
        <button
          onClick={() => updateStatus("approve")}
          disabled={isUpdating || currentStatus === "approved"}
          className="rounded-2xl bg-emerald-500 px-5 py-2 text-sm font-semibold text-white transition hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-40"
        >
          {currentStatus === "approved" ? "Briefing Approved" : "Approve Briefing"}
        </button>

        <button
          onClick={() => updateStatus("reject")}
          disabled={isUpdating || currentStatus === "rejected"}
          className="rounded-2xl bg-red-500 px-5 py-2 text-sm font-semibold text-white transition hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-40"
        >
          {currentStatus === "rejected" ? "Marked for Revision" : "Needs Revision"}
        </button>
      </div>

      <div className="max-w-md space-y-1 text-xs leading-5 text-white/40">
        <p>Approve marks this briefing as ready for use.</p>
        <p>Needs Revision marks it for another pass.</p>
      </div>

      {error && <div className="text-sm text-red-400">{error}</div>}
    </div>
  );
}
