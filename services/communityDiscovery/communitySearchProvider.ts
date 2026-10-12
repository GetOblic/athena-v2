/**
 * Provider-neutral web search contract for community discovery.
 * Adapters return public hits. They do not decide which hits are communities.
 */

export const COMMUNITY_SEARCH_PROVIDERS = ["brave_search"] as const;

export type CommunitySearchProviderId =
  (typeof COMMUNITY_SEARCH_PROVIDERS)[number];

export type CommunitySearchHit = {
  title: string;
  url: string;
  snippet: string;
};

export type CommunitySearchQuery = {
  query: string;
  limit: number;
  signal: AbortSignal;
};

export interface CommunitySearchProvider {
  readonly providerId: CommunitySearchProviderId;
  search(query: CommunitySearchQuery): Promise<CommunitySearchHit[]>;
}

export type CommunitySearchFailure = "unconfigured" | "timeout" | "unavailable";

export class CommunitySearchError extends Error {
  readonly code: CommunitySearchFailure;

  constructor(code: CommunitySearchFailure) {
    super(`Community search ${code}`);
    this.name = "CommunitySearchError";
    this.code = code;
  }
}
