import { emitBrainEvent } from "@/services/brain/eventBus";
import { createDiscussion } from "@/services/discussionService";
import {
  normalizeDiscussionIngestion,
  type DiscussionIngestionInput,
} from "@/services/ingestion/facebook/facebookNormalizer";

/**
 * Persist a new discussion and emit the import learning signal.
 * Does NOT run the AI pipeline — callers must enqueue a durable generation job.
 */
export async function importFacebookDiscussion(
  input: DiscussionIngestionInput,
) {
  const normalized = normalizeDiscussionIngestion(input);

  const discussion = await createDiscussion(normalized);

  if (!discussion) {
    throw new Error("Failed to import discussion.");
  }

  await emitBrainEvent("discussion.imported", {
    discussionId: discussion.id,
    communityId: discussion.community_id,
    platform: discussion.platform,
  });

  return {
    discussion,
  };
}
