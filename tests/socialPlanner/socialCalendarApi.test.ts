import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, it } from "node:test";
import {
  SOCIAL_CALENDAR_PUBLIC_FAILURE,
  toCreateSocialCalendarResponse,
  toSocialCalendarDetailDto,
  toSocialCalendarListItemDto,
} from "../../services/socialPlanner/socialCalendarDto";
import { mapSocialCalendarRow } from "../../services/socialPlanner/socialCalendarMappers";
import {
  summarizePersistedSocialCalendarPackage,
  tryParsePersistedSocialCalendarPackage,
} from "../../services/socialPlanner/socialCalendarPersistedPackage";
import {
  deriveSocialCalendarPeriodEnd,
  normalizeSocialCalendarCreateRequest,
} from "../../services/socialPlanner/socialCalendarRequest";
import {
  SOCIAL_CALENDAR_USER_GUIDANCE_MAX_CHARS,
  SocialCalendarGuidanceError,
  SocialCalendarLineageError,
  SocialCalendarPeriodError,
  type SocialCalendar,
} from "../../services/socialPlanner/socialCalendarTypes";
import {
  TEST_PERIOD_END,
  TEST_PERIOD_START,
  buildGenerationContext,
  buildValidatedPackage,
} from "./socialPlannerGenerationFixtures";

const ROOT = process.cwd();

function read(relativePath: string): string {
  return readFileSync(join(ROOT, relativePath), "utf8");
}

function calendarRow(overrides: Partial<Record<string, unknown>> = {}): SocialCalendar {
  return mapSocialCalendarRow({
    id: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa",
    organization_id: "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb",
    user_id: "cccccccc-cccc-4ccc-8ccc-cccccccccccc",
    period_start: TEST_PERIOD_START,
    period_end: TEST_PERIOD_END,
    user_guidance: null,
    generation_mode: "standard",
    source_calendar_id: null,
    root_calendar_id: null,
    version_number: 1,
    status: "Queued",
    generation_stage: "queued",
    package_json: null,
    provenance_json: {},
    calendar_context_json: {},
    error_code: null,
    error_message: null,
    created_at: "2026-08-20T00:00:00.000Z",
    updated_at: "2026-08-20T00:00:00.000Z",
    ...overrides,
  });
}

