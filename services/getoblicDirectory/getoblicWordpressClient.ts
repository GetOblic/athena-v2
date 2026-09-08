/**
 * Server-only GetOblic WordPress athena/v1 client.
 * Reads ATHENA_V2_DIRECTORY_* secrets — never import this module from client
 * components. The API key must never be logged, returned, or embedded in errors.
 */

import {
  GETOBLIC_WORDPRESS_DEFAULT_BASE_URL,
  GETOBLIC_WORDPRESS_DEFAULT_TIMEOUT_MS,
  GetOblicWordpressError,
  type GetOblicWordpressAuthorAssignment,
  type GetOblicWordpressErrorCode,
  type GetOblicWordpressKnowledgeBaseUpdate,
  type GetOblicWordpressListing,
  type GetOblicWordpressSearchCategory,
  type GetOblicWordpressSearchHit,
  type GetOblicWordpressSearchRequest,
  type GetOblicWordpressSearchResponse,
  type GetOblicWordpressTaxonomyTerm,
  type GetOblicWordpressUserResolution,
  type GetOblicWordpressWorkHours,
} from "@/services/getoblicDirectory/getoblicWordpressTypes";
import {
  GETOBLIC_DIRECTORY_SEARCH_DEFAULT_LISTING_TYPE,
  GETOBLIC_DIRECTORY_SEARCH_DEFAULT_PAGE,
  GETOBLIC_DIRECTORY_SEARCH_DEFAULT_PER_PAGE,
  GETOBLIC_DIRECTORY_SEARCH_KEYWORDS_MAX,
  GETOBLIC_DIRECTORY_SEARCH_MAX_PER_PAGE,
  GETOBLIC_DIRECTORY_SEARCH_MIN_PER_PAGE,
} from "@/services/getoblicDirectory/getoblicDirectoryTypes";

type WordpressConfig = {
  baseUrl: string;
  apiKey: string;
  timeoutMs: number;
};

function readBaseUrl(): string {
  const baseUrl = (
    process.env.ATHENA_V2_DIRECTORY_BASE_URL?.trim() ||
    GETOBLIC_WORDPRESS_DEFAULT_BASE_URL
  ).replace(/\/+$/, "");

  if (!/^https?:\/\//i.test(baseUrl)) {
    throw new GetOblicWordpressError(
      "CONFIG_MISSING",
      "ATHENA_V2_DIRECTORY_BASE_URL must be an http(s) URL.",
      503,
    );
  }

  return baseUrl;
}

function readConfig(): WordpressConfig {
  const baseUrl = readBaseUrl();
  const apiKey = process.env.ATHENA_V2_DIRECTORY_API_KEY?.trim() ?? "";

  if (!apiKey) {
    throw new GetOblicWordpressError(
      "CONFIG_MISSING",
      "GetOblic Directory is not configured on this Athena instance.",
      503,
    );
  }

  return {
    baseUrl,
    apiKey,
    timeoutMs: GETOBLIC_WORDPRESS_DEFAULT_TIMEOUT_MS,
  };
}

function wordpressUrl(baseUrl: string, path: string): string {
  const normalizedBase = baseUrl.replace(/\/+$/, "");
  const normalizedPath = path.startsWith("/") ? path : `/${path}`;
  return `${normalizedBase}${normalizedPath}`;
}

function asRecord(value: unknown): Record<string, unknown> | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return null;
  }
  return value as Record<string, unknown>;
}

function readString(
  record: Record<string, unknown>,
  key: string,
): string | null {
  const value = record[key];
  if (typeof value === "string" && value.trim()) {
    return value.trim();
  }
  return null;
}

function readNullableString(
  record: Record<string, unknown>,
  key: string,
): string | null {
  if (!(key in record) || record[key] === null) {
    return null;
  }
  return readString(record, key);
}

function readInteger(
  record: Record<string, unknown>,
  key: string,
): number | null {
  const value = record[key];
  if (typeof value === "number" && Number.isInteger(value)) {
    return value;
  }
  if (typeof value === "string" && /^-?\d+$/.test(value)) {
    return Number(value);
  }
  return null;
}

function readBoolean(
  record: Record<string, unknown>,
  key: string,
): boolean | null {
  const value = record[key];
  return typeof value === "boolean" ? value : null;
}

