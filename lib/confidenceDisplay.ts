export type ConfidenceLabel = "Low" | "Medium" | "High";

export function formatConfidenceLabel(confidence: number): ConfidenceLabel {
  const value = Math.max(0, Math.min(100, confidence));

  if (value >= 70) {
    return "High";
  }

  if (value >= 40) {
    return "Medium";
  }

  return "Low";
}

export function formatConfidencePercent(confidence: number): string {
  return `${Math.max(0, Math.min(100, confidence))}%`;
}
