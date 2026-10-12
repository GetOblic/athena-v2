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
export const COMMUNITY_DISCOVERY_QUALIFICATION_MAX_TOKENS = 800;

export const COMMUNITY_DISCOVERY_EVIDENCE_TITLE_MAX_LENGTH = 300;
export const COMMUNITY_DISCOVERY_EVIDENCE_SNIPPET_MAX_LENGTH = 400;
export const COMMUNITY_DISCOVERY_EXPLANATION_MAX_LENGTH = 400;
export const COMMUNITY_DISCOVERY_EXPLANATION_MIN_LENGTH = 10;

/** One short sentence returned with qualification. Not stored. */
export const COMMUNITY_DISCOVERY_SUGGESTION_MIN_LENGTH = 10;
export const COMMUNITY_DISCOVERY_SUGGESTION_MAX_LENGTH = 240;

export const PUBLIC_COMMUNITY_DISPLAY_NAME_MAX_LENGTH = 200;
export const ORGANIZATION_COMMUNITY_NOTES_MAX_LENGTH = 2000;
export const ORGANIZATION_COMMUNITY_SAVES_LIST_LIMIT = 100;

/** Route budget: search timeout + qualification timeout + catalog writes. */
export const COMMUNITY_DISCOVERY_ROUTE_MAX_DURATION_SECONDS = 30;
