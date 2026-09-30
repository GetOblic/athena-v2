/**
 * Bounded Make-assigned listing reads. Delays are injected; these tests
 * do not wait on the real timer.
 */

import "./getoblicDirectoryTestEnv";

import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, it } from "node:test";
import {
  MAKE_ASSIGNED_CLAIM_READ_MAX_ADDED_WAIT_MS,
  MAKE_ASSIGNED_CLAIM_READ_MAX_ATTEMPTS,
  MAKE_ASSIGNED_CLAIM_READ_MAX_REMOTE_CALL_MS,
  MAKE_ASSIGNED_CLAIM_READ_RETRY_DELAYS_MS,
  MAKE_ASSIGNED_GOOGLE_CONVERSION_MAX_WALL_CLOCK_MS,
  MAKE_ASSIGNED_LISTING_READ_LOG,
  MAKE_ASSIGNED_STABILIZATION_ATTEMPT_TIMEOUT_MS,
  MAKE_ASSIGNED_STABILIZATION_MAX_ADDED_WAIT_MS,
  MAKE_ASSIGNED_STABILIZATION_MAX_ATTEMPTS,
  MAKE_ASSIGNED_STABILIZATION_MAX_REMOTE_CALL_MS,
  MAKE_ASSIGNED_STABILIZATION_RETRY_DELAYS_MS,
  readMakeAssignedListingToleratingTransientFailure,
  waitForMakeAssignedListingToStabilize,
} from "../../services/getoblicDirectory/getoblicMakeAssignedListingStabilization";
import { GOOGLE_BUSINESS_MAKE_TIMEOUT_MS } from "../../services/googleBusiness/googleBusinessMakeTypes";
import {
  GETOBLIC_WORDPRESS_DEFAULT_TIMEOUT_MS,
  GetOblicWordpressError,
  type GetOblicWordpressListing,
} from "../../services/getoblicDirectory/getoblicWordpressTypes";

const ROOT = process.cwd();
const LISTING_ID = 947182;
const GOOGLE_ID = "ChIJexamplePlace";
const AUTHOR_ID = 271520168;

function read(relativePath: string): string {
  return readFileSync(join(ROOT, relativePath), "utf8");
}

function listing(
  overrides: Partial<GetOblicWordpressListing> = {},
): GetOblicWordpressListing {
  return {
    wordpress_listing_id: LISTING_ID,
    status: "publish",
    title: "Franklin Automotive & Restoration",
    author_id: AUTHOR_ID,
    google_id: GOOGLE_ID,
    google_place_url: null,
    knowledge_base: null,
    ...overrides,
  };
}

function wordpressError(
  code: ConstructorParameters<typeof GetOblicWordpressError>[0],
  status: number,
  remoteCode: string | null = null,
): GetOblicWordpressError {
  return new GetOblicWordpressError(code, `${code} failed`, status, remoteCode);
}

async function withWarnings<T>(
  run: () => Promise<T>,
): Promise<{ result: T; warnings: unknown[][] }> {
  const warnings: unknown[][] = [];
  const original = console.warn;
  console.warn = (...args: unknown[]) => {
    warnings.push(args);
  };
  try {
    const result = await run();
    return { result, warnings };
  } finally {
    console.warn = original;
  }
}

