import {
  COMMUNITY_DISCOVERY_SEARCH_LIMIT,
  COMMUNITY_SEARCH_QUERY_MAX_LENGTH,
} from "@/services/communityDiscovery/communityDiscoveryLimits";
import {
  CommunitySearchError,
  type CommunitySearchHit,
  type CommunitySearchProvider,
  type CommunitySearchQuery,
} from "@/services/communityDiscovery/communitySearchProvider";
import { boundCommunityEvidenceSnippet } from "@/services/communityDiscovery/publicCommunityName";

export const BRAVE_SEARCH_API_KEY_ENV = "BRAVE_SEARCH_API_KEY";
export const BRAVE_SEARCH_API_BASE_URL_ENV = "BRAVE_SEARCH_API_BASE_URL";
export const DEFAULT_BRAVE_SEARCH_API_BASE_URL = "https://api.search.brave.com";

const BRAVE_WEB_SEARCH_PATH = "/res/v1/web/search";

export type BraveSearchProviderOptions = {
  apiKey?: string;
  baseUrl?: string;
  fetchImpl?: typeof fetch;
  env?: Record<string, string | undefined>;
};

function readEnv(
  env: Record<string, string | undefined>,
  name: string,
): string {
  return env[name]?.trim() ?? "";
}

function resolveApiKey(options: BraveSearchProviderOptions): string {
  const env = options.env ?? process.env;
  const apiKey = options.apiKey?.trim() || readEnv(env, BRAVE_SEARCH_API_KEY_ENV);
  if (!apiKey || /[\r\n]/.test(apiKey)) {
    throw new CommunitySearchError("unconfigured");
  }
  return apiKey;
}

function resolveBaseUrl(options: BraveSearchProviderOptions): string {
  const env = options.env ?? process.env;
  const raw =
    options.baseUrl?.trim() ||
    readEnv(env, BRAVE_SEARCH_API_BASE_URL_ENV) ||
    DEFAULT_BRAVE_SEARCH_API_BASE_URL;
  const withoutTrailingSlash = raw.replace(/\/+$/, "");

  let url: URL;
  try {
    url = new URL(withoutTrailingSlash);
  } catch {
    throw new CommunitySearchError("unconfigured");
  }

  if (
    url.protocol !== "https:" ||
    url.username ||
    url.password ||
    url.search ||
    url.hash ||
    url.pathname !== "/"
  ) {
    throw new CommunitySearchError("unconfigured");
  }

  return url.origin;
}

function clampSearchLimit(limit: number): number {
  if (!Number.isFinite(limit)) return 1;
  return Math.min(
    COMMUNITY_DISCOVERY_SEARCH_LIMIT,
    Math.max(1, Math.floor(limit)),
  );
}

function isAbortError(error: unknown): boolean {
  return (
    error instanceof Error &&
    (error.name === "AbortError" || error.name === "TimeoutError")
  );
}

function readHits(payload: unknown, limit: number): CommunitySearchHit[] {
  if (!payload || typeof payload !== "object" || !("web" in payload)) return [];
  const web = payload.web;
  if (!web || typeof web !== "object" || !("results" in web)) return [];
  if (!Array.isArray(web.results)) return [];

  const hits: CommunitySearchHit[] = [];
  for (const result of web.results) {
    if (hits.length >= limit) break;
    if (!result || typeof result !== "object") continue;
    const title = "title" in result && typeof result.title === "string" ? result.title : "";
    const url = "url" in result && typeof result.url === "string" ? result.url.trim() : "";
    const description =
      "description" in result && typeof result.description === "string"
        ? result.description
        : "";
    if (!url || url.length > 2000) continue;
    hits.push({
      title,
      url,
      snippet: boundCommunityEvidenceSnippet(description),
    });
  }
  return hits;
}

/**
 * Configurable Brave Web Search adapter.
 * Credentials stay on the server. The adapter does not filter community URLs.
 */
export function createBraveCommunitySearchProvider(
  options: BraveSearchProviderOptions = {},
): CommunitySearchProvider {
  return {
    providerId: "brave_search",
    async search(query: CommunitySearchQuery): Promise<CommunitySearchHit[]> {
      const trimmedQuery = query.query.trim();
      if (
        !trimmedQuery ||
        trimmedQuery.length > COMMUNITY_SEARCH_QUERY_MAX_LENGTH ||
        /[\u0000-\u001F\u007F]/.test(trimmedQuery)
      ) {
        throw new CommunitySearchError("unavailable");
      }

      const apiKey = resolveApiKey(options);
      const limit = clampSearchLimit(query.limit);
      const endpoint = new URL(BRAVE_WEB_SEARCH_PATH, `${resolveBaseUrl(options)}/`);
      endpoint.searchParams.set("q", trimmedQuery);
      endpoint.searchParams.set("count", String(limit));
      endpoint.searchParams.set("result_filter", "web");

      const fetchImpl = options.fetchImpl ?? fetch;
      let response: Response;
      try {
        response = await fetchImpl(endpoint, {
          method: "GET",
          signal: query.signal,
          headers: {
            Accept: "application/json",
            "X-Subscription-Token": apiKey,
          },
        });
      } catch (error) {
        if (isAbortError(error) || query.signal.aborted) {
          throw new CommunitySearchError("timeout");
        }
        throw new CommunitySearchError("unavailable");
      }

      if (!response.ok) {
        throw new CommunitySearchError("unavailable");
      }

      try {
        return readHits(await response.json(), limit);
      } catch (error) {
        if (isAbortError(error) || query.signal.aborted) {
          throw new CommunitySearchError("timeout");
        }
        throw new CommunitySearchError("unavailable");
      }
    },
  };
}
