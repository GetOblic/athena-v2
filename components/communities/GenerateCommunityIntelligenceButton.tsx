"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { useBackgroundActionCompletionSound } from "@/lib/completionSound/useBackgroundActionCompletionSound";

export function GenerateCommunityIntelligenceButton({
  communityId,
}: {
  communityId: string;
}) {
  const router = useRouter();
  const completionSound = useBackgroundActionCompletionSound();
  const [isGenerating, setIsGenerating] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleGenerate() {
    setIsGenerating(true);
    setError(null);
    completionSound.observe("generating");

    try {
      const response = await fetch(`/api/communities/${communityId}/intelligence`, {
        method: "POST",
      });

      const data = await response.json();

      if (!response.ok || !data.success) {
        throw new Error(data.error || "Failed to generate community intelligence");
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
      <button
        onClick={handleGenerate}
        disabled={isGenerating}
        className="rounded-full bg-[var(--athena-orange)] px-6 py-4 text-sm font-semibold text-white shadow-xl shadow-orange-500/20 transition hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-50"
      >
        {isGenerating ? "Refreshing Intelligence..." : "Refresh Intelligence"}
      </button>

      {error && <div className="mt-3 text-sm text-red-400">{error}</div>}
    </div>
  );
}
