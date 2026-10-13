/**
 * Per-request bounds for community discovery.
 * One search request and one qualification completion. No queue and no retry.
 */

export const COMMUNITY_DISCOVERY_OBJECTIVE_MIN_LENGTH = 3;
export const COMMUNITY_DISCOVERY_OBJECTIVE_MAX_LENGTH = 280;

/** Brave web results requested and accepted from one search. */
export const COMMUNITY_DISCOVERY_SEARCH_LIMIT = 10;
export const COMMUNITY_DISCOVERY_SEARCH_TIMEOUT_MS = 8_000;
export const COMMUNITY_SEARCH_QUERY_MAX_LENGTH = 400;

export const COMMUNITY_DISCOVERY_QUALIFICATION_TIMEOUT_MS = 12_000;
/**
 * One completion covers up to ten results. Each result may include a short
 * relevance explanation, optional engagement guidance, and a pasteable message.
 * 1600 keeps that JSON from being cut off. Still one call, with no reasoning.
 */
export const COMMUNITY_DISCOVERY_QUALIFICATION_MAX_TOKENS = 1600;

export const COMMUNITY_DISCOVERY_EVIDENCE_TITLE_MAX_LENGTH = 300;
export const COMMUNITY_DISCOVERY_EVIDENCE_SNIPPET_MAX_LENGTH = 400;
export const COMMUNITY_DISCOVERY_EXPLANATION_MAX_LENGTH = 400;
export const COMMUNITY_DISCOVERY_EXPLANATION_MIN_LENGTH = 10;

/**
 * Ready-to-paste message returned with qualification. Not stored.
 * The textarea can be edited after it arrives.
 */
export const COMMUNITY_DISCOVERY_SUGGESTION_MIN_LENGTH = 20;
export const COMMUNITY_DISCOVERY_SUGGESTION_MAX_LENGTH = 480;

/** Short engagement note returned with qualification. Not the post, and not stored. */
export const COMMUNITY_DISCOVERY_GUIDANCE_MIN_LENGTH = 10;
export const COMMUNITY_DISCOVERY_GUIDANCE_MAX_LENGTH = 180;

export const PUBLIC_COMMUNITY_DISPLAY_NAME_MAX_LENGTH = 200;
export const ORGANIZATION_COMMUNITY_NOTES_MAX_LENGTH = 2000;
export const ORGANIZATION_COMMUNITY_SAVES_LIST_LIMIT = 100;

/** Route budget: search timeout + qualification timeout + catalog writes. */
export const COMMUNITY_DISCOVERY_ROUTE_MAX_DURATION_SECONDS = 30;
