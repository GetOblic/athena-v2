import { onBrainEvent } from "@/services/brain/eventBus";
import { learnFromApprovedBriefing } from "@/services/brain/learningService";

let registered = false;

export function registerBrainProcessors() {
  if (registered) return;
  registered = true;

  onBrainEvent("briefing.approved", async (event) => {
    const reviewId = event.payload.reviewId;

    if (typeof reviewId !== "string" || !reviewId) {
      throw new Error("briefing.approved event requires payload.reviewId");
    }

    await learnFromApprovedBriefing(reviewId);
  });
}
