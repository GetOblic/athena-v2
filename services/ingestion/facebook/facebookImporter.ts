import { emitBrainEvent } from "@/services/brain/eventBus";
import { createDiscussion } from "@/services/discussionService";
import { processDiscussionEndToEnd } from "@/services/workflows/discussionWorkflow";
import {
  normalizeDiscussionIngestion,
  type DiscussionIngestionInput,
} from "@/services/ingestion/facebook/facebookNormalizer";

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

  const organizationId = discussion.organization_id ?? input.organizationId;
  const workflow = await processDiscussionEndToEnd(
    discussion.id,
    organizationId,
  );

  return {
    discussion,
    workflow,
  };
}