function extractWordpressErrorMessage(
  payload: unknown,
  fallback: string,
): { message: string; remoteCode: string | null } {
  const record = asRecord(payload);
  if (!record) {
    return { message: fallback, remoteCode: null };
  }

  const remoteCode = readString(record, "code");
  if (typeof record.message === "string" && record.message.trim()) {
    return { message: record.message.trim(), remoteCode };
  }
  if (typeof record.error === "string" && record.error.trim()) {
    return { message: record.error.trim(), remoteCode };
  }
  return { message: fallback, remoteCode };
}

function mapStatusToCode(
  status: number,
  remoteCode: string | null,
): GetOblicWordpressErrorCode {
  if (remoteCode === "LISTING_NOT_FOUND" || status === 404) {
    return "NOT_FOUND";
  }
  if (
    status === 401 ||
    status === 403 ||
    remoteCode === "MISSING_API_KEY" ||
    remoteCode === "INVALID_API_KEY" ||
    remoteCode === "AUTH_NOT_CONFIGURED"
  ) {
    return "UNAUTHORIZED";
  }
  if (status === 409) return "CONFLICT";
  if (status === 400 || status === 422) return "VALIDATION";
  return "REMOTE_ERROR";
}

function parseListing(payload: unknown): GetOblicWordpressListing {
  const root = asRecord(payload);
  if (!root) {
    throw new GetOblicWordpressError(
      "INVALID_RESPONSE",
      "WordPress returned an invalid listing payload.",
      502,
    );
  }

  const source = asRecord(root.listing) ?? root;
  const wordpressListingId = readInteger(source, "wordpress_listing_id");
  if (wordpressListingId == null || wordpressListingId <= 0) {
    throw new GetOblicWordpressError(
      "INVALID_RESPONSE",
      "WordPress listing response is missing wordpress_listing_id.",
      502,
    );
  }

  return {
    wordpress_listing_id: wordpressListingId,
    status: readNullableString(source, "status"),
    title: readNullableString(source, "title"),
    author_id: readInteger(source, "author_id"),
    google_id: readNullableString(source, "google_id"),
    google_place_url: readNullableString(source, "google_place_url"),
    knowledge_base: readNullableString(source, "knowledge_base"),
    phone: readNullableString(source, "phone"),
    whatsapp: readNullableString(source, "whatsapp"),
    address: readNullableString(source, "address"),
    region: parseListingRegion(source.region),
    lat: readNullableNumber(source, "lat"),
    lng: readNullableNumber(source, "lng"),
    timezone: readNullableString(source, "timezone"),
    work_hours: readWorkHours(source.work_hours),
    text_hours: readNullableString(source, "text_hours"),
    tagline: readNullableString(source, "tagline"),
    description: readNullableString(source, "description"),
    cover: readNullableString(source, "cover"),
    gallery: readUrlList(source.gallery),
    image: readNullableString(source, "image"),
    listing_type: readNullableString(source, "listing_type"),
    category: parseListingCategories(source.category),
    tags: parseListingTags(source.tags),
  };
}

function parseUserResolution(payload: unknown): GetOblicWordpressUserResolution {
  const root = asRecord(payload);
  if (!root) {
    throw new GetOblicWordpressError(
      "INVALID_RESPONSE",
      "WordPress returned an invalid user payload.",
      502,
    );
  }

  const wordpressUserId = readInteger(root, "wordpress_user_id");
  const created = readBoolean(root, "created");
  if (wordpressUserId == null || wordpressUserId <= 0 || created == null) {
    throw new GetOblicWordpressError(
      "INVALID_RESPONSE",
      "WordPress user response is missing wordpress_user_id.",
      502,
    );
  }

  return {
    wordpress_user_id: wordpressUserId,
    created,
  };
}

function parseAuthorAssignment(
  payload: unknown,
  fallbackListingId: number,
): GetOblicWordpressAuthorAssignment {
  const root = asRecord(payload);
  if (!root) {
    throw new GetOblicWordpressError(
      "INVALID_RESPONSE",
      "WordPress returned an invalid author payload.",
      502,
    );
  }

  const wordpressUserId = readInteger(root, "wordpress_user_id");
  const changed = readBoolean(root, "changed");
  if (wordpressUserId == null || wordpressUserId <= 0 || changed == null) {
    throw new GetOblicWordpressError(
      "INVALID_RESPONSE",
      "WordPress author response is missing wordpress_user_id.",
      502,
    );
  }

  return {
    wordpress_listing_id:
      readInteger(root, "wordpress_listing_id") ?? fallbackListingId,
    wordpress_user_id: wordpressUserId,
    changed,
  };
}

