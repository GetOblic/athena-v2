import "./socialPlannerTestEnv";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, it } from "node:test";
import { mapSocialCalendarRow } from "../../services/socialPlanner/socialCalendarMappers";
import {
  nextSocialCalendarFamilyVersion,
  resolveThinkDifferentlyLineage,
} from "../../services/socialPlanner/socialCalendarService";
import {
  assertSocialCalendarLineage,
  resolveSocialCalendarRootId,
} from "../../services/socialPlanner/socialCalendarTypes";
import { assertThinkDifferentlySourceEligible } from "../../services/socialPlanner/socialCalendarOrchestration";
import {
  SocialCalendarVersionAllocationError,
  ThinkDifferentlySourceError,
  isPostgresUniqueViolation,
} from "../../services/socialPlanner/thinkDifferently/socialPlannerThinkDifferentlyTypes";
import {
  TEST_ORG,
  TEST_PERIOD_END,
  TEST_PERIOD_START,
  buildGenerationContext,
  buildValidatedPackage,
} from "./socialPlannerGenerationFixtures";

const ROOT = process.cwd();

function read(relativePath: string): string {
  return readFileSync(join(ROOT, relativePath), "utf8");
}

function calendar(overrides: Partial<Record<string, unknown>> = {}) {
  return mapSocialCalendarRow({
    id: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa",
    organization_id: TEST_ORG,
    user_id: "user-1",
    period_start: TEST_PERIOD_START,
    period_end: TEST_PERIOD_END,
    user_guidance: "Focus this week on our new laser treatment.",
    generation_mode: "standard",
    source_calendar_id: null,
    root_calendar_id: null,
    version_number: 1,
    status: "Ready",
    generation_stage: "completed",
    package_json: buildValidatedPackage() as unknown as Record<string, unknown>,
    provenance_json: { generationMode: "standard" },
    calendar_context_json: buildGenerationContext().calendarContext as unknown as Record<
      string,
      unknown
    >,
    revision_context_json: null,
    error_code: null,
    error_message: null,
    created_at: "2026-08-20T00:00:00.000Z",
    updated_at: "2026-08-20T00:00:00.000Z",
    ...overrides,
  });
}

describe("Social Planner L8 lineage", () => {
  it("original standard calendars have version 1 and no source or root", () => {
    const original = calendar();
    assert.equal(original.generation_mode, "standard");
    assert.equal(original.source_calendar_id, null);
    assert.equal(original.root_calendar_id, null);
    assert.equal(original.version_number, 1);
    assert.equal(resolveSocialCalendarRootId(original), original.id);
    assertSocialCalendarLineage({
      generationMode: "standard",
      sourceCalendarId: null,
      rootCalendarId: null,
      versionNumber: 1,
    });
  });

  it("Think Differently from V1 sets source=root=V1 and version 2", () => {
    const v1 = calendar();
    const lineage = resolveThinkDifferentlyLineage(v1);
    assert.equal(lineage.sourceCalendarId, v1.id);
    assert.equal(lineage.rootCalendarId, v1.id);
    assert.equal(nextSocialCalendarFamilyVersion(1), 2);
  });

  it("Think Differently from V2 keeps immediate source and original root", () => {
    const v1Id = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
    const v2 = calendar({
      id: "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb",
      generation_mode: "think_differently",
      source_calendar_id: v1Id,
      root_calendar_id: v1Id,
      version_number: 2,
    });
    const lineage = resolveThinkDifferentlyLineage(v2);
    assert.equal(lineage.sourceCalendarId, v2.id);
    assert.equal(lineage.rootCalendarId, v1Id);
    assert.equal(nextSocialCalendarFamilyVersion(2), 3);
  });

  it("does not flatten source lineage", () => {
    const service = read("services/socialPlanner/socialCalendarService.ts");
    assert.match(service, /sourceCalendarId: source.id/);
    assert.match(service, /resolveSocialCalendarRootId\(source\)/);
    assert.doesNotMatch(service, /source_calendar_id: source.source_calendar_id/);
  });

  it("copies source period and frozen guidance onto the derivative", () => {
    const service = read("services/socialPlanner/socialCalendarService.ts");
    assert.match(service, /period_start: input.source.period_start/);
    assert.match(service, /period_end: input.source.period_end/);
    assert.match(service, /user_guidance: input.source.user_guidance/);
    assert.match(service, /generation_mode: "think_differently"/);
    assert.match(service, /package_json: null/);
    assert.match(service, /status: "Queued"/);
  });

  it("unique family index is the concurrency gate, not an application retry loop", () => {
    const migration = read(
      "supabase/migrations/20260819000001_create_athena_social_calendars.sql",
    );
    assert.match(migration, /athena_social_calendars_root_version_unique/);
    assert.match(
      migration,
      /on athena_social_calendars \(root_calendar_id, version_number\)/,
    );
    assert.match(migration, /where root_calendar_id is not null/);
    const service = read("services/socialPlanner/socialCalendarService.ts");
    assert.match(service, /isPostgresUniqueViolation/);
    assert.match(service, /SocialCalendarVersionAllocationError/);
    assert.doesNotMatch(service, /for \(let .* retry|while \(.*version/);
  });

  it("concurrent MAX\+1 allocations collide and map unique violations to VERSION_ALLOCATION_FAILED", () => {
    const first = nextSocialCalendarFamilyVersion(2);
    const second = nextSocialCalendarFamilyVersion(2);
    assert.equal(first, 3);
    assert.equal(second, 3);
    assert.equal(isPostgresUniqueViolation({ code: "23505" }), true);
    assert.equal(
      isPostgresUniqueViolation({
        message: "duplicate key value violates unique constraint",
      }),
      true,
    );
    assert.equal(isPostgresUniqueViolation({ code: "42501" }), false);
    const error = new SocialCalendarVersionAllocationError();
    assert.equal(error.code, "VERSION_ALLOCATION_FAILED");
  });

  it("rejects non-Ready and malformed Ready sources", () => {
    assert.throws(
      () => assertThinkDifferentlySourceEligible(calendar({ status: "Queued" })),
      (error: unknown) => {
        assert.ok(error instanceof ThinkDifferentlySourceError);
        assert.equal(error.code, "THINK_DIFFERENTLY_SOURCE_NOT_READY");
        assert.equal(error.httpStatus, 409);
        return true;
      },
    );
    assert.throws(
      () =>
        assertThinkDifferentlySourceEligible(
          calendar({ status: "Processing Failed", package_json: null }),
        ),
      ThinkDifferentlySourceError,
    );
    assert.throws(
      () =>
        assertThinkDifferentlySourceEligible(
          calendar({ package_json: { schemaVersion: "nope" } }),
        ),
      (error: unknown) => {
        assert.ok(error instanceof ThinkDifferentlySourceError);
        assert.equal(error.code, "THINK_DIFFERENTLY_SOURCE_PACKAGE_INVALID");
        return true;
      },
    );
    assert.doesNotThrow(() => assertThinkDifferentlySourceEligible(calendar()));
  });

  it("family version lookup stays organization-scoped", () => {
    const service = read("services/socialPlanner/socialCalendarService.ts");
    assert.match(service, /getSocialCalendarFamilyMaxVersion/);
    assert.match(service, /\.eq\("organization_id", input.organizationId\)/);
    assert.match(service, /\.eq\("root_calendar_id", input.rootCalendarId\)/);
  });
});
