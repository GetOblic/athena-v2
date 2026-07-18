import type { DiscussionAnalysis } from "@/services/discussionAnalysisService";

type RegenerationMetadataProps = {
  analysis: DiscussionAnalysis;
  /**
   * Executive Version publication/completion time when browsing versions.
   * Prefer this over analysis.created_at — Think Differently reuses analysis.
   */
  generatedAt?: string | null;
};

function formatModelLabel(model: string | null | undefined): string {
  if (!model?.trim()) {
    return "Athena model";
  }

  const normalized = model.toLowerCase();

  if (normalized.includes("claude-sonnet-4") || normalized.includes("sonnet-4")) {
    return "Claude Sonnet 4";
  }

  if (normalized.includes("claude-opus-4")) {
    return "Claude Opus 4";
  }

  if (normalized.includes("o3")) {
    return "OpenAI o3";
  }

  if (normalized.includes("gpt-4")) {
    return "GPT-4";
  }

  const segments = model.split("/");
  const shortName = segments[segments.length - 1] ?? model;
  return shortName
    .split("-")
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(" ");
}

function formatGeneratedAt(createdAt: string): string {
  const created = new Date(createdAt);
  const now = new Date();
  const sameDay =
    created.getFullYear() === now.getFullYear() &&
    created.getMonth() === now.getMonth() &&
    created.getDate() === now.getDate();

  const timeLabel = created.toLocaleTimeString("en-US", {
    hour: "numeric",
    minute: "2-digit",
  });

  if (sameDay) {
    return `Today • ${timeLabel}`;
  }

  return created.toLocaleString("en-US", {
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
  });
}

function formatGenerationTime(generationTimeMs: number | null | undefined): string {
  if (!generationTimeMs || generationTimeMs <= 0) {
    return "—";
  }

  const seconds = Math.max(1, Math.round(generationTimeMs / 1000));
  return `${seconds} second${seconds === 1 ? "" : "s"}`;
}

export function RegenerationMetadata({
  analysis,
  generatedAt = null,
}: RegenerationMetadataProps) {
  const generatedTimestamp = generatedAt?.trim() || analysis.created_at;

  return (
    <div className="mt-4 flex flex-wrap gap-x-8 gap-y-2 text-sm text-white/45">
      <div>
        <span className="text-white/30">Generated: </span>
        <span className="text-white/65">
          {formatGeneratedAt(generatedTimestamp)}
        </span>
      </div>
      <div>
        <span className="text-white/30">Generation Time: </span>
        <span className="text-white/65">
          {formatGenerationTime(analysis.generation_time_ms)}
        </span>
      </div>
      <div>
        <span className="text-white/30">Model: </span>
        <span className="text-white/65">{formatModelLabel(analysis.model)}</span>
      </div>
    </div>
  );
}