function readNullableNumber(
  record: Record<string, unknown>,
  key: string,
): number | null {
  if (!(key in record) || record[key] === null) {
    return null;
  }
  const value = record[key];
  if (typeof value === "number" && Number.isFinite(value)) {
    return value;
  }
  if (typeof value === "string" && /^-?\d+(?:\.\d+)?$/.test(value.trim())) {
    return Number(value.trim());
  }
  return null;
}

function parseSearchCategory(
  value: unknown,
): GetOblicWordpressSearchHit["category"][number] | null {
  const record = asRecord(value);
  if (!record) {
    return null;
  }
  const termId = readInteger(record, "term_id");
  const slug = readString(record, "slug");
  const name = readString(record, "name");
  if (termId == null || termId <= 0 || !slug || !name) {
    return null;
  }
  return { term_id: termId, slug, name };
}

const LISTING_GALLERY_MAX = 24;
const LISTING_TAG_MAX = 24;

function parseListingCategories(
  value: unknown,
): GetOblicWordpressSearchCategory[] {
  if (Array.isArray(value)) {
    return value
      .map((entry) => parseSearchCategory(entry))
      .filter((entry): entry is GetOblicWordpressSearchCategory => entry != null);
  }
  if (value != null) {
    const single = parseSearchCategory(value);
    if (single) {
      return [single];
    }
  }
  return [];
}

function parseFlexibleTaxonomyTerm(
  value: unknown,
): GetOblicWordpressTaxonomyTerm | null {
  if (typeof value === "string" && value.trim()) {
    return { term_id: null, slug: null, name: value.trim() };
  }
  const record = asRecord(value);
  if (!record) {
    return null;
  }
  const name = readString(record, "name");
  const slug = readString(record, "slug");
  const termId = readInteger(record, "term_id");
  if (!name && !slug && (termId == null || termId <= 0)) {
    return null;
  }
  return {
    term_id: termId != null && termId > 0 ? termId : null,
    slug,
    name,
  };
}

function parseListingRegion(
  value: unknown,
): GetOblicWordpressTaxonomyTerm | null {
  if (Array.isArray(value)) {
    for (const entry of value) {
      const parsed = parseFlexibleTaxonomyTerm(entry);
      if (parsed) {
        return parsed;
      }
    }
    return null;
  }
  return parseFlexibleTaxonomyTerm(value);
}

function parseListingTags(value: unknown): GetOblicWordpressTaxonomyTerm[] {
  const items = Array.isArray(value) ? value : value != null ? [value] : [];
  const tags: GetOblicWordpressTaxonomyTerm[] = [];
  for (const item of items) {
    const parsed = parseFlexibleTaxonomyTerm(item);
    if (!parsed) {
      continue;
    }
    tags.push(parsed);
    if (tags.length >= LISTING_TAG_MAX) {
      break;
    }
  }
  return tags;
}

