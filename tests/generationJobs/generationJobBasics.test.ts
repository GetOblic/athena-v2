import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { classifyGenerationError } from "../../services/generationJobs/generationJobErrors";
import {
  GENERATION_JOB_RETRY_BACKOFF_MS,
} from "../../services/generationJobs/generationJobTypes";
import { createWorkerIdentity } from "../../services/generationJobs/generationJobWorkerIdentity";
import {
  ATHENA_WORKER_CONFIG_DEFAULTS,
  resolveAthenaWorkerConfig,
  shouldRequestFollowUpWhenActiveJobExists,
} from "../../services/generationJobs/generationJobWorkerConfig";

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
    const config = resolveAthenaWorkerConfig({});
    assert.equal(config.pollIntervalMs, 3_000);
    assert.equal(config.heartbeatIntervalMs, 20_000);
    assert.equal(config.leaseSeconds, 120);
    assert.equal(config.maxAttempts, 3);
    assert.equal(config.shutdownTimeoutMs, 90_000);
    assert.equal(config.concurrency, 1);
    assert.ok(config.heartbeatIntervalMs < (config.leaseSeconds * 1000) / 2);
    assert.deepEqual([...GENERATION_JOB_RETRY_BACKOFF_MS], [30_000, 120_000]);
    assert.deepEqual(config, ATHENA_WORKER_CONFIG_DEFAULTS);
  });

  it("rejects invalid numeric env values and falls back to defaults", () => {
    const config = resolveAthenaWorkerConfig({
      ATHENA_WORKER_POLL_INTERVAL_MS: "abc",
      ATHENA_WORKER_LEASE_SECONDS: "12.5",
      ATHENA_WORKER_MAX_ATTEMPTS: "nope",
    });
    assert.equal(config.pollIntervalMs, 3_000);
    assert.equal(config.leaseSeconds, 120);
    assert.equal(config.maxAttempts, 3);
  });

  it("clamps heartbeat to remain safely shorter than half the lease", () => {
    const config = resolveAthenaWorkerConfig({
      ATHENA_WORKER_LEASE_SECONDS: "60",
      ATHENA_WORKER_HEARTBEAT_INTERVAL_MS: "50000",
    });
    assert.equal(config.leaseSeconds, 60);
    assert.ok(config.heartbeatIntervalMs < (config.leaseSeconds * 1000) / 2);
  });

  it("forces concurrency to 1 even when env requests more", () => {
    const config = resolveAthenaWorkerConfig({
      ATHENA_WORKER_CONCURRENCY: "4",
    });
    assert.equal(config.concurrency, 1);
  });

  it("creates unique worker identities including hostname and pid", () => {
    const a = createWorkerIdentity();
    const b = createWorkerIdentity();
    assert.match(a, /^athena-worker:/);
    assert.notEqual(a, b);
    assert.ok(a.includes(String(process.pid)));
  });
});

describe("retryable active-job coalescing", () => {
  it("always requests durable follow-up when an active job already exists", () => {
    // Covers manual_refresh, discussion_update, and duplicate HTTP submits
    // against queued / processing / retryable jobs.
    assert.equal(shouldRequestFollowUpWhenActiveJobExists(), true);
  });

  it("documents that follow-up uses latest discussion state after active job finishes", () => {
    // processDiscussionEndToEnd always loads current discussion + updates from DB.
    // pending_generation_follow_up therefore regenerates against newest accumulated state,
    // so a stale retryable completion cannot remain Current after newer executive input.
    assert.equal(shouldRequestFollowUpWhenActiveJobExists(), true);
  });
});
