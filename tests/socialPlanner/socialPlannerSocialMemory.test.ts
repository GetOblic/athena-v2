import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  SOCIAL_PLANNER_HISTORY_SELECT,
  SOCIAL_PLANNER_HISTORY_TABLE,
  SOCIAL_PLANNER_SOCIAL_MEMORY_BOUNDS,
  SOCIAL_PLANNER_SOCIAL_MEMORY_SCHEMA_VERSION,
  type SocialPlannerHistoryLoader,
  type SocialPlannerHistoryRow,
} from "../../services/socialPlanner/diversity/socialPlannerSocialMemoryTypes";
import {
  composeSocialPlannerSocialMemory,
  loadSocialPlannerSocialMemory,
} from "../../services/socialPlanner/diversity/loadSocialPlannerSocialMemory";
import { SocialPlannerSocialMemoryError } from "../../services/socialPlanner/generation/socialPlannerGenerationErrors";
import {
  TEST_FOREIGN_ORG,
  TEST_ORG,
  buildAlternatePackageRaw,
  buildGenerationContext,
  buildHistoryRow,
  buildValidatedPackage,
  buildValidPackageRaw,
} from "./socialPlannerGenerationFixtures";

function loaderOf(rows: SocialPlannerHistoryRow[]): SocialPlannerHistoryLoader {
  return {
    async listReadyCalendars() {
      return rows;
    },
  };
}

