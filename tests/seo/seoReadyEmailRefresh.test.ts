/**
 * Bounded Ready-page refresh for an SEO accompanying email written after Ready.
 * No SQL apply and no provider call.
 */

import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, it } from "node:test";
import {
  createReadyEmailRefreshController,
  SEO_READY_EMAIL_REFRESH_INTERVAL_MS,
  SEO_READY_EMAIL_REFRESH_MAX_ATTEMPTS,
  SEO_READY_EMAIL_REFRESH_WINDOW_MS,
  shouldRefreshReadyReportForAccompanyingEmail,
  type ReadyEmailRefreshController,
  type ReadyEmailRefreshSnapshot,
} from "../../lib/seo/seoReadyEmailRefresh";

const ROOT = join(__dirname, "../..");
const READY_AT = Date.parse("2026-10-19T12:00:00.000Z");

function read(relative: string): string {
  return readFileSync(join(ROOT, relative), "utf8");
}

function iso(ms: number): string {
  return new Date(ms).toISOString();
}

function createHarness(startMs: number) {
  let now = startMs;
  let seq = 1;
  let scheduleCalls = 0;
  const timers = new Map<
    number,
    { callback: () => void; every: number; next: number }
  >();
  const refreshes: number[] = [];

  const controller = createReadyEmailRefreshController({
    refresh: () => {
      refreshes.push(now);
    },
    now: () => now,
    schedule: (callback, delayMs) => {
      scheduleCalls += 1;
      const id = seq++;
      timers.set(id, { callback, every: delayMs, next: now + delayMs });
      return id;
    },
    cancel: (timerId) => {
      timers.delete(timerId as number);
    },
  });

  function advance(ms: number) {
    const target = now + ms;
    while (true) {
      let nextId: number | null = null;
      let nextAt = Number.POSITIVE_INFINITY;
      for (const [id, timer] of timers) {
        if (timer.next < nextAt) {
          nextAt = timer.next;
          nextId = id;
        }
      }
      if (nextId == null || nextAt > target) break;
      const timer = timers.get(nextId);
      if (!timer) break;
      now = nextAt;
      timer.next = now + timer.every;
      timer.callback();
    }
    now = target;
  }

  return {
    controller,
    refreshes,
    advance,
    scheduleCalls: () => scheduleCalls,
    pendingTimers: () => timers.size,
    setNow: (value: number) => {
      now = value;
    },
  };
}

function readySnapshot(
  updatedAtMs: number,
  accompanyingEmailVisible: boolean,
): ReadyEmailRefreshSnapshot {
  return {
    status: "Ready",
    accompanyingEmailVisible,
    reportUpdatedAt: iso(updatedAtMs),
  };
}

describe("SEO Ready accompanying-email refresh policy", () => {
  it("refreshes only a Ready report still inside the post-Ready window", () => {
    assert.equal(
      shouldRefreshReadyReportForAccompanyingEmail({
        status: "Ready",
        accompanyingEmailVisible: false,
        reportUpdatedAt: iso(READY_AT),
        nowMs: READY_AT + 1_000,
        attempts: 0,
      }),
      true,
    );
    assert.equal(
      shouldRefreshReadyReportForAccompanyingEmail({
        status: "Processing",
        accompanyingEmailVisible: false,
        reportUpdatedAt: iso(READY_AT),
        nowMs: READY_AT + 1_000,
        attempts: 0,
      }),
      false,
    );
    assert.equal(
      shouldRefreshReadyReportForAccompanyingEmail({
        status: "Ready",
        accompanyingEmailVisible: true,
        reportUpdatedAt: iso(READY_AT),
        nowMs: READY_AT + 1_000,
        attempts: 0,
      }),
      false,
    );
    assert.equal(
      shouldRefreshReadyReportForAccompanyingEmail({
        status: "Ready",
        accompanyingEmailVisible: false,
        reportUpdatedAt: iso(READY_AT),
        nowMs: READY_AT + SEO_READY_EMAIL_REFRESH_WINDOW_MS,
        attempts: 0,
      }),
      false,
    );
    assert.equal(
      shouldRefreshReadyReportForAccompanyingEmail({
        status: "Ready",
        accompanyingEmailVisible: false,
        reportUpdatedAt: iso(READY_AT),
        nowMs: READY_AT + 1_000,
        attempts: SEO_READY_EMAIL_REFRESH_MAX_ATTEMPTS,
      }),
      false,
    );
    assert.equal(
      shouldRefreshReadyReportForAccompanyingEmail({
        status: "Ready",
        accompanyingEmailVisible: false,
        reportUpdatedAt: "",
        nowMs: READY_AT,
        attempts: 0,
      }),
      false,
    );
  });
});

