import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, it } from "node:test";
import {
  applyConsumeFreeStarter,
  applyPlanChange,
  applyReserveFreeStarter,
  emptyFreeStarterOrganizationState,
  type FreeStarterWorld,
} from "../../lib/organization/freeStarterReservation";
import { evaluateFreeSocialPlannerGeneration } from "../../lib/organization/freeSocialPlannerGeneration";
import { shouldShowFreeStarterExperience } from "../../lib/home/freeStarterHome";
import { presentFreeStarterHome } from "../../lib/home/freeStarterHome";
import { buildValidatedPackage } from "../socialPlanner/socialPlannerGenerationFixtures";

const ROOT = process.cwd();
const CAL_A = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";

function read(relativePath: string): string {
  return readFileSync(join(ROOT, relativePath), "utf8");
}

describe("FREE-5 Free → Full continuity", () => {
  it("keeps the same calendar, package, and consumption after upgrade", () => {
    const socialPackage = buildValidatedPackage();
    const world: FreeStarterWorld = {
      organization: {
        ...emptyFreeStarterOrganizationState(),
        status: "reserved",
        calendarId: CAL_A,
        reservedAt: 1_000,
        reservationToken: "token-1",
      },
      calendars: {
        [CAL_A]: {
          id: CAL_A,
          organizationId: "org-1",
          status: "Ready",
        },
      },
      jobs: [],
    };

    assert.deepEqual(applyConsumeFreeStarter({ world, calendarId: CAL_A }), {
      outcome: "consumed",
    });
    applyPlanChange({ world, nextPlan: "full" });

    assert.equal(world.organization.status, "consumed");
    assert.equal(world.organization.calendarId, CAL_A);

    const preview = presentFreeStarterHome({
      starterStatus: "consumed",
      calendarId: CAL_A,
      calendarStatus: "Ready",
      socialPackage,
    });
    assert.equal(preview.weekHref, `/social-planner/${CAL_A}`);
    assert.equal(preview.firstAsset?.assetType, socialPackage.assets[0].assetType);
    assert.equal(socialPackage.schemaVersion, "social_calendar_package_v1");
    assert.equal(socialPackage.assets.length, 7);

    assert.equal(
      shouldShowFreeStarterExperience({
        athenaPlan: "full",
        defineKind: "ready",
      }),
      false,
    );
    assert.deepEqual(
      evaluateFreeSocialPlannerGeneration({
        athenaPlan: "full",
        defineKind: "ready",
        starterStatus: "consumed",
      }),
      { allow: true },
    );
  });

  it("does not grant another starter if the organization later returns to Free", () => {
    const world: FreeStarterWorld = {
      organization: {
        status: "consumed",
        calendarId: CAL_A,
        reservedAt: null,
        reservationToken: null,
      },
      calendars: {},
      jobs: [],
    };
    applyPlanChange({ world, nextPlan: "free" });
    assert.equal(
      applyReserveFreeStarter({
        world,
        organizationId: "org-1",
        nowMs: Date.now(),
        nextToken: "again",
      }).outcome,
      "already_consumed",
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

    const sql = read(
      "supabase/migrations/20260917000001_add_organization_free_starter.sql",
    );
    assert.match(sql, /never cleared by product plan changes|never cleared by plan change/);
    assert.doesNotMatch(sql, /on update.*athena_plan/i);
    assert.doesNotMatch(
      read("services/athenaPlan.ts"),
      /free_starter_status|freeStarter/,
    );
    assert.doesNotMatch(
      read("services/organizationService.ts").slice(
        read("services/organizationService.ts").indexOf("export async function resolveAthenaPlan"),
      ),
      /free_starter_status/,
    );
  });
});
