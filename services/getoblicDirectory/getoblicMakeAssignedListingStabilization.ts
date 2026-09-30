/**
 * Bounded reads for a Google/Make mapped-author listing while WordPress
 * settles. This module does not call Make, does not POST /author, and does
 * not wrap wordpressFetch.
 *
 * The two phases do not share one budget and do not call each other:
 *
 * 1. waitForMakeAssignedListingToStabilize — post-Make identity convergence.
 *    NOT_FOUND, a temporary author, a blank Google ID, and transient
 *    transport failures are retried once. Each attempt uses a shorter
 *    client timeout than the global WordPress timeout. A conflicting
 *    non-empty Google ID is not retried.
 * 2. readMakeAssignedListingToleratingTransientFailure — claim re-read.
 *    Transport failures only, one retry, at the global WordPress timeout.
 *    That second attempt is what keeps one GetOblic TIMEOUT from stranding
 *    a claim that was already reserved. NOT_FOUND is not retried here.
 *
 * Post-Make stabilization:
 * - attempts: 2
 * - delay before the retry: 500ms
 * - per-attempt timeout: MAKE_ASSIGNED_STABILIZATION_ATTEMPT_TIMEOUT_MS
 *
 * Claim verification:
 * - attempts: 2
 * - delay before the retry: 500ms
 * - per-attempt timeout: GETOBLIC_WORDPRESS_DEFAULT_TIMEOUT_MS (unchanged)
 *
 * Worst-case remote ceiling for one Google conversion, when stabilization
 * succeeds on its last attempt and claim verification then times out twice:
 * Make once + stabilization + claim verification. See
 * MAKE_ASSIGNED_GOOGLE_CONVERSION_MAX_WALL_CLOCK_MS. Exhausted NOT_FOUND
 * does not start another listing GET on the create path.
 *
 * Never import this module from client components.
 */

import { googleBusinessIdsEqual } from "@/services/getoblicDirectory/getoblicGoogleId";
import {
  GETOBLIC_WORDPRESS_DEFAULT_TIMEOUT_MS,
  GetOblicWordpressError,
  type GetOblicWordpressListing,
} from "@/services/getoblicDirectory/getoblicWordpressTypes";
import { GOOGLE_BUSINESS_MAKE_TIMEOUT_MS } from "@/services/googleBusiness/googleBusinessMakeTypes";

export const MAKE_ASSIGNED_STABILIZATION_MAX_ATTEMPTS = 2 as const;

export const MAKE_ASSIGNED_STABILIZATION_RETRY_DELAYS_MS = [500] as const;

export const MAKE_ASSIGNED_STABILIZATION_ATTEMPT_TIMEOUT_MS = 4_000;

export const MAKE_ASSIGNED_STABILIZATION_MAX_ADDED_WAIT_MS =
  MAKE_ASSIGNED_STABILIZATION_RETRY_DELAYS_MS[0];

export const MAKE_ASSIGNED_STABILIZATION_MAX_REMOTE_CALL_MS =
  MAKE_ASSIGNED_STABILIZATION_MAX_ATTEMPTS *
  MAKE_ASSIGNED_STABILIZATION_ATTEMPT_TIMEOUT_MS;

export const MAKE_ASSIGNED_CLAIM_READ_MAX_ATTEMPTS = 2 as const;

export const MAKE_ASSIGNED_CLAIM_READ_RETRY_DELAYS_MS = [500] as const;

export const MAKE_ASSIGNED_CLAIM_READ_MAX_ADDED_WAIT_MS =
  MAKE_ASSIGNED_CLAIM_READ_RETRY_DELAYS_MS[0];

export const MAKE_ASSIGNED_CLAIM_READ_MAX_REMOTE_CALL_MS =
  MAKE_ASSIGNED_CLAIM_READ_MAX_ATTEMPTS * GETOBLIC_WORDPRESS_DEFAULT_TIMEOUT_MS;

export const MAKE_ASSIGNED_GOOGLE_CONVERSION_MAX_WALL_CLOCK_MS =
  GOOGLE_BUSINESS_MAKE_TIMEOUT_MS +
  MAKE_ASSIGNED_STABILIZATION_MAX_ADDED_WAIT_MS +
  MAKE_ASSIGNED_STABILIZATION_MAX_REMOTE_CALL_MS +
  MAKE_ASSIGNED_CLAIM_READ_MAX_ADDED_WAIT_MS +
  MAKE_ASSIGNED_CLAIM_READ_MAX_REMOTE_CALL_MS;

