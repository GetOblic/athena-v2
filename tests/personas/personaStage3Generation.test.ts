import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, it } from "node:test";
import {
  resolvePersonaDisplayReadiness,
  resolvePersonaDisplayStatus,
} from "../../services/personas/personaDisplay";

const ROOT = join(process.cwd());

function read(relativePath: string): string {
  return readFileSync(join(ROOT, relativePath), "utf8");
}

describe("persona stage-3 display status", () => {
  it("keeps Profile Created for ungenerated Queued Personas", () => {
    assert.equal(resolvePersonaDisplayReadiness("Queued"), "Profile Created");
    assert.equal(
      resolvePersonaDisplayStatus({ personaStatus: "Queued" }),
      "Profile Created",
    );
  });

  it("maps job states and Stage 4 Ready after Current publication", () => {
    assert.equal(
      resolvePersonaDisplayStatus({
        personaStatus: "Queued",
        jobStatus: "queued",
      }),
      "Queued",
    );
    assert.equal(
      resolvePersonaDisplayStatus({
        personaStatus: "Queued",
        jobStatus: "processing",
      }),
      "Generating Executive Intelligence",
    );
    assert.equal(
      resolvePersonaDisplayStatus({
        personaStatus: "Analysis Generated",
        hasGeneratedAnalysis: true,
      }),
      "Generating Executive Intelligence",
    );
    assert.equal(
      resolvePersonaDisplayStatus({
        personaStatus: "Ready",
        hasCurrentExecutiveVersion: true,
      }),
      "Ready",
    );
    assert.equal(
      resolvePersonaDisplayStatus({
        personaStatus: "Queued",
        hasCurrentExecutiveVersion: true,
      }),
      "Ready",
    );
    assert.equal(
      resolvePersonaDisplayStatus({
        personaStatus: "Queued",
        jobStatus: "failed",
      }),
      "Processing Failed",
    );
  });
});

