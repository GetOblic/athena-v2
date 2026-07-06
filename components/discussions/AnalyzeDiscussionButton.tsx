"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";

export function AnalyzeDiscussionButton({ discussionId }: { discussionId: string }) {
  const router = useRouter();
  const [isAnalyzing, setIsAnalyzing] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleAnalyze() {
    setIsAnalyzing(true);
    setError(null);

    try {
      const response = await fetch(`/api/discussions/${discussionId}/analyze`, {
        method: "POST",
      });

      const data = await response.json();

      if (!response.ok || !data.success) {
        throw new Error(data.error || "Failed to analyze discussion");
      }

      router.refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Unknown error");
    } finally {
      setIsAnalyzing(false);
    }
  }

  return (
    <div>
      <p className="mb-4 text-sm leading-6 text-white/40">
        Regenerates the current AI analysis from the source discussion. Existing
        fields will be replaced with a fresh pass.
      </p>

      <button
        onClick={handleAnalyze}
        disabled={isAnalyzing}
        className="w-full rounded-full bg-[var(--athena-orange)] px-6 py-4 text-sm font-semibold text-white shadow-xl shadow-orange-500/20 transition hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-50"
      >
        {isAnalyzing ? "Refreshing AI Analysis..." : "Refresh AI Analysis"}
      </button>

      {error && <div className="mt-3 text-sm text-red-400">{error}</div>}
    </div>
  );
}