export const MAKE_ASSIGNED_LISTING_READ_LOG =
  "[GETOBLIC_MAKE_ASSIGNED] listing_read_retry" as const;

export type MakeAssignedListingRetryReason =
  | "timeout"
  | "network"
  | "remote_error"
  | "not_found"
  | "author_pending"
  | "google_id_pending";

export type MakeAssignedListingStabilizationResult =
  | { outcome: "ready"; listing: GetOblicWordpressListing }
  | { outcome: "not_found" }
  | { outcome: "author_mismatch"; listing: GetOblicWordpressListing }
  | { outcome: "google_id_conflict"; listing: GetOblicWordpressListing }
  | { outcome: "google_id_unavailable"; listing: GetOblicWordpressListing };

export type MakeAssignedListingSleep = (ms: number) => Promise<void>;

type AttemptOutcome<T> =
  | { action: "resolve"; value: T }
  | {
      action: "retry";
      reason: MakeAssignedListingRetryReason;
      error?: unknown;
      listing?: GetOblicWordpressListing;
    };

type BoundedReadResult<T> =
  | { action: "resolve"; value: T }
  | {
      action: "exhausted";
      reason: MakeAssignedListingRetryReason;
      error?: unknown;
      listing?: GetOblicWordpressListing;
    };

function defaultSleep(ms: number): Promise<void> {
  return new Promise((resolve) => {
    setTimeout(resolve, ms);
  });
}

function retryDelayBeforeAttempt(
  retryDelaysMs: readonly number[],
  attempt: number,
): number {
  const delay = retryDelaysMs[attempt - 2];
  if (delay == null) {
    throw new Error("Make-assigned listing retry delay is missing.");
  }
  return delay;
}

function logListingRead(args: {
  wordpressListingId: number;
  attempt: number;
  reason: MakeAssignedListingRetryReason;
  exhausted: boolean;
}): void {
  console.warn(MAKE_ASSIGNED_LISTING_READ_LOG, {
    wordpressListingId: args.wordpressListingId,
    attempt: args.attempt,
    reason: args.reason,
    exhausted: args.exhausted,
  });
}

function isListingNotFound(error: unknown): boolean {
  return (
    error instanceof GetOblicWordpressError &&
    (error.code === "NOT_FOUND" || error.remoteCode === "LISTING_NOT_FOUND")
  );
}

function transientTransportReason(
  error: unknown,
): "timeout" | "network" | "remote_error" | null {
  if (!(error instanceof GetOblicWordpressError)) {
    return null;
  }
  if (error.code === "TIMEOUT") return "timeout";
  if (error.code === "NETWORK") return "network";
  if (error.code === "REMOTE_ERROR" && error.status >= 500) {
    return "remote_error";
  }
  return null;
}

function classifyObservedListing(
  listing: GetOblicWordpressListing,
  expectedGoogleId: string,
  expectedWordpressAuthorId: number,
): "ready" | "google_id_conflict" | "google_id_pending" | "author_pending" {
  const observed =
    typeof listing.google_id === "string" ? listing.google_id.trim() : "";
  if (
    observed &&
    !googleBusinessIdsEqual(listing.google_id, expectedGoogleId)
  ) {
    return "google_id_conflict";
  }
  if (!googleBusinessIdsEqual(listing.google_id, expectedGoogleId)) {
    return "google_id_pending";
  }
  if (listing.author_id !== expectedWordpressAuthorId) {
    return "author_pending";
  }
  return "ready";
}

async function runMakeAssignedReadAttempts<T>(args: {
  wordpressListingId: number;
  maxAttempts: number;
  retryDelaysMs: readonly number[];
  sleep?: MakeAssignedListingSleep;
  runAttempt: () => Promise<AttemptOutcome<T>>;
}): Promise<BoundedReadResult<T>> {
  const sleep = args.sleep ?? defaultSleep;
  let pending: AttemptOutcome<T> | null = null;

  for (let attempt = 1; attempt <= args.maxAttempts; attempt += 1) {
    if (attempt > 1) {
      await sleep(retryDelayBeforeAttempt(args.retryDelaysMs, attempt));
    }

    const outcome = await args.runAttempt();
    if (outcome.action === "resolve") {
      return outcome;
    }

    pending = outcome;
    const exhausted = attempt >= args.maxAttempts;
    logListingRead({
      wordpressListingId: args.wordpressListingId,
      attempt,
      reason: outcome.reason,
      exhausted,
    });
    if (exhausted) {
      return {
        action: "exhausted",
        reason: outcome.reason,
        error: outcome.error,
        listing: outcome.listing,
      };
    }
  }

  return {
    action: "exhausted",
    reason: pending && pending.action === "retry" ? pending.reason : "remote_error",
    error: pending && pending.action === "retry" ? pending.error : undefined,
    listing: pending && pending.action === "retry" ? pending.listing : undefined,
  };
}

