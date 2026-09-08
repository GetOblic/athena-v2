/**
 * Server-only GetOblic WordPress athena/v1 contracts.
 * Never import this module from client components.
 */

export const GETOBLIC_WORDPRESS_DEFAULT_BASE_URL =
  "https://getoblic.com/wp-json/athena/v1" as const;

export const GETOBLIC_WORDPRESS_DEFAULT_TIMEOUT_MS = 12_000;

export type GetOblicWordpressErrorCode =
  | "CONFIG_MISSING"
  | "TIMEOUT"
  | "NETWORK"
  | "UNAUTHORIZED"
  | "NOT_FOUND"
  | "CONFLICT"
  | "VALIDATION"
  | "REMOTE_ERROR"
  | "INVALID_RESPONSE";

export class GetOblicWordpressError extends Error {
  readonly code: GetOblicWordpressErrorCode;
  readonly status: number;
  readonly remoteCode: string | null;

  constructor(
    code: GetOblicWordpressErrorCode,
    message: string,
    status = 502,
    remoteCode: string | null = null,
  ) {
    super(message);
    this.name = "GetOblicWordpressError";
    this.code = code;
    this.status = status;
    this.remoteCode = remoteCode;
  }
}

export type GetOblicWordpressListing = {
  wordpress_listing_id: number;
  status: string | null;
  title: string | null;
  author_id: number | null;
  google_id: string | null;
  google_place_url: string | null;
  knowledge_base: string | null;
};

export type GetOblicWordpressUserResolution = {
  wordpress_user_id: number;
  created: boolean;
};

export type GetOblicWordpressAuthorAssignment = {
  wordpress_listing_id: number;
  wordpress_user_id: number;
  changed: boolean;
};

export type GetOblicWordpressKnowledgeBaseUpdate = {
  wordpress_listing_id: number;
  sha256: string | null;
  changed: boolean;
};

export type GetOblicWordpressSearchRequest = {
  keywords: string;
  listing_type: string;
  page: number;
  per_page: number;
};

export type GetOblicWordpressSearchCategory = {
  term_id: number;
  slug: string;
  name: string;
};

export type GetOblicWordpressSearchHit = {
  wordpress_listing_id: number;
  title: string | null;
  permalink: string | null;
  status: string | null;
  listing_type: string | null;
  category: GetOblicWordpressSearchCategory[];
  location_display: string | null;
  lat: number | null;
  lng: number | null;
  image: string | null;
  google_id: string | null;
  author_id: number | null;
};

export type GetOblicWordpressSearchResponse = {
  query: GetOblicWordpressSearchRequest;
  results: GetOblicWordpressSearchHit[];
  pagination: {
    page: number;
    per_page: number;
    found_posts: number;
    max_num_pages: number;
  };
};
