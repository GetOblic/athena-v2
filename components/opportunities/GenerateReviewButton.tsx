"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";

export function GenerateReviewButton({ opportunityId }: { opportunityId: string }) {
  const router = useRouter();
  const [isGenerating, setIsGenerating] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleGenerate() {
    setIsGenerating(true);
    setError(null);

    try {
      const response = await fetch(`/api/opportunities/${opportunityId}/review`, {
        method: "POST",
      });

      const data = await response.json();

      if (!response.ok || !data.success) {
        throw new Error(data.error || "Failed to generate review");
      }

      router.refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Unknown error");
    } finally {
      setIsGenerating(false);
    }
  }

  return (
    <div>
      <button
        onClick={handleGenerate}
        disabled={isGenerating}
        className="rounded-2xl bg-[var(--athena-orange)] px-6 py-3 text-sm font-semibold text-white transition hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-50"
      >
        {isGenerating ? "Generating Executive Briefing..." : "Generate Executive Briefing"}
      </button>

      {error && <div className="mt-3 text-sm text-red-400">{error}</div>}
    </div>
  );
}