/**
 * Post-Make identity convergence. The returned listing, when ready, has the
 * expected author and the expected Google ID. A conflicting Google ID is
 * returned immediately and is not retried.
 */
export async function waitForMakeAssignedListingToStabilize(args: {
  wordpressListingId: number;
  expectedGoogleId: string;
  expectedWordpressAuthorId: number;
  readListing: (
    wordpressListingId: number,
  ) => Promise<GetOblicWordpressListing>;
  sleep?: MakeAssignedListingSleep;
}): Promise<MakeAssignedListingStabilizationResult> {
  const result = await runMakeAssignedReadAttempts<
    MakeAssignedListingStabilizationResult
  >({
    wordpressListingId: args.wordpressListingId,
    maxAttempts: MAKE_ASSIGNED_STABILIZATION_MAX_ATTEMPTS,
    retryDelaysMs: MAKE_ASSIGNED_STABILIZATION_RETRY_DELAYS_MS,
    sleep: args.sleep,
    runAttempt: async () => {
      try {
        const listing = await args.readListing(args.wordpressListingId);
        const classified = classifyObservedListing(
          listing,
          args.expectedGoogleId,
          args.expectedWordpressAuthorId,
        );
        if (classified === "ready") {
          return { action: "resolve", value: { outcome: "ready", listing } };
        }
        if (classified === "google_id_conflict") {
          return {
            action: "resolve",
            value: { outcome: "google_id_conflict", listing },
          };
        }
        return {
          action: "retry",
          reason: classified,
          listing,
        };
      } catch (error) {
        const transport = transientTransportReason(error);
        if (transport) {
          return { action: "retry", reason: transport, error };
        }
        if (isListingNotFound(error)) {
          return { action: "retry", reason: "not_found", error };
        }
        throw error;
      }
    },
  });

  if (result.action === "resolve") {
    return result.value;
  }
  if (result.reason === "not_found") {
    return { outcome: "not_found" };
  }
  if (result.reason === "author_pending" && result.listing) {
    return { outcome: "author_mismatch", listing: result.listing };
  }
  if (result.reason === "google_id_pending" && result.listing) {
    return { outcome: "google_id_unavailable", listing: result.listing };
  }
  if (result.error) {
    throw result.error;
  }
  throw new GetOblicWordpressError(
    "REMOTE_ERROR",
    "GetOblic Directory is temporarily unavailable.",
    502,
  );
}

/**
 * Claim-time re-read. Retries only transport failures. NOT_FOUND, auth,
 * validation, and any successful payload — including a wrong author or a
 * conflicting Google ID — are returned to the caller unchanged.
 */
export async function readMakeAssignedListingToleratingTransientFailure(args: {
  wordpressListingId: number;
  readListing: () => Promise<GetOblicWordpressListing>;
  sleep?: MakeAssignedListingSleep;
}): Promise<GetOblicWordpressListing> {
  const result = await runMakeAssignedReadAttempts<GetOblicWordpressListing>({
    wordpressListingId: args.wordpressListingId,
    maxAttempts: MAKE_ASSIGNED_CLAIM_READ_MAX_ATTEMPTS,
    retryDelaysMs: MAKE_ASSIGNED_CLAIM_READ_RETRY_DELAYS_MS,
    sleep: args.sleep,
    runAttempt: async () => {
      try {
        const listing = await args.readListing();
        return { action: "resolve", value: listing };
      } catch (error) {
        const transport = transientTransportReason(error);
        if (!transport) {
          throw error;
        }
        return { action: "retry", reason: transport, error };
      }
    },
  });

  if (result.action === "resolve") {
    return result.value;
  }
  if (result.error) {
    throw result.error;
  }
  throw new GetOblicWordpressError(
    "REMOTE_ERROR",
    "GetOblic Directory is temporarily unavailable.",
    502,
  );
}
