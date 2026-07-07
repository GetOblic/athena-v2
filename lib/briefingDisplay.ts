import type { AthenaReview } from "@/services/reviewService";

function extractSummaryFromJson(text: string): string | null {
  try {
    const parsed = JSON.parse(text) as Record<string, unknown>;

    if (typeof parsed.executive_summary === "string" && parsed.executive_summary.trim()) {
      return parsed.executive_summary.trim();
    }

    if (typeof parsed.summary === "string" && parsed.summary.trim()) {
      return parsed.summary.trim();
    }
  } catch {
    return null;
  }

  return null;
}

function stripMarkdown(text: string): string {
  return text
    .replace(/\*\*ATHENA BUSINESS INTELLIGENCE REVIEW\*\*/gi, "")
    .replace(/\*\*([^*]+)\*\*/g, "$1")
    .replace(/^#+\s*/gm, "")
    .replace(/^\*\s+/gm, "")
    .replace(/\s+/g, " ")
    .trim();
}

function looksLikeJsonDump(text: string): boolean {
  const trimmed = text.trim();
  return trimmed.startsWith("{") || trimmed.startsWith("[");
}

export function cleanBriefingSummary(text: string): string {
  let cleaned = text.trim();

  if (!cleaned) {
    return "Untitled briefing";
  }

  if (looksLikeJsonDump(cleaned)) {
    const fromJson = extractSummaryFromJson(cleaned);
    if (fromJson) {
      cleaned = fromJson;
    }
  }

  cleaned = stripMarkdown(cleaned);

  if (!cleaned) {
    return "Untitled briefing";
  }

  if (cleaned.length > 180) {
    return `${cleaned.slice(0, 177).trim()}...`;
  }

  return cleaned;
}

export function getBriefingListSummary(briefing: AthenaReview): string {
  const parsedReview = briefing.raw_json?.parsed_review as
    | { summary?: string; executive_summary?: string }
    | undefined;

  if (parsedReview?.executive_summary?.trim()) {
    return cleanBriefingSummary(parsedReview.executive_summary);
  }

  if (parsedReview?.summary?.trim()) {
    return cleanBriefingSummary(parsedReview.summary);
  }

  if (briefing.summary?.trim()) {
    return cleanBriefingSummary(briefing.summary);
  }

  return "Untitled briefing";
}
