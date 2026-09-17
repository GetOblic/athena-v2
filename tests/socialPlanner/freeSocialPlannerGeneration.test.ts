import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, it } from "node:test";
import {
  evaluateFreeSocialPlannerGeneration,
  FreeSocialPlannerGenerationError,
} from "../../lib/organization/freeSocialPlannerGeneration";
import { freeStarterPeriodStartUtc } from "../../lib/organization/freeStarter";
import { deriveSocialCalendarPeriodEnd } from "../../services/socialPlanner/socialCalendarRequest";

const ROOT = process.cwd();

function read(relativePath: string): string {
  return readFileSync(join(ROOT, relativePath), "utf8");
}

const COST_ROUTES = [
  "app/api/social-planner/route.ts",
  "app/api/social-planner/evergreen/route.ts",
  "app/api/social-planner/[id]/think-differently/route.ts",
  "app/api/social-planner/[id]/conversation/apply/route.ts",
  "app/api/social-planner/[id]/conversation/route.ts",
] as const;

describe("FREE-5 Social Planner generation policy", () => {
  it("lets Full through and blocks Free except the authorized starter create", () => {
    assert.deepEqual(
      evaluateFreeSocialPlannerGeneration({
        athenaPlan: "full",
        defineKind: "ready",
        starterStatus: "available",
      }),
      { allow: true },
    );
    assert.equal(
      evaluateFreeSocialPlannerGeneration({
        athenaPlan: "free",
        defineKind: "needs_setup",
        starterStatus: "available",
      }).allow,
      false,
    );
    assert.equal(
      evaluateFreeSocialPlannerGeneration({
        athenaPlan: "free",
        defineKind: "ready",
        starterStatus: "available",
      }).allow,
      false,
    );
    assert.deepEqual(
      evaluateFreeSocialPlannerGeneration({
        athenaPlan: "free",
        defineKind: "ready",
        starterStatus: "available",
        authorizedStarter: true,
      }),
      { allow: true },
    );
    assert.equal(
      evaluateFreeSocialPlannerGeneration({
        athenaPlan: "free",
        defineKind: "ready",
        starterStatus: "reserved",
        authorizedStarter: true,
      }).allow,
      false,
    );
    assert.equal(
      evaluateFreeSocialPlannerGeneration({
        athenaPlan: "free",
        defineKind: "ready",
        starterStatus: "consumed",
        authorizedStarter: true,
      }).allow,
      false,
    );

    try {
      throw new FreeSocialPlannerGenerationError("FREE_STARTER_CONFLICT");
    } catch (error) {
      assert.ok(error instanceof FreeSocialPlannerGenerationError);
      assert.equal(error.httpStatus, 409);
    }
  });

  it("gates every generation or cost Social Planner POST and leaves GET reads open", () => {
    for (const file of COST_ROUTES) {
      const source = read(file);
      assert.match(source, /assertCurrentFreeSocialPlannerGeneration/);
      assert.match(source, /FreeSocialPlannerGenerationError/);
    }

    const daily = read("app/api/social-planner/route.ts");
    const dailyGet = daily.slice(
      daily.indexOf("export async function GET"),
      daily.indexOf("export async function POST"),
    );
    const dailyPost = daily.slice(daily.indexOf("export async function POST"));
    assert.doesNotMatch(dailyGet, /assertCurrentFreeSocialPlannerGeneration/);
    assert.match(dailyPost, /assertCurrentFreeSocialPlannerGeneration/);

    const conversation = read("app/api/social-planner/[id]/conversation/route.ts");
    const getFn = conversation.slice(
      conversation.indexOf("export async function GET"),
      conversation.indexOf("export async function POST"),
    );
    const postFn = conversation.slice(conversation.indexOf("export async function POST"));
    assert.doesNotMatch(getFn, /assertCurrentFreeSocialPlannerGeneration/);
    assert.match(postFn, /assertCurrentFreeSocialPlannerGeneration/);

    const detail = read("app/api/social-planner/[id]/route.ts");
    assert.doesNotMatch(detail, /assertCurrentFreeSocialPlannerGeneration/);
  });

  it("uses a dedicated starter POST that reserves before creating a normal Daily week", () => {
    assert.equal(
      existsSync(join(ROOT, "app/api/social-planner/free-starter/route.ts")),
      true,
    );
    const route = read("app/api/social-planner/free-starter/route.ts");
    const orchestration = read(
      "services/socialPlanner/socialCalendarOrchestration.ts",
    );
    assert.match(route, /authorizedStarter: true/);
    assert.match(route, /reserveFreeStarter\(organizationId\)/);
    assert.match(route, /createFreeStarterDailySocialCalendar/);
    assert.match(route, /202/);
    assert.match(orchestration, /createSocialCalendar\(/);
    assert.match(orchestration, /plannerKind: "daily_social"/);
    assert.match(orchestration, /bindFreeStarterCalendar/);
    assert.match(orchestration, /enqueueCreatedSocialCalendar/);
    assert.match(orchestration, /userGuidance: null/);
    assert.match(orchestration, /targetPersonaId: null/);
    assert.doesNotMatch(orchestration.slice(orchestration.indexOf("createFreeStarterDailySocialCalendar")), /personaId: "create"/);
    assert.doesNotMatch(route, /normalizeSocialCalendarCreateRequest/);

    const start = freeStarterPeriodStartUtc(new Date("2026-09-17T08:00:00.000Z"));
    assert.equal(start, "2026-09-17");
    assert.equal(deriveSocialCalendarPeriodEnd(start), "2026-09-23");
  });

  it("does not write starter labels into package_json and consumes only after Ready", () => {
    const create = read("services/socialPlanner/socialCalendarService.ts");
    const createFn = create.slice(create.indexOf("export async function createSocialCalendar"));
    assert.match(createFn, /generation_mode: "standard"/);
    assert.doesNotMatch(createFn, /free|starter|trial|freemium/);

    const jobs = read(
      "services/socialPlanner/socialCalendarGenerationJobs/socialCalendarGenerationJobService.ts",
    );
    const completeFn = jobs.slice(
      jobs.indexOf("export async function completeSocialCalendarGenerationJobWithClaim"),
      jobs.indexOf("export async function failSocialCalendarGenerationJobWithClaim"),
    );
    const failFn = jobs.slice(
      jobs.indexOf("export async function failSocialCalendarGenerationJobWithClaim"),
    );
    assert.match(completeFn, /consumeFreeStarterIfReserved/);
    assert.doesNotMatch(completeFn, /releaseFreeStarterIfReserved/);
    assert.match(failFn, /job\?\.status === "failed"/);
    assert.match(failFn, /releaseFreeStarterIfReserved/);
  });
});