describe("Social Planner L5 Social Memory", () => {
  it("returns empty memory for first-generation organizations", async () => {
    const memory = await loadSocialPlannerSocialMemory({
      organizationId: TEST_ORG,
      historyLoader: loaderOf([]),
    });

    assert.equal(memory.schemaVersion, SOCIAL_PLANNER_SOCIAL_MEMORY_SCHEMA_VERSION);
    assert.equal(memory.organizationId, TEST_ORG);
    assert.equal(memory.calendarsIncluded, 0);
    assert.equal(memory.historicalAssets.length, 0);
    assert.equal(memory.composedText, "");
    assert.equal(memory.diagnostics.truncated, false);
  });

  it("loads Ready calendars for the same organization only", async () => {
    const context = buildGenerationContext();
    const socialPackage = buildValidatedPackage(context);
    const memory = await loadSocialPlannerSocialMemory({
      organizationId: TEST_ORG,
      historyLoader: loaderOf([
        buildHistoryRow({
          id: "cal-ready",
          createdAt: "2026-05-01T10:00:00.000Z",
          socialPackage,
        }),
      ]),
    });

    assert.equal(memory.calendarsIncluded, 1);
    assert.equal(memory.historicalAssets.length, 7);
    assert.equal(memory.historicalWeeks[0]?.calendarId, "cal-ready");
    assert.match(memory.composedText, /RECENT SOCIAL MEMORY — DO NOT REPEAT/);
    assert.doesNotMatch(memory.composedText, /Hidden Dental Group LLC/);
    assert.doesNotMatch(memory.composedText, /productionSpec|imagePrompt|socialCopy/);
  });

  it("fails closed when a loader returns a foreign-organization row", async () => {
    const context = buildGenerationContext();
    await assert.rejects(
      () =>
        loadSocialPlannerSocialMemory({
          organizationId: TEST_ORG,
          historyLoader: loaderOf([
            buildHistoryRow({
              id: "cal-foreign",
              createdAt: "2026-05-01T10:00:00.000Z",
              organizationId: TEST_FOREIGN_ORG,
              socialPackage: buildValidatedPackage(context),
            }),
          ]),
        }),
      (error: unknown) => {
        assert.ok(error instanceof SocialPlannerSocialMemoryError);
        assert.equal(error.code, "SOCIAL_MEMORY_LOAD_FAILED");
        assert.equal(error.reason, "FOREIGN_ORGANIZATION");
        assert.equal(error.retryable, false);
        return true;
      },
    );
  });

  it("ignores Queued, failed, and null-package calendars", () => {
    const context = buildGenerationContext();
    const ready = buildValidatedPackage(context);
    const memory = composeSocialPlannerSocialMemory({
      organizationId: TEST_ORG,
      rows: [
        buildHistoryRow({
          id: "queued",
          createdAt: "2026-05-08T10:00:00.000Z",
          status: "Queued",
          socialPackage: ready,
        }),
        buildHistoryRow({
          id: "failed",
          createdAt: "2026-05-07T10:00:00.000Z",
          status: "Processing Failed",
          socialPackage: ready,
        }),
        buildHistoryRow({
          id: "processing",
          createdAt: "2026-05-06T10:00:00.000Z",
          status: "Processing",
          socialPackage: ready,
        }),
        buildHistoryRow({
          id: "null-package",
          createdAt: "2026-05-05T10:00:00.000Z",
          socialPackage: null,
        }),
        buildHistoryRow({
          id: "ready",
          createdAt: "2026-05-04T10:00:00.000Z",
          socialPackage: ready,
        }),
      ],
    });

    assert.equal(memory.calendarsIncluded, 1);
    assert.equal(memory.historicalWeeks[0]?.calendarId, "ready");
    assert.ok(memory.diagnostics.malformedPackagesSkipped >= 4);
  });

  it("considers only the newest bounded Ready calendars", () => {
    const context = buildGenerationContext();
    const ready = buildValidatedPackage(context);
    const rows = Array.from({ length: 12 }, (_, index) =>
      buildHistoryRow({
        id: `cal-${index}`,
        createdAt: `2026-04-${String(index + 1).padStart(2, "0")}T10:00:00.000Z`,
        socialPackage: ready,
      }),
    );

    const memory = composeSocialPlannerSocialMemory({
      organizationId: TEST_ORG,
      rows,
    });

    assert.equal(
      memory.calendarsConsidered,
      SOCIAL_PLANNER_SOCIAL_MEMORY_BOUNDS.maxCalendars,
    );
    assert.equal(memory.calendarsIncluded, 10);
    assert.equal(memory.historicalWeeks[0]?.calendarId, "cal-11");
    assert.equal(memory.historicalWeeks.at(-1)?.calendarId, "cal-2");
    assert.equal(memory.historicalAssets.length, 70);
    assert.ok(
      !memory.historicalWeeks.some((week) => week.calendarId === "cal-0"),
    );
  });

  it("passes a query limit into the history loader", async () => {
    let seenLimit: number | null = null;
    let seenOrg: string | null = null;
    await loadSocialPlannerSocialMemory({
      organizationId: TEST_ORG,
      historyLoader: {
        async listReadyCalendars(input) {
          seenLimit = input.limit;
          seenOrg = input.organizationId;
          return [];
        },
      },
    });
    assert.equal(seenOrg, TEST_ORG);
    assert.equal(seenLimit, SOCIAL_PLANNER_SOCIAL_MEMORY_BOUNDS.maxCalendars);
  });

  it("is deterministic for the same history and order", () => {
    const context = buildGenerationContext();
    const rows = [
      buildHistoryRow({
        id: "cal-b",
        createdAt: "2026-05-02T10:00:00.000Z",
        socialPackage: buildValidatedPackage(context, buildAlternatePackageRaw(context)),
      }),
      buildHistoryRow({
        id: "cal-a",
        createdAt: "2026-05-03T10:00:00.000Z",
        socialPackage: buildValidatedPackage(context),
      }),
    ];

    const first = composeSocialPlannerSocialMemory({ organizationId: TEST_ORG, rows });
    const second = composeSocialPlannerSocialMemory({
      organizationId: TEST_ORG,
      rows: [...rows].reverse(),
    });

    assert.deepEqual(first, second);
    assert.equal(first.historicalWeeks[0]?.calendarId, "cal-a");
    assert.equal(first.historicalAssets[0]?.recencyWeight, 1);
    assert.equal(first.historicalWeeks[1]?.recencyWeight, 0.9);
  });

  it("skips malformed packages and unsupported schemas with diagnostics", () => {
    const context = buildGenerationContext();
    const memory = composeSocialPlannerSocialMemory({
      organizationId: TEST_ORG,
      rows: [
        buildHistoryRow({
          id: "malformed",
          createdAt: "2026-05-04T10:00:00.000Z",
          socialPackage: { not: "a package" },
        }),
        buildHistoryRow({
          id: "old-schema",
          createdAt: "2026-05-03T10:00:00.000Z",
          socialPackage: { schemaVersion: "social_calendar_package_v0", assets: [] },
        }),
        buildHistoryRow({
          id: "missing-fingerprints",
          createdAt: "2026-05-02T10:00:00.000Z",
          socialPackage: {
            schemaVersion: "social_calendar_package_v1",
            assets: [{ date: "2026-05-10", topic: "seo" }],
          },
        }),
        buildHistoryRow({
          id: "ready",
          createdAt: "2026-05-01T10:00:00.000Z",
          socialPackage: buildValidatedPackage(context, buildValidPackageRaw(context)),
        }),
      ],
    });

    assert.equal(memory.calendarsIncluded, 1);
    assert.equal(memory.historicalWeeks[0]?.calendarId, "ready");
    assert.equal(memory.diagnostics.malformedPackagesSkipped, 3);
    assert.ok(memory.diagnostics.invalidFingerprintRowsSkipped >= 1);
  });

  it("respects the Social Memory composed-text budget", () => {
    const context = buildGenerationContext();
    const ready = buildValidatedPackage(context);
    const bloated = structuredClone(ready);
    for (const asset of bloated.assets) {
      asset.creativeFingerprint.topic = `topic ${"alpha ".repeat(20)}`;
      asset.creativeFingerprint.angle = `angle ${"beta ".repeat(20)}`;
      asset.creativeFingerprint.hookNormalized = `hook ${"gamma ".repeat(20)}`;
    }

    const rows = Array.from({ length: 10 }, (_, index) =>
      buildHistoryRow({
        id: `long-${index}`,
        createdAt: `2026-05-${String(index + 1).padStart(2, "0")}T10:00:00.000Z`,
        socialPackage: bloated,
      }),
    );
    const memory = composeSocialPlannerSocialMemory({
      organizationId: TEST_ORG,
      rows,
    });

    assert.ok(
      memory.composedText.length <=
        SOCIAL_PLANNER_SOCIAL_MEMORY_BOUNDS.composedTextMaxChars,
    );
    assert.equal(
      memory.diagnostics.memoryCharacterCount,
      memory.composedText.length,
    );
    if (memory.diagnostics.truncated) {
      assert.ok(memory.composedText.endsWith("…"));
    }
  });

  it("wraps loader exceptions without exposing database errors", async () => {
    await assert.rejects(
      () =>
        loadSocialPlannerSocialMemory({
          organizationId: TEST_ORG,
          historyLoader: {
            async listReadyCalendars() {
              throw new Error("relation athena_social_calendars does not exist");
            },
          },
        }),
      (error: unknown) => {
        assert.ok(error instanceof SocialPlannerSocialMemoryError);
        assert.equal(error.reason, "LOADER_FAILED");
        assert.equal(error.retryable, true);
        assert.doesNotMatch(error.message, /athena_social_calendars|relation/);
        return true;
      },
    );
  });

  it("documents the Ready-history query shape without selecting star", () => {
    assert.equal(SOCIAL_PLANNER_HISTORY_TABLE, "athena_social_calendars");
    assert.equal(
      SOCIAL_PLANNER_HISTORY_SELECT,
      "id, organization_id, period_start, period_end, generation_mode, version_number, status, package_json, created_at",
    );
    assert.doesNotMatch(SOCIAL_PLANNER_HISTORY_SELECT, /\*/);
  });
});
