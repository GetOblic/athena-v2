const inFlightDiscussionRegenerations = new Set<string>();

export function markDiscussionRegenerationInFlight(
  discussionId: string,
): void {
  inFlightDiscussionRegenerations.add(discussionId);
}

export function clearDiscussionRegenerationInFlight(
  discussionId: string,
): void {
  inFlightDiscussionRegenerations.delete(discussionId);
}

export function isDiscussionRegenerationInFlight(
  discussionId: string,
): boolean {
  return inFlightDiscussionRegenerations.has(discussionId);
}