describe("Make-assigned listing stabilization policy", () => {
  it("uses a shorter stabilization budget than claim verification", () => {
    assert.equal(GETOBLIC_WORDPRESS_DEFAULT_TIMEOUT_MS, 12_000);
    assert.equal(GOOGLE_BUSINESS_MAKE_TIMEOUT_MS, 12_000);
    assert.equal(MAKE_ASSIGNED_STABILIZATION_MAX_ATTEMPTS, 2);
    assert.deepEqual([...MAKE_ASSIGNED_STABILIZATION_RETRY_DELAYS_MS], [500]);
    assert.equal(MAKE_ASSIGNED_STABILIZATION_ATTEMPT_TIMEOUT_MS, 4_000);
    assert.ok(
      MAKE_ASSIGNED_STABILIZATION_ATTEMPT_TIMEOUT_MS <
        GETOBLIC_WORDPRESS_DEFAULT_TIMEOUT_MS,
    );
    assert.equal(MAKE_ASSIGNED_STABILIZATION_MAX_ADDED_WAIT_MS, 500);
    assert.equal(MAKE_ASSIGNED_STABILIZATION_MAX_REMOTE_CALL_MS, 8_000);
    assert.equal(MAKE_ASSIGNED_CLAIM_READ_MAX_ATTEMPTS, 2);
    assert.deepEqual([...MAKE_ASSIGNED_CLAIM_READ_RETRY_DELAYS_MS], [500]);
    assert.equal(MAKE_ASSIGNED_CLAIM_READ_MAX_ADDED_WAIT_MS, 500);
    assert.equal(MAKE_ASSIGNED_CLAIM_READ_MAX_REMOTE_CALL_MS, 24_000);
    assert.equal(MAKE_ASSIGNED_GOOGLE_CONVERSION_MAX_WALL_CLOCK_MS, 45_000);
    assert.equal(
      MAKE_ASSIGNED_GOOGLE_CONVERSION_MAX_WALL_CLOCK_MS,
      GOOGLE_BUSINESS_MAKE_TIMEOUT_MS +
        MAKE_ASSIGNED_STABILIZATION_MAX_ADDED_WAIT_MS +
        MAKE_ASSIGNED_STABILIZATION_MAX_REMOTE_CALL_MS +
        MAKE_ASSIGNED_CLAIM_READ_MAX_ADDED_WAIT_MS +
        MAKE_ASSIGNED_CLAIM_READ_MAX_REMOTE_CALL_MS,
    );
  });

  it("returns a ready listing without waiting", async () => {
    const delays: number[] = [];
    let reads = 0;
    const { result, warnings } = await withWarnings(() =>
      waitForMakeAssignedListingToStabilize({
        wordpressListingId: LISTING_ID,
        expectedGoogleId: GOOGLE_ID,
        expectedWordpressAuthorId: AUTHOR_ID,
        sleep: async (ms) => {
          delays.push(ms);
        },
        readListing: async () => {
          reads += 1;
          return listing();
        },
      }),
    );
    assert.equal(result.outcome, "ready");
    assert.equal(reads, 1);
    assert.deepEqual(delays, []);
    assert.equal(warnings.length, 0);
  });

  it("retries timeout, network, and HTTP 5xx, then stops", async () => {
    const cases: Array<{
      error: GetOblicWordpressError;
      reason: string;
    }> = [
      { error: wordpressError("TIMEOUT", 504), reason: "timeout" },
      { error: wordpressError("NETWORK", 502), reason: "network" },
      { error: wordpressError("REMOTE_ERROR", 503), reason: "remote_error" },
    ];

    for (const entry of cases) {
      const delays: number[] = [];
      let reads = 0;
      const { result, warnings } = await withWarnings(() =>
        waitForMakeAssignedListingToStabilize({
          wordpressListingId: LISTING_ID,
          expectedGoogleId: GOOGLE_ID,
          expectedWordpressAuthorId: AUTHOR_ID,
          sleep: async (ms) => {
            delays.push(ms);
          },
          readListing: async () => {
            reads += 1;
            if (reads === 1) throw entry.error;
            return listing();
          },
        }),
      );
      assert.equal(result.outcome, "ready");
      assert.equal(reads, 2);
      assert.deepEqual(delays, [...MAKE_ASSIGNED_STABILIZATION_RETRY_DELAYS_MS]);
      assert.equal(warnings.length, 1);
      assert.equal(warnings[0]?.[0], MAKE_ASSIGNED_LISTING_READ_LOG);
      assert.deepEqual(warnings[0]?.[1], {
        wordpressListingId: LISTING_ID,
        attempt: 1,
        reason: entry.reason,
        exhausted: false,
      });
    }
  });

  it("exhausts transport failures on the second attempt and logs that exhaustion", async () => {
    const delays: number[] = [];
    const error = wordpressError("TIMEOUT", 504);
    const { warnings } = await withWarnings(() =>
      assert.rejects(
        () =>
          waitForMakeAssignedListingToStabilize({
            wordpressListingId: LISTING_ID,
            expectedGoogleId: GOOGLE_ID,
            expectedWordpressAuthorId: AUTHOR_ID,
            sleep: async (ms) => {
              delays.push(ms);
            },
            readListing: async () => {
              throw error;
            },
          }),
        (caught: unknown) => caught === error,
      ),
    );
    assert.deepEqual(delays, [...MAKE_ASSIGNED_STABILIZATION_RETRY_DELAYS_MS]);
    assert.equal(warnings.length, 2);
    assert.deepEqual(warnings[1]?.[1], {
      wordpressListingId: LISTING_ID,
      attempt: 2,
      reason: "timeout",
      exhausted: true,
    });
    const payload = warnings[1]?.[1] as Record<string, unknown>;
    assert.deepEqual(Object.keys(payload).sort(), [
      "attempt",
      "exhausted",
      "reason",
      "wordpressListingId",
    ]);
  });

  it("retries not-found and a temporary author, then requires an exact match", async () => {
    const notFound = wordpressError("NOT_FOUND", 404, "LISTING_NOT_FOUND");
    let reads = 0;
    const found = await waitForMakeAssignedListingToStabilize({
      wordpressListingId: LISTING_ID,
      expectedGoogleId: GOOGLE_ID,
      expectedWordpressAuthorId: AUTHOR_ID,
      sleep: async () => {},
      readListing: async () => {
        reads += 1;
        if (reads === 1) throw notFound;
        return listing();
      },
    });
    assert.equal(found.outcome, "ready");
    assert.equal(reads, 2);

    let authorReads = 0;
    const afterAuthor = await waitForMakeAssignedListingToStabilize({
      wordpressListingId: LISTING_ID,
      expectedGoogleId: GOOGLE_ID,
      expectedWordpressAuthorId: AUTHOR_ID,
      sleep: async () => {},
      readListing: async () => {
        authorReads += 1;
        if (authorReads === 1) return listing({ author_id: 1 });
        return listing();
      },
    });
    assert.equal(afterAuthor.outcome, "ready");
    assert.equal(authorReads, 2);

    const exhausted = await waitForMakeAssignedListingToStabilize({
      wordpressListingId: LISTING_ID,
      expectedGoogleId: GOOGLE_ID,
      expectedWordpressAuthorId: AUTHOR_ID,
      sleep: async () => {},
      readListing: async () => {
        throw notFound;
      },
    });
    assert.deepEqual(exhausted, { outcome: "not_found" });

    const mismatch = await waitForMakeAssignedListingToStabilize({
      wordpressListingId: LISTING_ID,
      expectedGoogleId: GOOGLE_ID,
      expectedWordpressAuthorId: AUTHOR_ID,
      sleep: async () => {},
      readListing: async () => listing({ author_id: 99 }),
    });
    assert.equal(mismatch.outcome, "author_mismatch");
    if (mismatch.outcome === "author_mismatch") {
      assert.equal(mismatch.listing.author_id, 99);
    }
  });

  it("retries a missing Google ID and rejects a conflicting ID on the first observation", async () => {
    let reads = 0;
    const ready = await waitForMakeAssignedListingToStabilize({
      wordpressListingId: LISTING_ID,
      expectedGoogleId: GOOGLE_ID,
      expectedWordpressAuthorId: AUTHOR_ID,
      sleep: async () => {},
      readListing: async () => {
        reads += 1;
        if (reads === 1) return listing({ google_id: null });
        return listing();
      },
    });
    assert.equal(ready.outcome, "ready");
    assert.equal(reads, 2);

    let conflictReads = 0;
    const conflict = await waitForMakeAssignedListingToStabilize({
      wordpressListingId: LISTING_ID,
      expectedGoogleId: GOOGLE_ID,
      expectedWordpressAuthorId: AUTHOR_ID,
      sleep: async () => {
        throw new Error("conflicting Google ID must not wait");
      },
      readListing: async () => {
        conflictReads += 1;
        return listing({ google_id: "ChIJotherPlace" });
      },
    });
    assert.equal(conflict.outcome, "google_id_conflict");
    assert.equal(conflictReads, 1);

    const unavailable = await waitForMakeAssignedListingToStabilize({
      wordpressListingId: LISTING_ID,
      expectedGoogleId: GOOGLE_ID,
      expectedWordpressAuthorId: AUTHOR_ID,
      sleep: async () => {},
      readListing: async () => listing({ google_id: " " }),
    });
    assert.equal(unavailable.outcome, "google_id_unavailable");
  });

  it("does not retry auth, validation, conflict, invalid payloads, or 4xx remote errors", async () => {
    const errors = [
      wordpressError("UNAUTHORIZED", 401, "INVALID_API_KEY"),
      wordpressError("CONFIG_MISSING", 500),
      wordpressError("VALIDATION", 400),
      wordpressError("CONFLICT", 409),
      wordpressError("INVALID_RESPONSE", 502),
      wordpressError("REMOTE_ERROR", 429),
      new Error("local failure"),
    ];

    for (const error of errors) {
      let reads = 0;
      await assert.rejects(
        () =>
          waitForMakeAssignedListingToStabilize({
            wordpressListingId: LISTING_ID,
            expectedGoogleId: GOOGLE_ID,
            expectedWordpressAuthorId: AUTHOR_ID,
            sleep: async () => {
              throw new Error("non-retryable read must not wait");
            },
            readListing: async () => {
              reads += 1;
              throw error;
            },
          }),
        (caught: unknown) => caught === error,
      );
      assert.equal(reads, 1);
    }
  });
});