function isPlainJsonObjectOrArray(
  value: unknown,
): value is Record<string, unknown> | unknown[] {
  if (Array.isArray(value)) {
    return true;
  }
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

function readWorkHours(value: unknown): GetOblicWordpressWorkHours {
  if (value == null) {
    return null;
  }
  if (typeof value === "string") {
    const trimmed = value.trim();
    if (!trimmed) {
      return null;
    }
    try {
      const parsed: unknown = JSON.parse(trimmed);
      return isPlainJsonObjectOrArray(parsed) ? parsed : null;
    } catch {
      return null;
    }
  }
  if (!isPlainJsonObjectOrArray(value)) {
    return null;
  }
  try {
    return JSON.parse(JSON.stringify(value)) as
      | Record<string, unknown>
      | unknown[];
  } catch {
    return null;
  }
}

function readUrlList(value: unknown): string[] {
  const items = Array.isArray(value)
    ? value
    : typeof value === "string"
      ? value.split(/[,\n]/)
      : [];
  const urls: string[] = [];
  for (const item of items) {
    if (typeof item !== "string") {
      continue;
    }
    const trimmed = item.trim();
    if (!trimmed) {
      continue;
    }
    urls.push(trimmed.slice(0, 500));
    if (urls.length >= LISTING_GALLERY_MAX) {
      break;
    }
  }
  return urls;
}

function parseSearchHit(value: unknown): GetOblicWordpressSearchHit {
  const source = asRecord(value);
  if (!source) {
    throw new GetOblicWordpressError(
      "INVALID_RESPONSE",
      "WordPress returned an invalid search result.",
      502,
    );
  }

  const wordpressListingId = readInteger(source, "wordpress_listing_id");
  if (wordpressListingId == null || wordpressListingId <= 0) {
    throw new GetOblicWordpressError(
      "INVALID_RESPONSE",
      "WordPress search result is missing wordpress_listing_id.",
      502,
    );
  }

  const categoryRaw = source.category;
  let category: GetOblicWordpressSearchHit["category"] = [];
  if (Array.isArray(categoryRaw)) {
    category = categoryRaw
      .map((entry) => parseSearchCategory(entry))
      .filter((entry): entry is NonNullable<typeof entry> => entry != null);
  } else if (categoryRaw != null) {
    const single = parseSearchCategory(categoryRaw);
    if (single) {
      category = [single];
    }
  }

  return {
    wordpress_listing_id: wordpressListingId,
    title: readNullableString(source, "title"),
    permalink: readNullableString(source, "permalink"),
    status: readNullableString(source, "status"),
    listing_type: readNullableString(source, "listing_type"),
    category,
    location_display: readNullableString(source, "location_display"),
    lat: readNullableNumber(source, "lat"),
    lng: readNullableNumber(source, "lng"),
    image: readNullableString(source, "image"),
    google_id: readNullableString(source, "google_id"),
    author_id: readInteger(source, "author_id"),
  };
}

function parseSearchResponse(payload: unknown): GetOblicWordpressSearchResponse {
  const root = asRecord(payload);
  if (!root || root.success !== true) {
    throw new GetOblicWordpressError(
      "INVALID_RESPONSE",
      "WordPress returned an invalid search payload.",
      502,
    );
  }

  const query = asRecord(root.query);
  const pagination = asRecord(root.pagination);
  const resultsRaw = root.results;
  if (!query || !pagination || !Array.isArray(resultsRaw)) {
    throw new GetOblicWordpressError(
      "INVALID_RESPONSE",
      "WordPress search response is missing query, results, or pagination.",
      502,
    );
  }

  const keywords = readString(query, "keywords");
  const listingType = readString(query, "listing_type");
  const page = readInteger(query, "page");
  const perPage = readInteger(query, "per_page");
  const foundPosts = readInteger(pagination, "found_posts");
  const maxNumPages = readInteger(pagination, "max_num_pages");
  if (
    !keywords ||
    !listingType ||
    page == null ||
    page < 0 ||
    perPage == null ||
    perPage < 1 ||
    foundPosts == null ||
    foundPosts < 0 ||
    maxNumPages == null ||
    maxNumPages < 0
  ) {
    throw new GetOblicWordpressError(
      "INVALID_RESPONSE",
      "WordPress search response is missing pagination fields.",
      502,
    );
  }

  return {
    query: {
      keywords,
      listing_type: listingType,
      page,
      per_page: perPage,
    },
    results: resultsRaw.map((entry) => parseSearchHit(entry)),
    pagination: {
      page: readInteger(pagination, "page") ?? page,
      per_page: readInteger(pagination, "per_page") ?? perPage,
      found_posts: foundPosts,
      max_num_pages: maxNumPages,
    },
  };
}

export function normalizeGetOblicWordpressSearchRequest(input: {
  keywords: unknown;
  listing_type?: unknown;
  page?: unknown;
  per_page?: unknown;
}): GetOblicWordpressSearchRequest {
  if (input.keywords != null && typeof input.keywords === "object") {
    throw new GetOblicWordpressError(
      "VALIDATION",
      "keywords must be a string.",
      400,
      "KEYWORDS_INVALID",
    );
  }
  if (
    typeof input.keywords !== "string" &&
    typeof input.keywords !== "number"
  ) {
    throw new GetOblicWordpressError(
      "VALIDATION",
      "keywords is required.",
      400,
      "KEYWORDS_REQUIRED",
    );
  }

  const keywords = String(input.keywords).trim();
  if (!keywords) {
    throw new GetOblicWordpressError(
      "VALIDATION",
      "keywords is required.",
      400,
      "KEYWORDS_REQUIRED",
    );
  }
  if (keywords.length > GETOBLIC_DIRECTORY_SEARCH_KEYWORDS_MAX) {
    throw new GetOblicWordpressError(
      "VALIDATION",
      "keywords exceeds the maximum length.",
      400,
      "KEYWORDS_TOO_LONG",
    );
  }

  let listingType: string = GETOBLIC_DIRECTORY_SEARCH_DEFAULT_LISTING_TYPE;
  if (input.listing_type != null && input.listing_type !== "") {
    if (typeof input.listing_type !== "string") {
      throw new GetOblicWordpressError(
        "VALIDATION",
        "listing_type is invalid.",
        400,
        "INVALID_LISTING_TYPE",
      );
    }
    const normalized = input.listing_type.trim();
    if (!/^[a-z0-9][a-z0-9_-]{0,199}$/.test(normalized)) {
      throw new GetOblicWordpressError(
        "VALIDATION",
        "listing_type is invalid.",
        400,
        "INVALID_LISTING_TYPE",
      );
    }
    listingType = normalized;
  }

  const page = parseBoundedInteger(
    input.page,
    GETOBLIC_DIRECTORY_SEARCH_DEFAULT_PAGE,
    0,
    Number.MAX_SAFE_INTEGER,
    "page must be an integer greater than or equal to 0.",
    "INVALID_PAGE",
  );
  const perPage = parseBoundedInteger(
    input.per_page,
    GETOBLIC_DIRECTORY_SEARCH_DEFAULT_PER_PAGE,
    GETOBLIC_DIRECTORY_SEARCH_MIN_PER_PAGE,
    GETOBLIC_DIRECTORY_SEARCH_MAX_PER_PAGE,
    "per_page must be an integer between 1 and 20.",
    "INVALID_PER_PAGE",
  );

  return {
    keywords,
    listing_type: listingType,
    page,
    per_page: perPage,
  };
}

function parseBoundedInteger(
  value: unknown,
  fallback: number,
  min: number,
  max: number,
  message: string,
  remoteCode: string,
): number {
  if (value == null || value === "") {
    return fallback;
  }
  if (typeof value === "object" || typeof value === "boolean") {
    throw new GetOblicWordpressError("VALIDATION", message, 400, remoteCode);
  }
  if (typeof value === "number" && Number.isInteger(value)) {
    if (value < min || value > max) {
      throw new GetOblicWordpressError("VALIDATION", message, 400, remoteCode);
    }
    return value;
  }
  if (typeof value === "string" && /^(?:0|[1-9][0-9]*)$/.test(value.trim())) {
    const parsed = Number(value.trim());
    if (parsed < min || parsed > max) {
      throw new GetOblicWordpressError("VALIDATION", message, 400, remoteCode);
    }
    return parsed;
  }
  throw new GetOblicWordpressError("VALIDATION", message, 400, remoteCode);
}

function parseKnowledgeBaseUpdate(
  payload: unknown,
  fallbackListingId: number,
): GetOblicWordpressKnowledgeBaseUpdate {
  const root = asRecord(payload);
  if (!root) {
    throw new GetOblicWordpressError(
      "INVALID_RESPONSE",
      "WordPress returned an invalid knowledge-base payload.",
      502,
    );
  }

  const changed = readBoolean(root, "changed");
  if (changed == null) {
    throw new GetOblicWordpressError(
      "INVALID_RESPONSE",
      "WordPress knowledge-base response is missing changed.",
      502,
    );
  }

  return {
    wordpress_listing_id:
      readInteger(root, "wordpress_listing_id") ?? fallbackListingId,
    sha256: readNullableString(root, "sha256"),
    changed,
  };
}

async function wordpressFetch(
  path: string,
  init: {
    method: string;
    body?: unknown;
  },
): Promise<{ status: number; payload: unknown }> {
  const config = readConfig();
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), config.timeoutMs);

  try {
    const headers: Record<string, string> = {
      Accept: "application/json",
      "x-api-key": config.apiKey,
    };
    if (init.body !== undefined) {
      headers["Content-Type"] = "application/json";
    }

    const response = await fetch(wordpressUrl(config.baseUrl, path), {
      method: init.method,
      headers,
      body: init.body === undefined ? undefined : JSON.stringify(init.body),
      cache: "no-store",
      redirect: "manual",
      signal: controller.signal,
    });

    const text = await response.text().catch(() => "");
    let payload: unknown = null;
    if (text.trim()) {
      try {
        payload = JSON.parse(text) as unknown;
      } catch {
        throw new GetOblicWordpressError(
          "INVALID_RESPONSE",
          "WordPress returned a non-JSON response.",
          502,
        );
      }
    }

    if (!response.ok) {
      const extracted = extractWordpressErrorMessage(
        payload,
        `GetOblic Directory request failed (${response.status}).`,
      );
      throw new GetOblicWordpressError(
        mapStatusToCode(response.status, extracted.remoteCode),
        extracted.message,
        response.status >= 400 && response.status < 600 ? response.status : 502,
        extracted.remoteCode,
      );
    }

    return { status: response.status, payload };
  } catch (error) {
    if (error instanceof GetOblicWordpressError) {
      throw error;
    }
    if (
      error instanceof Error &&
      (error.name === "AbortError" || /aborted/i.test(error.message))
    ) {
      throw new GetOblicWordpressError(
        "TIMEOUT",
        "GetOblic Directory request timed out.",
        504,
      );
    }
    throw new GetOblicWordpressError(
      "NETWORK",
      "GetOblic Directory is unavailable.",
      502,
    );
  } finally {
    clearTimeout(timer);
  }
}

