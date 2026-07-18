"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { useBackgroundActionCompletionSound } from "@/lib/completionSound/useBackgroundActionCompletionSound";

export function GenerateReviewButton({ opportunityId }: { opportunityId: string }) {
  const router = useRouter();
  const completionSound = useBackgroundActionCompletionSound();
  const [isGenerating, setIsGenerating] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleGenerate() {
    completionSound.unlock();
    setIsGenerating(true);
    setError(null);
    completionSound.observe("generating");

    try {
      const response = await fetch(`/api/opportunities/${opportunityId}/review`, {
        method: "POST",
      });

      const data = await response.json();

      if (!response.ok || !data.success) {
        throw new Error(data.error || "Failed to generate review");
      }

      completionSound.observe("completed");
      router.refresh();
    } catch (err) {
      completionSound.observe("failed");
      setError(err instanceof Error ? err.message : "Unknown error");
    } finally {
      setIsGenerating(false);
    }
  }

  return (
    <div>
      <p className="mb-4 max-w-md text-sm leading-6 text-white/40">
        Regenerates the current executive briefing from this opportunity. The
        latest briefing fields will be replaced with a fresh pass.
      </p>

      <button
        onClick={handleGenerate}
        disabled={isGenerating}
        className="rounded-2xl bg-[var(--athena-orange)] px-6 py-3 text-sm font-semibold text-white transition hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-50"
      >
        {isGenerating ? "Refreshing Executive Briefing..." : "Refresh Executive Briefing"}
      </button>

      {error && <div className="mt-3 text-sm text-red-400">{error}</div>}
    </div>
  );
}
