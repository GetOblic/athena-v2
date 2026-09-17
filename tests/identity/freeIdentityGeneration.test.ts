/**
 * FREE-7 — Identity cost policy: first Train free, Retrain / Deep Scrape protected.
 */

import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, it } from "node:test";
import { hasSuccessfulAthenaTraining } from "../../components/identity/identityPagePresentation";
import {
  assertFreeIdentityGenerationAllowed,
  evaluateFreeIdentityGeneration,
  FreeIdentityGenerationError,
  isFreeIdentityGenerationLocked,
  isIdentityBrainObtained,
} from "../../lib/organization/freeIdentityGeneration";
import type { AthenaIdentity } from "../../services/identity/identityService";

const ROOT = process.cwd();

function read(relativePath: string): string {
  return readFileSync(join(ROOT, relativePath), "utf8");
}

function sliceFn(source: string, startMarker: string, endMarker?: string): string {
  const start = source.indexOf(startMarker);
  assert.ok(start >= 0, startMarker);
  const end = endMarker ? source.indexOf(endMarker, start + startMarker.length) : source.length;
  assert.ok(end > start, endMarker ?? "end");
  return source.slice(start, end);
}

const STARTER_STATUSES = ["available", "reserved", "consumed"] as const;

function sampleIdentity(
  overrides: Partial<AthenaIdentity> = {},
): AthenaIdentity {
  return {
    id: "id-1",
    user_id: "user-1",
    organization_id: "org-1",
    greeting_name: "Laurent",
    about_you: "voice",
    expertise: "knowledge",
    website: "https://example.com",
    brain_status: "ready",
    brain_last_updated: "2026-09-17T12:00:00.000Z",
    master_profile: { executive_intelligence: { executive_summary: "Clinic" } },
    master_profile_version: "1",
    master_profile_generated_at: "2026-09-17T12:00:00.000Z",
    created_at: "2026-09-01T00:00:00.000Z",
    updated_at: "2026-09-17T12:00:00.000Z",
    ...overrides,
  };
}

describe("FREE-7 Identity generation policy", () => {
  it("lets Full Train, Retrain, and Deep Scrape through", () => {
    assert.deepEqual(
      evaluateFreeIdentityGeneration({
        athenaPlan: "full",
        trained: false,
      }),
      { allow: true },
    );
    assert.deepEqual(
      evaluateFreeIdentityGeneration({
        athenaPlan: "full",
        trained: true,
      }),
      { allow: true },
    );
    assert.equal(
      isFreeIdentityGenerationLocked({ athenaPlan: "full", trained: true }),
      false,
    );
  });

  it("lets first Free Train through and denies trained Free Retrain / Deep Scrape", () => {
    assert.deepEqual(
      evaluateFreeIdentityGeneration({
        athenaPlan: "free",
        trained: false,
      }),
      { allow: true },
    );
    assert.equal(
      isFreeIdentityGenerationLocked({ athenaPlan: "free", trained: false }),
      false,
    );

    const denied = evaluateFreeIdentityGeneration({
      athenaPlan: "free",
      trained: true,
    });
    assert.equal(denied.allow, false);
    if (!denied.allow) {
      assert.equal(denied.code, "FREE_IDENTITY_ALREADY_TRAINED");
      assert.equal(denied.httpStatus, 403);
      assert.doesNotMatch(denied.message, /upgrade|price|subscription|plan/i);
    }
    assert.equal(
      isFreeIdentityGenerationLocked({ athenaPlan: "free", trained: true }),
      true,
    );

    try {
      assertFreeIdentityGenerationAllowed({
        athenaPlan: "free",
        trained: true,
      });
      assert.fail("expected trained Free deny");
    } catch (error) {
      assert.ok(error instanceof FreeIdentityGenerationError);
      assert.equal(error.code, "FREE_IDENTITY_ALREADY_TRAINED");
      assert.equal(error.httpStatus, 403);
    }
  });

  it("does not depend on starter lifecycle", () => {
    for (const starterStatus of STARTER_STATUSES) {
      void starterStatus;
      assert.equal(
        evaluateFreeIdentityGeneration({
          athenaPlan: "free",
          trained: true,
        }).allow,
        false,
      );
      assert.equal(
        evaluateFreeIdentityGeneration({
          athenaPlan: "free",
          trained: false,
        }).allow,
        true,
      );
    }

    const policy = read("lib/organization/freeIdentityGeneration.ts");
    assert.doesNotMatch(policy, /starterStatus|free_starter|isFreeTrained|isFreeStarter/);
    assert.doesNotMatch(policy, /email|specimen|created_at|localStorage|cookie/i);
  });

  it("restores Retrain and Deep Scrape when the same trained org becomes Full", () => {
    const trained = true;
    assert.equal(
      evaluateFreeIdentityGeneration({ athenaPlan: "free", trained }).allow,
      false,
    );
    assert.deepEqual(
      evaluateFreeIdentityGeneration({ athenaPlan: "full", trained }),
      { allow: true },
    );
  });

  it("treats Brain obtained the same way Identity already does", () => {
    assert.equal(isIdentityBrainObtained(null), false);
    assert.equal(isIdentityBrainObtained(undefined), false);
    assert.equal(
      isIdentityBrainObtained(
        sampleIdentity({
          brain_status: "pending",
          master_profile: null,
          brain_last_updated: null,
        }),
      ),
      false,
    );
    assert.equal(isIdentityBrainObtained(sampleIdentity()), true);
    assert.equal(
      isIdentityBrainObtained(sampleIdentity()),
      hasSuccessfulAthenaTraining(sampleIdentity()),
    );
    assert.equal(
      isIdentityBrainObtained(
        sampleIdentity({
          brain_status: "processing",
          master_profile: { homepage_learning: "kept" },
        }),
      ),
      true,
    );
  });
});