describe("Make-assigned claim re-read", () => {
  it("retries only transport failures and returns identity mismatches as-is", async () => {
    let reads = 0;
    const delays: number[] = [];
    const listingResult = await readMakeAssignedListingToleratingTransientFailure({
      wordpressListingId: LISTING_ID,
      sleep: async (ms) => {
        delays.push(ms);
      },
      readListing: async () => {
        reads += 1;
        if (reads === 1) throw wordpressError("NETWORK", 502);
        return listing({ author_id: 99, google_id: "ChIJotherPlace" });
      },
    });
    assert.equal(listingResult.author_id, 99);
    assert.equal(listingResult.google_id, "ChIJotherPlace");
    assert.equal(reads, 2);
    assert.deepEqual(delays, [...MAKE_ASSIGNED_CLAIM_READ_RETRY_DELAYS_MS]);

    const notFound = wordpressError("NOT_FOUND", 404, "LISTING_NOT_FOUND");
    let notFoundReads = 0;
    await assert.rejects(
      () =>
        readMakeAssignedListingToleratingTransientFailure({
          wordpressListingId: LISTING_ID,
          sleep: async () => {
            throw new Error("claim-time not-found must not wait");
          },
          readListing: async () => {
            notFoundReads += 1;
            throw notFound;
          },
        }),
      (caught: unknown) => caught === notFound,
    );
    assert.equal(notFoundReads, 1);
  });
});

