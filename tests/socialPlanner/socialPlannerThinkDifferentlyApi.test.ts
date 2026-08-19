import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, it } from "node:test";
import {
  SocialCalendarRequestError,
  normalizeSocialCalendarCreateRequest,
  normalizeThinkDifferentlyRequest,
} from "../../services/socialPlanner/socialCalendarRequest";
import { SocialCalendarLineageError } from "../../services/socialPlanner/socialCalendarTypes";
import { TEST_PERIOD_START } from "./socialPlannerGenerationFixtures";

const ROOT = process.cwd();

function read(relativePath: string): string {
  return readFileSync(join(ROOT, relativePath), "utf8");
}

describe("Social Planner L8 Think Differently API", () => {
  it("adds an org-scoped POST under the source calendar id", () => {
    const route = read("app/api/social-planner/[id]/think-differently/route.ts");
    assert.match(route, /requireCurrentOrganizationContext/);
    assert.match(route, /getSocialCalendarById\(id, organizationId\)/);
    assert.match(route, /createThinkDifferentlyCalendarWithJob/);
    assert.match(route, /normalizeThinkDifferentlyRequest/);
    assert.match(route, /202/);
    assert.match(route, /toCreateSocialCalendarResponse/);
    assert.doesNotMatch(route, /organizationId: body/);
    assert.doesNotMatch(route, /generateThinkDifferentlySocialCalendar/);
    assert.doesNotMatch(route, /generateSocialCalendarPackage/);
    assert.equal(
      existsSync(join(ROOT, "app/api/social-planner/[id]/think-differently/route.ts")),
      true,
    );
  });

  it("rejects unauthenticated callers and foreign sources as not found", () => {
    const route = read("app/api/social-planner/[id]/think-differently/route.ts");
    assert.match(route, /OrganizationAccessError/);
    assert.match(route, /UNAUTHORIZED/);
    assert.match(route, /401/);
    assert.match(route, /NOT_FOUND/);
    assert.match(route, /404/);
    assert.match(route, /if \(!source\)/);
  });

  it("rejects injected version, root, mode, period, and package fields", () => {
    assert.throws(
      () =>
        normalizeThinkDifferentlyRequest({
          versionNumber: 9,
        }),
      SocialCalendarRequestError,
    );
    assert.throws(
      () =>
        normalizeThinkDifferentlyRequest({
          generationMode: "standard",
        }),
      SocialCalendarRequestError,
    );
    assert.throws(
      () =>
        normalizeThinkDifferentlyRequest({
          periodStart: TEST_PERIOD_START,
        }),
      SocialCalendarRequestError,
    );
    assert.throws(
      () =>
        normalizeThinkDifferentlyRequest({
          rootCalendarId: "injected",
        }),
      SocialCalendarRequestError,
    );
    assert.doesNotThrow(() => normalizeThinkDifferentlyRequest({}));
  });

  it("does not let POST \/api\/social-planner start Think Differently", () => {
    assert.throws(
      () =>
        normalizeSocialCalendarCreateRequest({
          periodStart: TEST_PERIOD_START,
          generationMode: "think_differently",
        }),
      SocialCalendarLineageError,
    );
    const createRoute = read("app/api/social-planner/route.ts");
    assert.doesNotMatch(createRoute, /think_differently/);
    assert.match(createRoute, /createSocialCalendarWithJob/);
  });

  it("returns the thin create DTO and no package", () => {
    const route = read("app/api/social-planner/[id]/think-differently/route.ts");
    assert.match(route, /toCreateSocialCalendarResponse/);
    assert.doesNotMatch(route, /toSocialCalendarDetailDto/);
    assert.doesNotMatch(route, /package_json/);
    assert.doesNotMatch(route, /provenance_json/);
  });

  it("maps source eligibility and version races to safe public errors", () => {
    const route = read("app/api/social-planner/[id]/think-differently/route.ts");
    assert.match(route, /THINK_DIFFERENTLY_SOURCE_NOT_READY|ThinkDifferentlySourceError/);
    assert.match(route, /VERSION_ALLOCATION_FAILED|SocialCalendarVersionAllocationError/);
    assert.match(route, /409/);
    assert.match(route, /Failed to start Think Differently/);
  });

  it("does not add regenerate endpoints", () => {
    assert.equal(existsSync(join(ROOT, "app/api/social-planner/regenerate")), false);
    assert.equal(
      existsSync(join(ROOT, "app/api/social-planner/[id]/regenerate")),
      false,
    );
  });
});