describe("Social Planner L6 API contracts", () => {
  it("list/create require current organization context and ignore browser ownership", () => {
    const route = read("app/api/social-planner/route.ts");
    assert.match(route, /requireCurrentOrganizationContext/);
    assert.match(route, /normalizeSocialCalendarCreateRequest/);
    assert.match(route, /createSocialCalendarWithJob/);
    assert.match(route, /listSocialCalendars\(organizationId\)/);
    assert.match(route, /202/);
    const request = read("services/socialPlanner/socialCalendarRequest.ts");
    assert.match(request, /organization_id: _organizationId/);
    assert.match(request, /organizationId: _organizationIdCamel/);
    assert.doesNotMatch(route, /requireLicensee|requireSuperAdmin|licensee_account_id/);
  });

  it("detail is org-scoped and returns foreign calendars as not found", () => {
    const route = read("app/api/social-planner/[id]/route.ts");
    assert.match(route, /requireCurrentOrganizationContext/);
    assert.match(route, /getSocialCalendarById\(id, organizationId\)/);
    assert.match(route, /NOT_FOUND/);
    assert.match(route, /404/);
    assert.doesNotMatch(route, /DELETE/);
    assert.doesNotMatch(route, /regenerate|think_differently|thinkDifferently/);
  });

  it("does not add regenerate routes and keeps conversation as an L9 route", () => {
    assert.equal(existsSync(join(ROOT, "app/api/social-planner/regenerate")), false);
    assert.equal(
      existsSync(join(ROOT, "app/api/social-planner/[id]/regenerate")),
      false,
    );
    assert.equal(
      existsSync(join(ROOT, "app/api/social-planner/[id]/conversation/route.ts")),
      true,
    );
    assert.equal(
      existsSync(join(ROOT, "app/api/social-planner/[id]/think-differently/route.ts")),
      true,
    );
  });

  it("create derives a seven-day period and accepts blank guidance", () => {
    const derived = normalizeSocialCalendarCreateRequest({
      periodStart: TEST_PERIOD_START,
      userGuidance: "   ",
    });
    assert.equal(derived.periodStart, TEST_PERIOD_START);
    assert.equal(derived.periodEnd, TEST_PERIOD_END);
    assert.equal(derived.userGuidance, null);
    assert.equal(derived.generationMode, "standard");
    assert.equal(deriveSocialCalendarPeriodEnd(TEST_PERIOD_START), TEST_PERIOD_END);
  });

  it("create verifies a client-supplied end date instead of trusting it", () => {
    assert.throws(
      () =>
        normalizeSocialCalendarCreateRequest({
          periodStart: TEST_PERIOD_START,
          periodEnd: "2026-05-20",
        }),
      SocialCalendarPeriodError,
    );
    const valid = normalizeSocialCalendarCreateRequest({
      periodStart: TEST_PERIOD_START,
      periodEnd: TEST_PERIOD_END,
    });
    assert.equal(valid.periodEnd, TEST_PERIOD_END);
  });

  it("rejects invalid periods and oversized guidance", () => {
    assert.throws(
      () => normalizeSocialCalendarCreateRequest({ periodStart: "2026-02-30" }),
      SocialCalendarPeriodError,
    );
    assert.throws(
      () => normalizeSocialCalendarCreateRequest({ periodStart: "next-monday" }),
      SocialCalendarPeriodError,
    );
    assert.throws(
      () =>
        normalizeSocialCalendarCreateRequest({
          periodStart: TEST_PERIOD_START,
          userGuidance: "x".repeat(SOCIAL_CALENDAR_USER_GUIDANCE_MAX_CHARS + 1),
        }),
      SocialCalendarGuidanceError,
    );
  });

  it("rejects unsupported generation modes and ignores browser org IDs", () => {
    assert.throws(
      () =>
        normalizeSocialCalendarCreateRequest({
          periodStart: TEST_PERIOD_START,
          generationMode: "think_differently",
        }),
      SocialCalendarLineageError,
    );
    const ignored = normalizeSocialCalendarCreateRequest({
      periodStart: TEST_PERIOD_START,
      organizationId: "browser-org",
      organization_id: "browser-org",
      userId: "browser-user",
      package_json: { injected: true },
      provenance_json: { injected: true },
      calendar_context_json: { injected: true },
      status: "Ready",
      version_number: 99,
    });
    assert.equal(ignored.generationMode, "standard");
    assert.equal(ignored.periodStart, TEST_PERIOD_START);
  });

  it("create response is thin and omits internals", () => {
    const created = toCreateSocialCalendarResponse(calendarRow());
    assert.deepEqual(Object.keys(created).sort(), [
      "createdAt",
      "generationMode",
      "id",
      "periodEnd",
      "periodStart",
      "status",
      "versionNumber",
    ]);
    assert.equal("package" in created, false);
    assert.equal("provenanceJson" in created, false);
    assert.equal("claimToken" in created, false);
  });

  it("history summarizes Ready packages without returning seven assets", () => {
    const context = buildGenerationContext();
    const socialPackage = buildValidatedPackage(context);
    const item = toSocialCalendarListItemDto(
      calendarRow({
        status: "Ready",
        package_json: socialPackage,
      }),
    );
    assert.equal(item.assetCount, 7);
    assert.equal(typeof item.strategySummary, "string");
    assert.equal(item.error, null);
    assert.equal("package" in item, false);
    assert.ok((item.whyThisWeekWorks ?? "").length <= 181);
  });

  it("history orders contract newest-first with a bounded limit", () => {
    const service = read("services/socialPlanner/socialCalendarService.ts");
    assert.match(service, /order\("created_at", \{ ascending: false \}\)/);
    assert.match(service, /SOCIAL_CALENDAR_HISTORY_LIMIT = 50/);
    assert.match(service, /\.eq\("organization_id", organizationId\)/);
    assert.match(service, /\.limit\(limit\)/);
  });

  it("detail Ready returns a validated package; queued has none; failed is sanitized", () => {
    const context = buildGenerationContext();
    const socialPackage = buildValidatedPackage(context);
    const ready = toSocialCalendarDetailDto(
      calendarRow({
        status: "Ready",
        package_json: socialPackage,
      }),
    );
    assert.equal(ready.package?.schemaVersion, "social_calendar_package_v1");
    assert.equal(ready.packageUnavailable, false);
    assert.equal(ready.error, null);

    const queued = toSocialCalendarDetailDto(calendarRow());
    assert.equal(queued.package, null);
    assert.equal(queued.packageUnavailable, false);
    assert.equal(queued.error, null);

    const failed = toSocialCalendarDetailDto(
      calendarRow({
        status: "Processing Failed",
        error_code: "PROVIDER_FAILURE",
        error_message: "OpenRouter 429 rate limit body",
      }),
    );
    assert.equal(failed.package, null);
    assert.deepEqual(failed.error, SOCIAL_CALENDAR_PUBLIC_FAILURE);
    assert.doesNotMatch(JSON.stringify(failed), /OpenRouter|429|rate limit/i);

    const validationFailed = toSocialCalendarDetailDto(
      calendarRow({
        status: "Processing Failed",
        error_code: "REPAIR_VALIDATION_FAILED",
        error_message: "assets[0].productionSpec.slides must be an array.",
      }),
    );
    assert.deepEqual(validationFailed.error, SOCIAL_CALENDAR_PUBLIC_FAILURE);
    assert.doesNotMatch(
      JSON.stringify(validationFailed),
      /productionSpec|slides must be an array|failures/i,
    );
    assert.equal("error_metadata" in validationFailed, false);

    const revisionFailed = toSocialCalendarDetailDto(
      calendarRow({
        status: "Processing Failed",
        error_code: "CONVERSATION_REVISION_REPAIR_FAILED",
        error_message: "assets[0].audience is required.",
      }),
    );
    assert.deepEqual(revisionFailed.error, SOCIAL_CALENDAR_PUBLIC_FAILURE);
    assert.doesNotMatch(
      JSON.stringify(revisionFailed),
      /audience is required|productionSpec|failures/i,
    );
  });

  it("malformed Ready packages fail safely", () => {
    const detail = toSocialCalendarDetailDto(
      calendarRow({
        status: "Ready",
        package_json: { schemaVersion: "not-a-package" },
      }),
    );
    assert.equal(detail.package, null);
    assert.equal(detail.packageUnavailable, true);
    assert.equal(tryParsePersistedSocialCalendarPackage({ foo: 1 }), null);
    const summary = summarizePersistedSocialCalendarPackage({
      strategySummary: "Keep the week useful.",
      assets: [{ assetType: "poll" }],
    });
    assert.equal(summary.assetCount, 1);
    assert.deepEqual(summary.assetTypes, ["poll"]);
  });
});
