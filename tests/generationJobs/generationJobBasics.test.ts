import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { classifyGenerationError } from "../../services/generationJobs/generationJobErrors";
import {
  GENERATION_JOB_LEASE_SECONDS,
  GENERATION_JOB_HEARTBEAT_MS,
  GENERATION_JOB_MAX_ATTEMPTS,
  GENERATION_JOB_RETRY_BACKOFF_MS,
} from "../../services/generationJobs/generationJobTypes";
import { createWorkerIdentity } from "../../services/generationJobs/generationJobWorkerIdentity";

describe("generation job error classification", () => {
  it("marks validation and missing discussion as terminal", () => {
    const missing = classifyGenerationError(new Error("Discussion not found"));
    assert.equal(missing.classification, "terminal");

    const validation = classifyGenerationError(
      new Error("Discussion update body is required."),
    );
    assert.equal(validation.classification, "terminal");
  });

  it("marks network and rate-limit errors as retryable", () => {
    const timeout = classifyGenerationError(new Error("OpenRouter timed out"));
    assert.equal(timeout.classification, "retryable");

    const rate = classifyGenerationError(new Error("rate limit 429"));
    assert.equal(rate.classification, "retryable");
  });
});

describe("worker configuration defaults", () => {
  it("uses conservative lease and heartbeat timings", () => {
    assert.equal(GENERATION_JOB_LEASE_SECONDS, 120);
    assert.ok(GENERATION_JOB_HEARTBEAT_MS < GENERATION_JOB_LEASE_SECONDS * 1000);
    assert.equal(GENERATION_JOB_MAX_ATTEMPTS, 3);
    assert.deepEqual([...GENERATION_JOB_RETRY_BACKOFF_MS], [30_000, 120_000]);
  });

  it("creates unique worker identities including hostname and pid", () => {
    const a = createWorkerIdentity();
    const b = createWorkerIdentity();
    assert.match(a, /^athena-worker:/);
    assert.notEqual(a, b);
    assert.ok(a.includes(String(process.pid)));
  });
});
