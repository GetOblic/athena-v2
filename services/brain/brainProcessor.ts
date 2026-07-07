import { onBrainEvent } from "@/services/brain/eventBus";
import { learnFromApprovedBriefing } from "@/services/brain/learningService";

let registered = false;

export function registerBrainProcessors() {
  if (registered) return;
  registered = true;

  onBrainEvent("briefing.approved", async (event) => {
    const reviewId = event.payload.reviewId;
    const organizationId = event.payload.organizationId;

    if (typeof reviewId !== "string" || !reviewId) {
      throw new Error("briefing.approved event requires payload.reviewId");
    }

    if (typeof organizationId !== "string" || !organizationId) {
      throw new Error(
        "briefing.approved event requires payload.organizationId",
      );
    }

    await learnFromApprovedBriefing(reviewId, organizationId);
  });
}
