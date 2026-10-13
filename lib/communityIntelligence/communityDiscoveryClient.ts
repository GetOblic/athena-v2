import {
  COMMUNITY_DISCOVERY_EXPLANATION_MAX_LENGTH,
  COMMUNITY_DISCOVERY_GUIDANCE_MAX_LENGTH,
  COMMUNITY_DISCOVERY_GUIDANCE_MIN_LENGTH,
  COMMUNITY_DISCOVERY_ROUTE_MAX_DURATION_SECONDS,
  COMMUNITY_DISCOVERY_SUGGESTION_MAX_LENGTH,
  COMMUNITY_DISCOVERY_SUGGESTION_MIN_LENGTH,
  ORGANIZATION_COMMUNITY_NOTES_MAX_LENGTH,
  PUBLIC_COMMUNITY_DISPLAY_NAME_MAX_LENGTH,
} from "@/services/communityDiscovery/communityDiscoveryLimits";
import { specificFacebookGroupEvidenceSnippet } from "@/services/communityDiscovery/publicCommunityName";
import { normalizeSocialCommunityUrl } from "@/services/communityDiscovery/socialCommunityRegistry";

/**
 * Client budget slightly above the accepted route maxDuration so a hung
 * request cannot leave the workspace spinning.
 */
export const COMMUNITY_DISCOVERY_CLIENT_TIMEOUT_MS =
  (COMMUNITY_DISCOVERY_ROUTE_MAX_DURATION_SECONDS + 5) * 1000;

const CONTROL_CHARACTER = /[\u0000-\u001F\u007F]/;

export const COMMUNITY_DISCOVERY_UI_ERRORS = [
  "invalidObjective",
  "providerUnconfigured",
  "providerTimeout",
  "providerUnavailable",
  "discoveryFailed",
  "persistenceUnavailable",
  "unauthorized",
  "forbidden",
  "unexpected",
  "notInCatalog",
  "communitySuppressed",
  "invalidCommunityUrl",
  "saveFailed",
  "savesFailed",
  "continuationBusy",
  "continuationRejected",
] as const;

export type CommunityDiscoveryUiError =
  (typeof COMMUNITY_DISCOVERY_UI_ERRORS)[number];

export type CommunityDiscoveryCard = {
  canonicalUrl: string;
  displayName: string;
  explanation: string | null;
  engagementGuidance: string | null;
  suggestedContribution: string | null;
  readyToPasteUnavailable: boolean;
  qualificationUnavailable: boolean;
  /** The batch succeeded and a contribution remains, but the explanation was rejected. */
  relevanceNoteUnavailable: boolean;
  listingSnippet: string | null;
};

export type CommunityDiscoveryContinuation = {
  moreAvailable: boolean;
  exhausted: boolean;
  token: string | null;
  sessionToken: string | null;
};

export type SavedCommunityCard = {
  id: string;
  canonicalUrl: string;
  displayName: string;
  qualification: "relevant" | "not_relevant";
  notes: string | null;
};

export type CommunityDiscoveryView = {
  cards: CommunityDiscoveryCard[];
  qualificationUnavailable: boolean;
  continuation: CommunityDiscoveryContinuation;
  recovery: "active" | "lost" | null;
};

const SESSION_STORAGE_KEY = "athena.communityDiscovery.session";

const IDLE_CONTINUATION: CommunityDiscoveryContinuation = {
  moreAvailable: false,
  exhausted: false,
  token: null,
  sessionToken: null,
};

const DISCOVERY_ERROR_CODES: Record<string, CommunityDiscoveryUiError> = {
  INVALID_OBJECTIVE: "invalidObjective",
  PROVIDER_UNCONFIGURED: "providerUnconfigured",
  PROVIDER_TIMEOUT: "providerTimeout",
  PROVIDER_UNAVAILABLE: "providerUnavailable",
  DISCOVERY_FAILED: "discoveryFailed",
  PERSISTENCE_UNAVAILABLE: "persistenceUnavailable",
  UNAUTHORIZED: "unauthorized",
  FORBIDDEN: "forbidden",
};

const SAVE_ERROR_CODES: Record<string, CommunityDiscoveryUiError> = {
  COMMUNITY_NOT_IN_CATALOG: "notInCatalog",
  COMMUNITY_SUPPRESSED: "communitySuppressed",
  SAVE_FAILED: "saveFailed",
  SAVES_FAILED: "savesFailed",
  INVALID_COMMUNITY_URL: "invalidCommunityUrl",
  CONTINUATION_IN_FLIGHT: "continuationBusy",
  INVALID_CONTINUATION: "continuationRejected",
  INVALID_QUALIFICATION: "saveFailed",
  INVALID_NOTES: "saveFailed",
  INVALID_SAVE: "saveFailed",
  UNAUTHORIZED: "unauthorized",
  FORBIDDEN: "forbidden",
};

