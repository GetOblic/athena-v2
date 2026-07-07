export type FacebookDiscussionInput = {
  communityId?: string | null;
  title?: string | null;
  author?: string | null;
  url?: string | null;
  body: string;
  capturedAt?: string | null;
};

export type NormalizedFacebookDiscussion = {
  community_id: string | null;
  platform: "Facebook Group";
  title: string;
  author: string | null;
  url: string | null;
  body: string;
  status: "New";
  priority: number;
  opportunity_score: number;
  sentiment: string | null;
  summary: string | null;
  ai_notes: string | null;
  last_activity: string;
  raw_json: Record<string, unknown>;
};

function cleanText(value: string | null | undefined): string {
  return (value ?? "").replace(/\s+/g, " ").trim();
}

function inferTitle(body: string, explicitTitle?: string | null): string {
  const cleanedTitle = cleanText(explicitTitle);

  if (cleanedTitle) {
    return cleanedTitle.slice(0, 180);
  }

  const firstUsefulLine =
    body
      .split("\n")
      .map((line) => line.trim())
      .find((line) => line.length >= 12) ?? body;

  return cleanText(firstUsefulLine).slice(0, 180) || "Untitled Facebook discussion";
}

function inferPriority(body: string): number {
  const text = body.toLowerCase();

  const highIntentSignals = [
    "recommend",
    "looking for",
    "need help",
    "how much",
    "price",
    "course",
    "training",
    "certification",
    "client",
    "book",
    "appointment",
  ];

  const matches = highIntentSignals.filter((signal) => text.includes(signal)).length;

  if (matches >= 4) return 5;
  if (matches >= 3) return 4;
  if (matches >= 2) return 3;
  if (matches >= 1) return 2;

  return 1;
}

function inferOpportunityScore(body: string): number {
  const priority = inferPriority(body);
  return Math.min(100, priority * 18);
}

export function normalizeFacebookDiscussion(
  input: FacebookDiscussionInput,
): NormalizedFacebookDiscussion {
  const body = input.body.trim();

  if (!body) {
    throw new Error("Facebook discussion body is required.");
  }

  const capturedAt = input.capturedAt || new Date().toISOString();

  return {
    community_id: input.communityId ?? null,
    platform: "Facebook Group",
    title: inferTitle(body, input.title),
    author: cleanText(input.author) || null,
    url: cleanText(input.url) || null,
    body,
    status: "New",
    priority: inferPriority(body),
    opportunity_score: inferOpportunityScore(body),
    sentiment: null,
    summary: null,
    ai_notes: "Imported from Facebook ingestion v1.",
    last_activity: capturedAt,
    raw_json: {
      source: "facebook_group",
      ingestion_version: "facebook_ingestion_v1",
      captured_at: capturedAt,
      original: input,
    },
  };
}