export function parseGetOblicWordpressListingId(value: unknown): number {
  if (typeof value === "number" && Number.isInteger(value) && value > 0) {
    return value;
  }
  if (typeof value === "string" && /^[1-9][0-9]*$/.test(value.trim())) {
    return Number(value.trim());
  }
  throw new GetOblicWordpressError(
    "VALIDATION",
    "wordpress_listing_id must be a positive integer.",
    400,
  );
}

export async function resolveOrCreateWordpressUser(
  email: string,
): Promise<GetOblicWordpressUserResolution> {
  const normalized = email.trim();
  if (!normalized) {
    throw new GetOblicWordpressError(
      "VALIDATION",
      "email is required.",
      400,
    );
  }

  const { payload } = await wordpressFetch("/users/resolve-or-create", {
    method: "POST",
    body: { email: normalized },
  });
  return parseUserResolution(payload);
}

export async function getWordpressListingById(
  wordpressListingId: number,
): Promise<GetOblicWordpressListing> {
  const id = parseGetOblicWordpressListingId(wordpressListingId);
  const { payload } = await wordpressFetch(`/listings/${id}`, {
    method: "GET",
  });
  return parseListing(payload);
}

export async function getWordpressListingsByGoogleId(
  googleId: string,
): Promise<GetOblicWordpressListing[]> {
  const normalized = googleId.trim();
  if (!normalized) {
    throw new GetOblicWordpressError(
      "VALIDATION",
      "google_id is required.",
      400,
    );
  }

  const { payload } = await wordpressFetch(
    `/listings?google_id=${encodeURIComponent(normalized)}`,
    { method: "GET" },
  );

  const root = asRecord(payload);
  const matches = root && Array.isArray(root.matches) ? root.matches : null;
  if (!matches) {
    throw new GetOblicWordpressError(
      "INVALID_RESPONSE",
      "WordPress google_id response is missing matches.",
      502,
    );
  }

  return matches.map((entry) => parseListing(entry));
}