function boundedPlainText(value: unknown, maxLength: number): string | null {
  if (typeof value !== "string") return null;
  const trimmed = value.trim();
  if (!trimmed || trimmed.length > maxLength || CONTROL_CHARACTER.test(trimmed)) {
    return null;
  }
  return trimmed;
}

function errorCode(
  payload: unknown,
  codes: Record<string, CommunityDiscoveryUiError>,
): CommunityDiscoveryUiError {
  if (!payload || typeof payload !== "object" || Array.isArray(payload)) {
    return "unexpected";
  }
  const error = (payload as { error?: unknown }).error;
  if (!error || typeof error !== "object" || Array.isArray(error)) {
    return "unexpected";
  }
  const code = (error as { code?: unknown }).code;
  if (typeof code !== "string") return "unexpected";
  return codes[code] ?? "unexpected";
}

function boundedSuggestion(value: unknown): string | null {
  const text = boundedPlainText(value, COMMUNITY_DISCOVERY_SUGGESTION_MAX_LENGTH);
  if (!text || text.length < COMMUNITY_DISCOVERY_SUGGESTION_MIN_LENGTH) return null;
  return text;
}

function boundedGuidance(value: unknown): string | null {
  const text = boundedPlainText(value, COMMUNITY_DISCOVERY_GUIDANCE_MAX_LENGTH);
  if (!text || text.length < COMMUNITY_DISCOVERY_GUIDANCE_MIN_LENGTH) return null;
  return text;
}

export function canonicalManualFacebookGroupUrl(input: string): string | null {
  return canonicalFacebookGroup(input);
}

function canonicalFacebookGroup(value: unknown): string | null {
  if (typeof value !== "string") return null;
  const normalized = normalizeSocialCommunityUrl(value);
  if (!normalized.ok || normalized.community.platform !== "facebook_groups") {
    return null;
  }
  return normalized.community.canonicalUrl;
}

function discoveryCard(value: unknown): CommunityDiscoveryCard | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  const record = value as Record<string, unknown>;
  if (record.platform !== "facebook_groups") return null;
  const canonicalUrl = canonicalFacebookGroup(record.canonicalUrl);
  const displayName = boundedPlainText(
    record.displayName,
    PUBLIC_COMMUNITY_DISPLAY_NAME_MAX_LENGTH,
  );
  if (!canonicalUrl || !displayName) return null;

  const qualification = record.qualification;
  let explanation: string | null = null;
  let engagementGuidance: string | null = null;
  let suggestedContribution: string | null = null;
  let readyToPasteUnavailable = false;
  if (
    qualification &&
    typeof qualification === "object" &&
    !Array.isArray(qualification) &&
    (qualification as { status?: unknown }).status === "available"
  ) {
    const available = qualification as {
      explanation?: unknown;
      engagementGuidance?: unknown;
      suggestedContribution?: unknown;
      readyToPasteUnavailable?: unknown;
    };
    explanation = boundedPlainText(
      available.explanation,
      COMMUNITY_DISCOVERY_EXPLANATION_MAX_LENGTH,
    );
    engagementGuidance = boundedGuidance(available.engagementGuidance);
    suggestedContribution = boundedSuggestion(available.suggestedContribution);
    readyToPasteUnavailable =
      suggestedContribution === null && available.readyToPasteUnavailable === true;
  }

  const relevanceNoteUnavailable =
    explanation === null && suggestedContribution !== null;

  let listingSnippet: string | null = null;
  const evidence = record.evidence;
  if (evidence && typeof evidence === "object" && !Array.isArray(evidence)) {
    const snippet = (evidence as { snippet?: unknown }).snippet;
    const specific = specificFacebookGroupEvidenceSnippet(
      typeof snippet === "string" ? snippet : "",
      displayName,
    );
    listingSnippet = specific || null;
  }

  return {
    canonicalUrl,
    displayName,
    explanation,
    engagementGuidance,
    suggestedContribution,
    readyToPasteUnavailable,
    qualificationUnavailable: explanation === null && !relevanceNoteUnavailable,
    relevanceNoteUnavailable,
    listingSnippet,
  };
}

function opaqueToken(value: unknown): string | null {
  if (typeof value !== "string" || !/^[A-Za-z0-9_-]{20,128}$/.test(value)) return null;
  return value;
}