describe("FREE-7 Identity generation server gates", () => {
  it("lets first Free Train reach the existing compile path", () => {
    const service = read("services/identity/identityService.ts");
    const upsert = sliceFn(
      service,
      "export async function upsertAthenaIdentity",
    );
    assert.match(upsert, /assertFreeIdentityGenerationAllowed/);
    assert.match(upsert, /isIdentityBrainObtained\(existing\)/);
    assert.match(upsert, /resolveAthenaPlan\(input\.organizationId\)/);
    assert.ok(
      upsert.indexOf("assertFreeIdentityGenerationAllowed") <
        upsert.indexOf(".upsert("),
    );
    assert.ok(
      upsert.indexOf(".upsert(") <
        upsert.indexOf("return compileMasterIdentityProfile(data"),
    );
    assert.match(upsert, /return compileMasterIdentityProfile\(data/);
    assert.doesNotMatch(upsert, /free compile|compileFree|starter/i);

    const compile = sliceFn(
      service,
      "export async function compileMasterIdentityProfile",
      "export async function upsertAthenaIdentity",
    );
    assert.doesNotMatch(compile, /assertFreeIdentityGenerationAllowed|FreeIdentityGeneration/);
    assert.match(compile, /generateReview/);
  });

  it("denies trained Free Retrain before upsert, compile, or generateReview", () => {
    const page = read("app/identity/page.tsx");
    const save = sliceFn(
      page,
      "async function saveIdentity",
      "async function saveBrandIdentity",
    );
    assert.match(save, /assertCurrentFreeIdentityGeneration/);
    assert.match(save, /FreeIdentityGenerationError/);
    assert.ok(
      save.indexOf("assertCurrentFreeIdentityGeneration") <
        save.indexOf("upsertAthenaIdentity"),
    );
    assert.ok(
      save.indexOf("upsertAthenaIdentity") <
        save.indexOf('redirect("/identity?saved=true")'),
    );
    assert.match(save, /redirect\("\/identity"\)/);
    assert.doesNotMatch(save, /generateReview|compileMasterIdentityProfile/);

    const brand = sliceFn(
      page,
      "async function saveBrandIdentity",
      "async function saveAiWorkspacePreferences",
    );
    assert.doesNotMatch(brand, /assertCurrentFreeIdentityGeneration|FreeIdentityGeneration/);
    assert.doesNotMatch(brand, /upsertAthenaIdentity|compileMasterIdentityProfile/);
  });

  it("denies trained Free Deep Scrape after Brain-ready and before crawl, job, or compile", () => {
    const route = read("app/api/identity/deep-scrape/route.ts");
    const post = sliceFn(route, "export async function POST");
    assert.match(post, /brain_status !== "ready"/);
    assert.match(post, /BRAIN_NOT_READY/);
    assert.match(post, /assertCurrentFreeIdentityGeneration/);
    assert.match(route, /FreeIdentityGenerationError/);
    assert.ok(
      post.indexOf("BRAIN_NOT_READY") <
        post.indexOf("assertCurrentFreeIdentityGeneration"),
    );
    assert.ok(
      post.indexOf("assertCurrentFreeIdentityGeneration") <
        post.indexOf("normalizeRootWebsiteUrl(identity.website)"),
    );
    assert.ok(
      post.indexOf("assertCurrentFreeIdentityGeneration") <
        post.indexOf("enqueueBrainDeepScrapeJob"),
    );
    assert.doesNotMatch(post, /runDeepWebsiteCrawl|compileMasterIdentityProfile|generateReview/);
    assert.doesNotMatch(route, /upgrade|price|subscription/i);

    const status = read("app/api/identity/deep-scrape/status/route.ts");
    assert.doesNotMatch(status, /assertCurrentFreeIdentityGeneration|FreeIdentityGeneration/);
  });

  it("leaves Full Identity compile and Deep Scrape paths on the existing functions", () => {
    const service = read("services/identity/identityService.ts");
    assert.match(service, /return compileMasterIdentityProfile\(data, input\.organizationId\)/);
    assert.match(service, /generationKind:\s*["']identity_profile["']/);

    const page = read("app/identity/page.tsx");
    assert.match(page, /upsertAthenaIdentity/);
    assert.doesNotMatch(page, /compileMasterIdentityProfile|generateReview/);

    const executor = read(
      "services/websiteLearning/deepScrape/deepScrapeExecutor.ts",
    );
    assert.match(executor, /compileMasterIdentityProfile/);
    assert.doesNotMatch(executor, /assertCurrentFreeIdentityGeneration|FreeIdentityGeneration/);
  });

  it("does not touch Social Planner policy, Licensee, auth, or migrations", () => {
    const socialPolicy = read("lib/organization/freeSocialPlannerGeneration.ts");
    const socialGuard = read(
      "services/organization/freeSocialPlannerGenerationGuard.ts",
    );
    assert.doesNotMatch(socialPolicy, /freeIdentityGeneration|FREE_IDENTITY/);
    assert.doesNotMatch(socialGuard, /freeIdentityGeneration|FREE_IDENTITY/);
    assert.doesNotMatch(
      read("lib/organization/freeIdentityGeneration.ts"),
      /evaluateFreeSocialPlannerGeneration|free_starter/,
    );
    assert.doesNotMatch(
      read("middleware.ts"),
      /freeIdentityGeneration|assertCurrentFreeIdentityGeneration/,
    );
    assert.doesNotMatch(
      read("services/athenaPlan.ts"),
      /freeIdentityGeneration|FREE_IDENTITY/,
    );
  });
});
