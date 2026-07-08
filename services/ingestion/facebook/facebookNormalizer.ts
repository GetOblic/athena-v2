export type DiscussionIngestionInput = {
  organizationId: string;
  platform: string;
  communityId?: string | null;
  userId?: string | null;
  title: string;
  author: string;
  url: string;
  body: string;
  capturedAt?: string | null;
};

export type NormalizedDiscussionIngestion = {
  organization_id: string;
  community_id: string | null;
  user_id: string | null;
  platform: string;
  title: string;
  author: string;
  url: string;
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

export function validateDiscussionIngestionInput(input: DiscussionIngestionInput) {
  const platform = cleanText(input.platform);
  const title = cleanText(input.title);
  const author = cleanText(input.author);
  const url = cleanText(input.url);
  const body = input.body.trim();

  if (!platform) {
    throw new Error("Platform is required.");
  }

  if (!title) {
    throw new Error("Title is required.");
  }

  if (!author) {
    throw new Error("Author is required.");
  }

  if (!url) {
    throw new Error("Source URL is required.");
  }

  if (!body) {
    throw new Error("Discussion content is required.");
  }

  return { platform, title, author, url, body };
}

export function normalizeDiscussionIngestion(
  input: DiscussionIngestionInput,
): NormalizedDiscussionIngestion {
  const validated = validateDiscussionIngestionInput(input);
  const capturedAt = input.capturedAt || new Date().toISOString();

  return {
    organization_id: input.organizationId,
    community_id: input.communityId ?? null,
    user_id: input.userId ?? null,
    platform: validated.platform,
    title: validated.title,
    author: validated.author,
    url: validated.url,
    body: validated.body,
    status: "New",
    priority: inferPriority(validated.body),
    opportunity_score: inferOpportunityScore(validated.body),
    sentiment: null,
    summary: null,
    ai_notes: "Imported via Athena discussion ingestion.",
    last_activity: capturedAt,
    raw_json: {
      source: "discussion_ingestion",
      ingestion_version: "discussion_ingestion_v2",
      captured_at: capturedAt,
      original_body: validated.body,
      original: input,
    },
  };
}

/** @deprecated Use normalizeDiscussionIngestion */
export type FacebookDiscussionInput = DiscussionIngestionInput;

/** @deprecated Use NormalizedDiscussionIngestion */
export type NormalizedFacebookDiscussion = NormalizedDiscussionIngestion;

/** @deprecated Use normalizeDiscussionIngestion */
export function normalizeFacebookDiscussion(input: DiscussionIngestionInput) {
  return normalizeDiscussionIngestion(input);
}
