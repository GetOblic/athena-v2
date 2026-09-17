import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, it } from "node:test";
import {
  evaluateFreeVisibilityGeneration,
} from "../../lib/organization/freeVisibilityGeneration";

const ROOT = process.cwd();

function read(relativePath: string): string {
  return readFileSync(join(ROOT, relativePath), "utf8");
}

function sliceFn(source: string, startMarker: string, endMarker?: string): string {
  const start = source.indexOf(startMarker);
  assert.ok(start >= 0, startMarker);
  const end = endMarker
    ? source.indexOf(endMarker, start + startMarker.length)
    : source.length;
  assert.ok(end > start, endMarker ?? "end");
  return source.slice(start, end);
}

describe("FREE-9 Visibility creation API", () => {
  it("reserves before createSeoReport and enqueue, then binds the report", () => {
    const orchestration = read("services/seo/freeVisibilityOrchestration.ts");
    const createFn = sliceFn(
      orchestration,
      "export async function createFreeVisibilitySeoReportWithJob",
      "export async function retryFreeVisibilitySeoReport",
    );
    assert.ok(
      createFn.indexOf("reserveFreeVisibility") <
        createFn.indexOf("createSeoReport"),
    );
    assert.ok(
      createFn.indexOf("reserveFreeVisibility") <
        createFn.indexOf("enqueueSeoGenerationJob"),
    );
    assert.ok(
      createFn.indexOf("createSeoReport") <
        createFn.indexOf("bindFreeVisibilityReport"),
    );
    assert.ok(
      createFn.indexOf("bindFreeVisibilityReport") <
        createFn.indexOf("enqueueSeoGenerationJob"),
    );
    assert.match(createFn, /generationType: "intelligence"/);
    assert.doesNotMatch(createFn, /createSeoReportWithJob/);
  });

  it("direct POST uses the existing /api/seo path and cannot inject org or plan", () => {
    const route = read("app/api/seo/route.ts");
    assert.match(route, /assertCurrentFreeVisibilityGeneration/);
    assert.match(route, /action: "create"/);
    assert.match(route, /createFreeVisibilitySeoReportWithJob/);
    assert.match(route, /createSeoReportWithJob/);
    assert.match(route, /organization_id: _organizationId/);
    assert.match(route, /organizationId: _organizationIdCamel/);
    assert.doesNotMatch(route, /body\.athenaPlan|body\.athena_plan|allowance/);
  });

  it("technical is denied before a Free report or job can be created", () => {
    const decision = evaluateFreeVisibilityGeneration({
      athenaPlan: "free",
      defineKind: "ready",
      generationType: "technical",
      action: "create",
    });
    assert.equal(decision.allow, false);
    if (decision.allow) return;
    assert.equal(decision.code, "FREE_VISIBILITY_TECHNICAL");

    const route = read("app/api/seo/route.ts");
    const post = sliceFn(route, "export async function POST", "catch (error)");
    assert.ok(
      post.indexOf("assertCurrentFreeVisibilityGeneration") <
        post.indexOf("createFreeVisibilitySeoReportWithJob"),
    );
    assert.match(post, /generationType: brief.generationType/);
  });
});

describe("FREE-9 Visibility retry and regenerate", () => {
  it("allows /generate only on the bound starter report", () => {
    assert.deepEqual(
      evaluateFreeVisibilityGeneration({
        athenaPlan: "free",
        defineKind: "ready",
        visibilityStatus: "reserved",
        action: "generate",
        reportId: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa",
        boundReportId: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa",
      }),
      { allow: true },
    );
    assert.equal(
      evaluateFreeVisibilityGeneration({
        athenaPlan: "free",
        defineKind: "ready",
        visibilityStatus: "reserved",
        action: "generate",
        reportId: "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb",
        boundReportId: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa",
      }).allow,
      false,
    );
  });

  it("always denies Free /regenerate and leaves Full regenerate unchanged", () => {
    assert.equal(
      evaluateFreeVisibilityGeneration({
        athenaPlan: "free",
        defineKind: "ready",
        visibilityStatus: "available",
        action: "regenerate",
      }).allow,
      false,
    );
    assert.deepEqual(
      evaluateFreeVisibilityGeneration({
        athenaPlan: "full",
        action: "regenerate",
      }),
      { allow: true },
    );

    const regenerate = read("app/api/seo/[id]/regenerate/route.ts");
    assert.match(regenerate, /action: "regenerate"/);
    assert.match(regenerate, /regenerateSeoReport/);
    const generate = read("app/api/seo/[id]/generate/route.ts");
    assert.match(generate, /retryFreeVisibilitySeoReport/);
    assert.match(generate, /enqueueGenerationForExistingReport/);
  });

  it("retry enqueue does not create another seo_report", () => {
    const retry = sliceFn(
      read("services/seo/freeVisibilityOrchestration.ts"),
      "export async function retryFreeVisibilitySeoReport",
    );
    assert.match(retry, /enqueueGenerationForExistingReport/);
    assert.doesNotMatch(retry, /createSeoReport\(/);
    assert.doesNotMatch(retry, /createSeoReportWithJob/);
  });
});

describe("FREE-9 Visibility worker consume / release", () => {
  it("hooks consume and release only at the existing SEO job boundary", () => {
    const sql = read(
      "supabase/migrations/20260917000003_add_organization_free_visibility.sql",
    );
    const complete = sliceFn(
      sql,
      "create or replace function complete_athena_seo_generation_job",
      "create or replace function fail_athena_seo_generation_job",
    );
    assert.match(complete, /status = 'Ready'/);
    assert.match(
      complete,
      /perform consume_athena_free_visibility\(v_job\.organization_id, v_job\.report_id\)/,
    );
    assert.doesNotMatch(complete, /athena_plan/);
    assert.doesNotMatch(complete, /openrouter|prompt/i);

    const executor = read(
      "services/seo/seoGenerationJobs/seoGenerationJobExecutor.ts",
    );
    assert.match(executor, /runSeoGenerationPipeline/);
    assert.doesNotMatch(executor, /free_visibility|athenaPlan|reserveFreeVisibility/);
  });

  it("does not alter Full create / generate / regenerate orchestration", () => {
    const orchestration = read("services/seo/seoReportOrchestration.ts");
    assert.match(orchestration, /export async function createSeoReportWithJob/);
    assert.match(orchestration, /export async function regenerateSeoReport/);
    assert.doesNotMatch(orchestration, /free_visibility|reserveFreeVisibility/);
    assert.match(orchestration, /Regenerate creates a NEW report row/);
  });

  it("does not load Free Visibility columns on Full create or /seo reads", () => {
    const guard = read(
      "services/organization/freeVisibilityGenerationGuard.ts",
    );
    const pageState = read("services/seo/freeVisibilityPageState.ts");
    const loadContext = guard.slice(
      guard.indexOf("export const loadFreeVisibilityGenerationContext"),
    );
    assert.ok(
      loadContext.indexOf("resolveAthenaPlan") <
        loadContext.indexOf("loadFreeVisibilityAuthority"),
    );
    assert.match(guard, /athenaPlan === "free"/);
    assert.match(pageState, /athenaPlan !== "free"/);
    const loadFn = pageState.slice(
      pageState.indexOf("export async function loadFreeVisibilityPageState"),
    );
    assert.ok(
      loadFn.indexOf('presentation: "full"') <
        loadFn.indexOf("loadFreeVisibilityAuthority"),
    );
  });
});
