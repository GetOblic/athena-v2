"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { useBackgroundActionCompletionSound } from "@/lib/completionSound/useBackgroundActionCompletionSound";

type GenerateCommunityIntelligenceChrome = {
  refreshIntelligence?: string;
  refreshingIntelligence?: string;
  refreshFailed?: string;
  unknownError?: string;
};

export function GenerateCommunityIntelligenceButton({
  communityId,
  chrome,
}: {
  communityId: string;
  chrome?: GenerateCommunityIntelligenceChrome;
}) {
  const router = useRouter();
  const completionSound = useBackgroundActionCompletionSound();
  const [isGenerating, setIsGenerating] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const refreshLabel = chrome?.refreshIntelligence ?? "Refresh Intelligence";
  const refreshingLabel =
    chrome?.refreshingIntelligence ?? "Refreshing Intelligence...";
  const refreshFailed =
    chrome?.refreshFailed ?? "Failed to generate community intelligence";
  const unknownError = chrome?.unknownError ?? "Unknown error";

  async function handleGenerate() {
    completionSound.unlock();
    setIsGenerating(true);
    setError(null);
    completionSound.observe("generating");

    try {
      const response = await fetch(`/api/communities/${communityId}/intelligence`, {
        method: "POST",
      });

      const data = await response.json();

      if (!response.ok || !data.success) {
        throw new Error(data.error || refreshFailed);
      }

      completionSound.observe("completed");
      router.refresh();
    } catch (err) {
      completionSound.observe("failed");
      setError(err instanceof Error ? err.message : unknownError);
    } finally {
      setIsGenerating(false);
    }
  }

  return (
    <div>
      <button
        onClick={handleGenerate}
        disabled={isGenerating}
        className="rounded-full bg-[var(--athena-orange)] px-6 py-4 text-sm font-semibold text-white shadow-xl shadow-orange-500/20 transition hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-50"
      >
        {isGenerating ? refreshingLabel : refreshLabel}
      </button>

      {error && <div className="mt-3 text-sm text-red-400">{error}</div>}
    </div>
  );
}