function parseContinuation(discovery: object): CommunityDiscoveryContinuation {
  const value = (discovery as { continuation?: unknown }).continuation;
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return IDLE_CONTINUATION;
  }
  const record = value as Record<string, unknown>;
  const token = opaqueToken(record.token);
  return {
    moreAvailable: record.moreAvailable === true && token !== null,
    exhausted: record.exhausted === true,
    token,
    sessionToken: opaqueToken(record.sessionToken),
  };
}

function parseRecovery(discovery: object): "active" | "lost" | null {
  const value = (discovery as { recovery?: unknown }).recovery;
  if (value === "active" || value === "lost") return value;
  return null;
}

export function appendCommunityDiscoveryCards(
  current: readonly CommunityDiscoveryCard[],
  incoming: readonly CommunityDiscoveryCard[],
): CommunityDiscoveryCard[] {
  const seen = new Set(current.map((card) => card.canonicalUrl));
  const next = [...current];
  for (const card of incoming) {
    if (seen.has(card.canonicalUrl)) continue;
    seen.add(card.canonicalUrl);
    next.push(card);
  }
  return next;
}

/** A refresh without a session receipt must not start a search. */
export function communityDiscoveryRefreshPlan(
  sessionToken: string | null,
): "idle" | "restore" {
  return sessionToken ? "restore" : "idle";
}

export function readCommunityDiscoverySessionToken(): string | null {
  if (typeof sessionStorage === "undefined") return null;
  try {
    return opaqueToken(sessionStorage.getItem(SESSION_STORAGE_KEY));
  } catch {
    return null;
  }
}

export function writeCommunityDiscoverySessionToken(token: string | null): void {
  if (typeof sessionStorage === "undefined") return;
  try {
    if (!token) sessionStorage.removeItem(SESSION_STORAGE_KEY);
    else sessionStorage.setItem(SESSION_STORAGE_KEY, token);
  } catch {
    // A private browser may reject storage. The in-memory results still work.
  }
}

export function parseCommunityDiscoveryPayload(
  payload: unknown,
):
  | { ok: true; discovery: CommunityDiscoveryView }
  | { ok: false; error: CommunityDiscoveryUiError } {
  if (!payload || typeof payload !== "object" || Array.isArray(payload)) {
    return { ok: false, error: "unexpected" };
  }
  const record = payload as { ok?: unknown; discovery?: unknown };
  if (record.ok !== true) {
    return { ok: false, error: errorCode(payload, DISCOVERY_ERROR_CODES) };
  }
  if (
    !record.discovery ||
    typeof record.discovery !== "object" ||
    Array.isArray(record.discovery)
  ) {
    return { ok: false, error: "unexpected" };
  }
  const discovery = record.discovery as {
    qualification?: unknown;
    results?: unknown;
  };
  if (!Array.isArray(discovery.results)) {
    return { ok: false, error: "unexpected" };
  }

  const qualification = discovery.qualification;
  const qualificationUnavailable =
    !qualification ||
    typeof qualification !== "object" ||
    Array.isArray(qualification) ||
    (qualification as { status?: unknown }).status !== "available";

  return {
    ok: true,
    discovery: {
      cards: discovery.results.flatMap((result) => {
        const card = discoveryCard(result);
        return card ? [card] : [];
      }),
      qualificationUnavailable:
        qualificationUnavailable &&
        !(
          qualification &&
          typeof qualification === "object" &&
          !Array.isArray(qualification) &&
          (qualification as { reason?: unknown }).reason === "not_needed"
        ),
      continuation: parseContinuation(discovery),
      recovery: parseRecovery(discovery),
    },
  };
}

function savedCard(value: unknown): SavedCommunityCard | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  const record = value as Record<string, unknown>;
  if (record.platform !== "facebook_groups") return null;
  const id = boundedPlainText(record.id, 80);
  const canonicalUrl = canonicalFacebookGroup(record.canonicalUrl);
  const displayName = boundedPlainText(
    record.displayName,
    PUBLIC_COMMUNITY_DISPLAY_NAME_MAX_LENGTH,
  );
  if (!id || !canonicalUrl || !displayName) return null;
  if (record.qualification !== "relevant" && record.qualification !== "not_relevant") {
    return null;
  }
  let notes: string | null = null;
  if (record.notes !== null && record.notes !== undefined) {
    notes = boundedPlainText(record.notes, ORGANIZATION_COMMUNITY_NOTES_MAX_LENGTH);
    if (!notes) return null;
  }
  return {
    id,
    canonicalUrl,
    displayName,
    qualification: record.qualification,
    notes,
  };
}

