export type DomainHealthState = "Learning" | "Building" | "Confident" | "Mature";

export function formatDomainHealthState(input: {
  knowledgeConfidence: number | null;
  discussionsAnalyzed: number;
}): DomainHealthState {
  const confidence = input.knowledgeConfidence ?? 0;

  if (confidence >= 70 && input.discussionsAnalyzed >= 3) {
    return "Mature";
  }

  if (confidence >= 50 || input.discussionsAnalyzed >= 3) {
    return "Confident";
  }

  if (input.discussionsAnalyzed > 0 || confidence > 0) {
    return "Building";
  }

  return "Learning";
}

export function isDomainHealthState(
  value?: string | null,
): value is DomainHealthState {
  return (
    value === "Learning" ||
    value === "Building" ||
    value === "Confident" ||
    value === "Mature"
  );
}

export function getDomainHealthStateColor(state: string): string {
  switch (state) {
    case "Mature":
      return "text-[var(--athena-success)]";
    case "Confident":
      return "text-emerald-300";
    case "Building":
      return "text-[var(--athena-orange)]";
    default:
      return "text-white/55";
  }
}
