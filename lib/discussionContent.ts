import type { Discussion } from "@/services/discussionService";
import type { DiscussionUpdate } from "@/services/discussionUpdateService";

export type ThreadUpdateDisplay = {
  id?: string;
  author: string | null;
  url: string | null;
  body: string;
  capturedAt: string;
  source: "table" | "legacy";
};

const THREAD_UPDATE_MARKER = /\n---\nTHREAD UPDATE —/;

function parseLegacyThreadUpdates(
  discussion: Discussion,
): ThreadUpdateDisplay[] {
  const rawJson = discussion.raw_json ?? {};
  const legacyUpdates = Array.isArray(rawJson.thread_updates)
    ? rawJson.thread_updates
    : [];

  return legacyUpdates.map((entry, index) => {
    const update = entry as Record<string, unknown>;
    return {
      id: `legacy-${index}`,
      author: typeof update.author === "string" ? update.author : null,
      url: typeof update.url === "string" ? update.url : null,
      body: typeof update.body === "string" ? update.body : "",
      capturedAt:
        typeof update.captured_at === "string"
          ? update.captured_at
          : discussion.updated_at,
      source: "legacy" as const,
    };
  });
}

export function getOriginalDiscussionBody(discussion: Discussion): string {
  const rawJson = discussion.raw_json ?? {};

  if (typeof rawJson.original_body === "string") {
    return rawJson.original_body;
  }

  const body = discussion.body ?? "";
  const markerIndex = body.search(THREAD_UPDATE_MARKER);

  if (markerIndex >= 0) {
    return body.slice(0, markerIndex).trim();
  }

  const legacyUpdates = parseLegacyThreadUpdates(discussion);
  if (legacyUpdates.length > 0 && body.includes("THREAD UPDATE")) {
    return body.split("---")[0]?.trim() ?? body;
  }

  return body;
}

export function getThreadUpdatesForDisplay(
  discussion: Discussion,
  tableUpdates: DiscussionUpdate[] = [],
): ThreadUpdateDisplay[] {
  if (tableUpdates.length > 0) {
    return tableUpdates.map((update) => ({
      id: update.id,
      author: update.author,
      url: update.url,
      body: update.body,
      capturedAt: update.created_at,
      source: "table" as const,
    }));
  }

  return parseLegacyThreadUpdates(discussion);
}

export function buildAnalysisThreadBody(
  discussion: Discussion,
  tableUpdates: DiscussionUpdate[] = [],
): string {
  const originalBody = getOriginalDiscussionBody(discussion);
  const updates = getThreadUpdatesForDisplay(discussion, tableUpdates);

  if (updates.length === 0) {
    return originalBody;
  }

  const updateBlocks = updates.map((update) => {
    return [
      "---",
      `THREAD UPDATE — ${update.capturedAt}`,
      update.author ? `Author: ${update.author}` : null,
      update.url ? `URL: ${update.url}` : null,
      "",
      update.body,
    ]
      .filter((line) => line !== null)
      .join("\n");
  });

  return [originalBody, ...updateBlocks].filter(Boolean).join("\n\n");
}
