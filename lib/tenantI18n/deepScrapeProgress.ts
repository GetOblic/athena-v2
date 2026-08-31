import { interpolateTenantMessage } from "./interpolate";
import type { TenantMessages } from "./types";

export type DeepScrapeProgressMessages = TenantMessages["identity"]["deepScrape"];

export type DeepScrapeProgressJob = {
  status?: string;
  stage?: string;
  pagesCrawled?: number;
  pagesTarget?: number | null;
  pagesRendered?: number | null;
  phase?: string | null;
};

/**
 * Localize Identity Deep Scrape progress from structured job fields.
 * Does not read or parse the server-authored English `label`.
 */
export function localizeDeepScrapeStage(
  job: DeepScrapeProgressJob | null | undefined,
  messages: DeepScrapeProgressMessages,
): string {
  if (!job) return messages.queued;
  if (job.status === "failed") return messages.failed;
  if (job.status === "completed") return messages.completed;
  if (job.status === "queued") return messages.queued;
  if (job.status === "awaiting_follow_on") return messages.awaitingFollowOn;

  switch (job.stage) {
    case "discovering":
      return messages.discovering;
    case "crawling": {
      const crawled =
        typeof job.pagesCrawled === "number" ? job.pagesCrawled : null;
      const target =
        typeof job.pagesTarget === "number" ? job.pagesTarget : null;
      if (job.phase === "rendering") {
        const rendered =
          typeof job.pagesRendered === "number"
            ? job.pagesRendered
            : crawled;
        if (rendered !== null && target !== null) {
          return interpolateTenantMessage(messages.renderingWithTarget, {
            rendered,
            target,
          });
        }
        if (rendered !== null) {
          return interpolateTenantMessage(messages.rendering, { rendered });
        }
        return messages.crawling;
      }
      if (crawled !== null && target !== null) {
        return interpolateTenantMessage(messages.crawlingWithTarget, {
          crawled,
          target,
        });
      }
      if (crawled !== null) {
        return interpolateTenantMessage(messages.crawlingWithCount, {
          crawled,
        });
      }
      return messages.crawling;
    }
    case "synthesizing":
    case "persisting":
      return messages.synthesizing;
    case "retraining":
      return messages.retraining;
    case "regenerating":
      return messages.regenerating;
    case "completed":
      return messages.completed;
    case "failed":
      return messages.failed;
    default:
      return messages.queued;
  }
}