describe("SEO Ready accompanying-email refresh controller", () => {
  function watchReady(
    harness: ReturnType<typeof createHarness>,
    snapshot: ReadyEmailRefreshSnapshot,
  ): ReadyEmailRefreshController {
    harness.controller.sync(snapshot);
    return harness.controller;
  }

  it("waits out Ready before the email write, then refreshes on a later tick", () => {
    const harness = createHarness(READY_AT - 60_000);
    harness.controller.sync({
      status: "Processing",
      accompanyingEmailVisible: false,
      reportUpdatedAt: iso(READY_AT - 60_000),
    });
    harness.advance(SEO_READY_EMAIL_REFRESH_INTERVAL_MS * 3);
    assert.equal(harness.refreshes.length, 0);
    assert.equal(harness.scheduleCalls(), 0);

    harness.setNow(READY_AT);
    watchReady(harness, readySnapshot(READY_AT, false));
    harness.advance(SEO_READY_EMAIL_REFRESH_INTERVAL_MS - 1);
    assert.deepEqual(harness.refreshes, []);

    harness.advance(1);
    assert.deepEqual(harness.refreshes, [READY_AT + SEO_READY_EMAIL_REFRESH_INTERVAL_MS]);
    assert.equal(harness.scheduleCalls(), 1);
  });

  it("stops when a later refresh shows the accompanying email", () => {
    const harness = createHarness(READY_AT);
    watchReady(harness, readySnapshot(READY_AT, false));
    harness.advance(SEO_READY_EMAIL_REFRESH_INTERVAL_MS * 2);
    assert.equal(harness.refreshes.length, 2);

    watchReady(harness, readySnapshot(READY_AT, true));
    harness.advance(SEO_READY_EMAIL_REFRESH_WINDOW_MS);
    assert.equal(harness.refreshes.length, 2);
    assert.equal(harness.pendingTimers(), 0);
  });

  it("stops after the window when email generation or persistence soft-fails", () => {
    const harness = createHarness(READY_AT);
    watchReady(harness, readySnapshot(READY_AT, false));
    harness.controller.sync(readySnapshot(READY_AT, false));
    harness.controller.sync(readySnapshot(READY_AT, false));
    assert.equal(harness.scheduleCalls(), 1);

    harness.advance(SEO_READY_EMAIL_REFRESH_WINDOW_MS + 60_000);
    assert.equal(harness.refreshes.length, SEO_READY_EMAIL_REFRESH_MAX_ATTEMPTS);
    assert.ok(
      harness.refreshes.every(
        (at) => at < READY_AT + SEO_READY_EMAIL_REFRESH_WINDOW_MS,
      ),
    );
    assert.equal(harness.pendingTimers(), 0);

    const frozen = harness.refreshes.length;
    harness.controller.sync(readySnapshot(READY_AT, false));
    harness.advance(120_000);
    assert.equal(harness.refreshes.length, frozen);
    assert.equal(harness.pendingTimers(), 0);
  });

  it("does not refresh a historical Ready report with a null email", () => {
    const historicalReadyAt = READY_AT - 24 * 60 * 60 * 1000;
    const harness = createHarness(READY_AT);
    watchReady(harness, readySnapshot(historicalReadyAt, false));
    harness.advance(10 * 60_000);
    assert.deepEqual(harness.refreshes, []);
    assert.equal(harness.scheduleCalls(), 0);
    assert.equal(harness.pendingTimers(), 0);

    const revisit = createHarness(READY_AT + 60_000);
    revisit.controller.sync(readySnapshot(historicalReadyAt, false));
    revisit.advance(SEO_READY_EMAIL_REFRESH_WINDOW_MS * 4);
    assert.deepEqual(revisit.refreshes, []);
    assert.equal(revisit.scheduleCalls(), 0);
  });

  it("does not keep a timer after the attempt cap or the Ready window", () => {
    assert.ok(SEO_READY_EMAIL_REFRESH_MAX_ATTEMPTS < 20);
    assert.ok(SEO_READY_EMAIL_REFRESH_WINDOW_MS <= 20_000);
    assert.ok(
      SEO_READY_EMAIL_REFRESH_INTERVAL_MS * SEO_READY_EMAIL_REFRESH_MAX_ATTEMPTS <=
        SEO_READY_EMAIL_REFRESH_WINDOW_MS,
    );

    const harness = createHarness(READY_AT + SEO_READY_EMAIL_REFRESH_WINDOW_MS);
    watchReady(harness, readySnapshot(READY_AT, false));
    harness.advance(60_000);
    assert.deepEqual(harness.refreshes, []);
    assert.equal(harness.scheduleCalls(), 0);
  });

  it("uses one refresh schedule for Strategic SEO and Website Technical Health", () => {
    const intelligence = read("components/seo/SeoReportDetailView.tsx");
    const technical = read("components/seo/SeoTechnicalReportDetailView.tsx");
    const panel = read("components/seo/SeoReportStatusPanel.tsx");
    const page = read("app/seo/[id]/page.tsx");
    const refresh = read("lib/seo/seoReadyEmailRefresh.ts");

    for (const source of [intelligence, technical]) {
      assert.match(source, /SeoReportStatusPanel/);
      assert.match(source, /SeoAccompanyingEmailCard/);
      assert.match(
        source,
        /accompanyingEmailVisible=\{report\.accompanyingEmail != null\}/,
      );
      assert.match(source, /reportUpdatedAt=\{report\.updatedAt\}/);
    }
    assert.match(intelligence, /SeoTechnicalReportDetailView/);
    assert.match(panel, /createReadyEmailRefreshController/);
    assert.match(panel, /router\.refresh\(\)/);
    assert.match(page, /getSeoReportById\(id, organizationId\)/);
    assert.match(page, /toPublicSeoReportDetail\(report\)/);
    assert.doesNotMatch(refresh, /supabase|generateSeoAccompanyingEmail|persistSeoAccompanyingEmail/);
    assert.doesNotMatch(panel, /persistSeoAccompanyingEmail|generateSeoAccompanyingEmail/);

    const executor = read(
      "services/seo/seoGenerationJobs/seoGenerationJobExecutor.ts",
    );
    const emailAt = executor.indexOf("await generateSeoAccompanyingEmail(");
    const completeAt = executor.lastIndexOf("completeSeoGenerationJobWithClaim");
    const persistAt = executor.indexOf("await persistSeoAccompanyingEmailIfAbsent");
    assert.ok(emailAt > 0 && emailAt < completeAt && completeAt < persistAt);
  });
});