export function parseSavedCommunitiesPayload(
  payload: unknown,
):
  | { ok: true; saves: SavedCommunityCard[] }
  | { ok: false; error: CommunityDiscoveryUiError } {
  if (!payload || typeof payload !== "object" || Array.isArray(payload)) {
    return { ok: false, error: "unexpected" };
  }
  const record = payload as { ok?: unknown; saves?: unknown };
  if (record.ok !== true) {
    return { ok: false, error: errorCode(payload, SAVE_ERROR_CODES) };
  }
  if (!Array.isArray(record.saves)) return { ok: false, error: "unexpected" };
  return {
    ok: true,
    saves: record.saves.flatMap((save) => {
      const card = savedCard(save);
      return card ? [card] : [];
    }),
  };
}

export function parseSaveCommunityPayload(
  payload: unknown,
):
  | { ok: true; save: SavedCommunityCard }
  | { ok: false; error: CommunityDiscoveryUiError } {
  if (!payload || typeof payload !== "object" || Array.isArray(payload)) {
    return { ok: false, error: "unexpected" };
  }
  const record = payload as { ok?: unknown; save?: unknown };
  if (record.ok !== true) {
    return { ok: false, error: errorCode(payload, SAVE_ERROR_CODES) };
  }
  const save = savedCard(record.save);
  if (!save) return { ok: false, error: "unexpected" };
  return { ok: true, save };
}

async function readJson(response: Response): Promise<unknown> {
  try {
    return await response.json();
  } catch {
    return null;
  }
}

async function postCommunityDiscovery(
  body: Record<string, unknown>,
  signal?: AbortSignal,
): Promise<
  | { ok: true; discovery: CommunityDiscoveryView }
  | { ok: false; error: CommunityDiscoveryUiError }
> {
  try {
    const response = await fetch("/api/community-discovery", {
      method: "POST",
      headers: {
        Accept: "application/json",
        "Content-Type": "application/json",
      },
      body: JSON.stringify(body),
      cache: "no-store",
      signal,
    });
    return parseCommunityDiscoveryPayload(await readJson(response));
  } catch (error) {
    if (error instanceof Error && error.name === "AbortError") {
      return { ok: false, error: "providerTimeout" };
    }
    return { ok: false, error: "discoveryFailed" };
  }
}

export async function requestCommunityDiscovery(
  objective: string,
  signal: AbortSignal,
): Promise<
  | { ok: true; discovery: CommunityDiscoveryView }
  | { ok: false; error: CommunityDiscoveryUiError }
> {
  return postCommunityDiscovery({ objective }, signal);
}

export async function requestMoreCommunities(
  objective: string,
  continuationToken: string,
  signal: AbortSignal,
): Promise<
  | { ok: true; discovery: CommunityDiscoveryView }
  | { ok: false; error: CommunityDiscoveryUiError }
> {
  return postCommunityDiscovery({ objective, continuationToken }, signal);
}

export async function restoreCommunityDiscovery(
  sessionToken: string,
  signal?: AbortSignal,
): Promise<
  | { ok: true; discovery: CommunityDiscoveryView }
  | { ok: false; error: CommunityDiscoveryUiError }
> {
  return postCommunityDiscovery({ restore: true, sessionToken }, signal);
}

export async function requestSavedCommunities(
  signal?: AbortSignal,
): Promise<
  | { ok: true; saves: SavedCommunityCard[] }
  | { ok: false; error: CommunityDiscoveryUiError }
> {
  try {
    const response = await fetch("/api/community-discovery/saves", {
      method: "GET",
      headers: { Accept: "application/json" },
      cache: "no-store",
      signal,
    });
    return parseSavedCommunitiesPayload(await readJson(response));
  } catch {
    return { ok: false, error: "savesFailed" };
  }
}

export async function requestSaveCommunity(
  canonicalUrl: string,
  signal?: AbortSignal,
): Promise<
  | { ok: true; save: SavedCommunityCard }
  | { ok: false; error: CommunityDiscoveryUiError }
> {
  try {
    const response = await fetch("/api/community-discovery/saves", {
      method: "POST",
      headers: {
        Accept: "application/json",
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        canonicalUrl,
        qualification: "relevant",
      }),
      cache: "no-store",
      signal,
    });
    return parseSaveCommunityPayload(await readJson(response));
  } catch {
    return { ok: false, error: "saveFailed" };
  }
}