describe("persona stage-3 queueing and create/import contracts", () => {
  it("manual create persists and queues with partial-failure reporting", () => {
    const route = read("app/api/personas/route.ts");
    const importer = read("services/personas/personaImporter.ts");
    assert.match(route, /importPersonaManual/);
    assert.match(route, /202/);
    assert.match(route, /queued/);
    assert.match(route, /queueError/);
    assert.match(importer, /ensurePersonaGenerationQueued/);
    assert.match(importer, /triggerType: "discussion_import"/);
    assert.match(importer, /Persona created but intelligence generation/);
    assert.doesNotMatch(importer, /processDiscussionEndToEnd/);
    assert.doesNotMatch(importer, /["']persona_deep_scrape["']/);
  });

  it("CSV import queues independently and reports queue failures separately", async () => {
    process.env.NEXT_PUBLIC_SUPABASE_URL ??= "https://example.supabase.co";
    process.env.SUPABASE_SERVICE_ROLE_KEY ??= "test-service-role-key";

    const { importPersonasFromRows } = await import(
      "../../services/personas/personaImporter"
    );

    const created: string[] = [];
    const summary = await importPersonasFromRows({
      organizationId: "org-a",
      userId: "user-a",
      rows: [
        { persona_name: "Ready One" },
        { additional_context: "Importable context" },
      ],
      findDuplicate: async () => null,
      createPersona: async (input) => {
        created.push(String(input.persona_name ?? input.additional_context));
        return {
          id: `id-${created.length}`,
          organization_id: input.organization_id,
          user_id: input.user_id ?? null,
          community_id: null,
          linked_discussion_id: null,
          persona_name: input.persona_name ?? null,
          reference_website: input.reference_website ?? null,
          additional_context: input.additional_context ?? null,
          notes: input.notes ?? null,
          ads_content: input.ads_content ?? null,
          status: "Queued",
        } as never;
      },
      ensureQueued: async (persona) => {
        if (persona.id === "id-2") {
          throw new Error("queue boom");
        }
        return { persona, queued: true, jobId: "job-1" };
      },
    });

    assert.equal(summary.imported, 2);
    assert.equal(summary.queued, 1);
    assert.equal(summary.queueFailed, 1);
    assert.equal(summary.failed, 0);
    assert.equal(created.length, 2);
  });

  it("import API surfaces queued and queueFailed counts", () => {
    const route = read("app/api/personas/import/route.ts");
    assert.match(route, /queued: summary\.queued/);
    assert.match(route, /queueFailed: summary\.queueFailed/);
    assert.match(route, /Imported but queue failed/);
  });
});

describe("persona stage-3 executor integration", () => {
  it("adds Persona prepare/Ready/fail branches with publication completeness", () => {
    const executor = read("services/generationJobs/generationJobExecutor.ts");
    assert.match(executor, /PERSONA_INTELLIGENCE_PLATFORM/);
    assert.match(executor, /preparePersonaBridgeBeforeGeneration/);
    assert.match(executor, /markPersonaGenerationReady/);
    assert.match(executor, /markPersonaGenerationFailed/);
    assert.match(executor, /prepareProspectBridgeBeforeGeneration/);
    assert.match(executor, /markProspectGenerationReady/);
    assert.match(executor, /if \(isPersona\)/);
    assert.doesNotMatch(executor, /isCompleteProspectDeploymentAssetSet/);
  });

  it("discussion workflow gates Prospect and Persona completeness separately", () => {
    const workflow = read("services/workflows/discussionWorkflow.ts");
    assert.match(workflow, /isProspectIntelligenceBridge/);
    assert.match(workflow, /requireProspectCompleteness: isProspect/);
    assert.match(workflow, /isPersonaIntelligenceBridge/);
    assert.match(workflow, /requirePersonaCompleteness: isPersona/);
  });
});

describe("persona stage-3 exclusions", () => {
  it("excludes persona_intelligence from ordinary surfaces and Brain learning", () => {
    const discussion = read("services/discussionService.ts");
    const queue = read("services/queueService.ts");
    const community = read("services/communityService.ts");
    const domains = read("services/intelligenceDomainService.ts");
    const learning = read("services/brain/learningService.ts");

    assert.match(discussion, /PERSONA_INTELLIGENCE_PLATFORM/);
    assert.match(discussion, /PROSPECT_INTELLIGENCE_PLATFORM/);
    assert.match(queue, /PERSONA_INTELLIGENCE_PLATFORM/);
    assert.match(community, /PERSONA_INTELLIGENCE_PLATFORM/);
    assert.match(domains, /PERSONA_INTELLIGENCE_PLATFORM/);
    assert.match(learning, /isPersonaIntelligenceBridge/);
    assert.match(
      learning,
      /Persona Intelligence sources do not emit Discussion learning signals/,
    );
  });
});

describe("persona stage-3 APIs and UI", () => {
  it("creates refresh and status routes with org context", () => {
    assert.equal(
      existsSync(join(ROOT, "app/api/personas/[id]/refresh/route.ts")),
      true,
    );
    assert.equal(
      existsSync(join(ROOT, "app/api/personas/[id]/status/route.ts")),
      true,
    );
    const refresh = read("app/api/personas/[id]/refresh/route.ts");
    const status = read("app/api/personas/[id]/status/route.ts");
    assert.match(refresh, /requireCurrentOrganizationContext/);
    assert.match(refresh, /ensurePersonaGenerationQueued/);
    assert.match(refresh, /manual_refresh/);
    assert.match(refresh, /202/);
    assert.match(status, /requireCurrentOrganizationContext/);
    assert.match(status, /resolvePersonaDisplayStatus/);
    assert.match(status, /hasGeneratedAnalysis/);
    assert.doesNotMatch(refresh, /think-differently|Think Differently/);
    assert.doesNotMatch(refresh, /deep-scrape|Deep Scrape/);
  });

  it("detail page exposes Generate Intelligence and Stage 4 workspace", () => {
    const page = read("app/personas/[id]/page.tsx");
    assert.match(page, /PersonaGenerateIntelligenceButton/);
    assert.match(page, /PersonaGenerationProgress/);
    assert.match(page, /Generate Intelligence/);
    assert.match(page, /ExecutiveIntelligenceWorkspace/);
    assert.match(page, /sourceKind="persona"/);
  });
});

describe("persona stage-3 containment", () => {
  it("does not introduce persona_deep_scrape generation trigger", () => {
    const triggers = read("services/generationJobs/generationJobTypes.ts");
    assert.doesNotMatch(triggers, /["']persona_deep_scrape["']/);
    assert.match(triggers, /["']prospect_deep_scrape["']/);
  });

  it("documents Persona analysis prompt branch location", () => {
    const prompt = read("services/ai/prompts/discussionAnalysisPrompt.ts");
    assert.match(prompt, /PERSONA_INTELLIGENCE_PLATFORM/);
    assert.match(prompt, /PERSONA SOURCE INSTRUCTION/);
    assert.match(prompt, /clientele archetype or audience segment/);
    assert.doesNotMatch(prompt, /prospect_intelligence/);
  });
});
