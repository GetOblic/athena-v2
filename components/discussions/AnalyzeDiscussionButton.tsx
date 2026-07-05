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
      <button
        onClick={handleAnalyze}
        disabled={isAnalyzing}
        className="w-full rounded-full bg-[var(--athena-orange)] px-6 py-4 text-sm font-semibold text-white shadow-xl shadow-orange-500/20 transition hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-50"
      >
        {isAnalyzing ? "Analyzing Discussion..." : "Analyze Discussion"}
      </button>

      {error && <div className="mt-3 text-sm text-red-400">{error}</div>}
    </div>
  );
}
