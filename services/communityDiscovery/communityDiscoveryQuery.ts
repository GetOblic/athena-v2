import {
  COMMUNITY_DISCOVERY_OBJECTIVE_MAX_LENGTH,
  COMMUNITY_DISCOVERY_OBJECTIVE_MIN_LENGTH,
} from "@/services/communityDiscovery/communityDiscoveryLimits";
import { CommunityDiscoveryRequestError } from "@/services/communityDiscovery/communityDiscoveryErrors";

export function assertDiscoveryObjective(objective: unknown): string {
  if (typeof objective !== "string") {
    throw new CommunityDiscoveryRequestError(
      "INVALID_OBJECTIVE",
      "Enter an objective.",
      400,
    );
  }
  if (/[\u0000-\u001F\u007F]/.test(objective)) {
    throw new CommunityDiscoveryRequestError(
      "INVALID_OBJECTIVE",
      "Objective contains unsupported characters.",
      400,
    );
  }
  const trimmed = objective.trim();
  if (trimmed.length < COMMUNITY_DISCOVERY_OBJECTIVE_MIN_LENGTH) {
    throw new CommunityDiscoveryRequestError(
      "INVALID_OBJECTIVE",
      `Enter an objective of at least ${COMMUNITY_DISCOVERY_OBJECTIVE_MIN_LENGTH} characters.`,
      400,
    );
  }
  if (trimmed.length > COMMUNITY_DISCOVERY_OBJECTIVE_MAX_LENGTH) {
    throw new CommunityDiscoveryRequestError(
      "INVALID_OBJECTIVE",
      `Enter an objective of at most ${COMMUNITY_DISCOVERY_OBJECTIVE_MAX_LENGTH} characters.`,
      400,
    );
  }
  return trimmed;
}

/** Facebook Groups discovery query. A search adapter does not add this hint. */
export function buildFacebookGroupsSearchQuery(objective: string): string {
  return `site:facebook.com/groups ${objective}`;
}