export async function assignWordpressListingAuthor(
  wordpressListingId: number,
  wordpressUserId: number,
): Promise<GetOblicWordpressAuthorAssignment> {
  const id = parseGetOblicWordpressListingId(wordpressListingId);
  if (!Number.isInteger(wordpressUserId) || wordpressUserId <= 0) {
    throw new GetOblicWordpressError(
      "VALIDATION",
      "wordpress_user_id must be a positive integer.",
      400,
    );
  }

  const { payload } = await wordpressFetch(`/listings/${id}/author`, {
    method: "POST",
    body: { wordpress_user_id: wordpressUserId },
  });
  return parseAuthorAssignment(payload, id);
}

export async function putWordpressListingKnowledgeBase(
  wordpressListingId: number,
  knowledgeBase: string,
): Promise<GetOblicWordpressKnowledgeBaseUpdate> {
  const id = parseGetOblicWordpressListingId(wordpressListingId);
  if (typeof knowledgeBase !== "string") {
    throw new GetOblicWordpressError(
      "VALIDATION",
      "knowledge_base must be a string.",
      400,
    );
  }

  const { payload } = await wordpressFetch(`/listings/${id}/knowledge-base`, {
    method: "PUT",
    body: { knowledge_base: knowledgeBase },
  });
  return parseKnowledgeBaseUpdate(payload, id);
}

export async function searchWordpressListings(
  input: GetOblicWordpressSearchRequest,
): Promise<GetOblicWordpressSearchResponse> {
  const request = normalizeGetOblicWordpressSearchRequest(input);
  const params = new URLSearchParams({
    keywords: request.keywords,
    listing_type: request.listing_type,
    page: String(request.page),
    per_page: String(request.per_page),
  });
  const { payload } = await wordpressFetch(
    `/listings/search?${params.toString()}`,
    { method: "GET" },
  );
  return parseSearchResponse(payload);
}