describe("Make-assigned retry ownership", () => {
  it("keeps stabilization and the claim re-read from calling each other", () => {
    const source = read(
      "services/getoblicDirectory/getoblicMakeAssignedListingStabilization.ts",
    );
    const stabilizeStart = source.indexOf(
      "export async function waitForMakeAssignedListingToStabilize",
    );
    const transportStart = source.indexOf(
      "export async function readMakeAssignedListingToleratingTransientFailure",
    );
    assert.ok(stabilizeStart > 0);
    assert.ok(transportStart > stabilizeStart);
    const stabilizeBody = source.slice(stabilizeStart, transportStart);
    const transportBody = source.slice(transportStart);
    assert.equal(
      stabilizeBody.includes(
        "readMakeAssignedListingToleratingTransientFailure",
      ),
      false,
    );
    assert.equal(
      transportBody.includes("waitForMakeAssignedListingToStabilize"),
      false,
    );

    const google = read(
      "services/googleBusiness/googleBusinessConvertService.ts",
    );
    const claim = read(
      "services/getoblicDirectory/getoblicDirectoryClaimService.ts",
    );
    const convert = read(
      "services/getoblicDirectory/getoblicDirectoryConvertService.ts",
    );
    const client = read(
      "services/getoblicDirectory/getoblicWordpressClient.ts",
    );

    assert.match(google, /waitForMakeAssignedListingToStabilize/);
    assert.doesNotMatch(
      google,
      /readMakeAssignedListingToleratingTransientFailure/,
    );
    assert.match(claim, /readMakeAssignedListingToleratingTransientFailure/);
    assert.doesNotMatch(claim, /waitForMakeAssignedListingToStabilize/);
    assert.doesNotMatch(convert, /waitForMakeAssignedListingToStabilize/);
    assert.doesNotMatch(
      convert,
      /readMakeAssignedListingToleratingTransientFailure/,
    );
    assert.doesNotMatch(client, /waitForMakeAssignedListingToStabilize/);
    assert.doesNotMatch(
      client,
      /readMakeAssignedListingToleratingTransientFailure/,
    );
    assert.match(client, /GETOBLIC_WORDPRESS_DEFAULT_TIMEOUT_MS/);
    assert.match(client, /Math\.min\(override, defaultMs\)/);
    assert.match(google, /MAKE_ASSIGNED_STABILIZATION_ATTEMPT_TIMEOUT_MS/);
    assert.match(google, /remoteListingConfirmedMissing/);
    assert.match(convert, /remoteListingConfirmedMissing/);

    const reservedStart = claim.indexOf("async function acquireReservedClaim");
    const reservedEnd = claim.indexOf(
      "async function resolveWordpressAuthorIdOrStamp",
    );
    const reserved = claim.slice(reservedStart, reservedEnd);
    assert.doesNotMatch(reserved, /retryTransientTransport/);
    assert.doesNotMatch(
      reserved,
      /readMakeAssignedListingToleratingTransientFailure/,
    );

    const makeAssignedStart = claim.indexOf(
      "async function acquireMakeAssignedClaim",
    );
    const makeAssignedEnd = claim.indexOf("async function acquireReservedClaim");
    const makeAssigned = claim.slice(makeAssignedStart, makeAssignedEnd);
    assert.match(makeAssigned, /retryTransientTransport: true/);
    assert.doesNotMatch(makeAssigned, /assignListingAuthor/);
  });
});
