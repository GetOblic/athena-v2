import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, it } from "node:test";
import {
  resolveProspectGenerationPhaseIndex,
  resolveProspectGenerationPhaseLabels,
} from "../../components/discussions/ExecutiveGenerationPanel";
import {
  isActiveRegenerationJobStatus,
  isFullPipelineRegenerationComplete,
  isTerminalFailedRegeneration,
  nextRegenerationPollIntervalMs,
  REGENERATION_FAILED_PRESERVE_NOTICE,
  REGENERATION_POLL_INTERVAL_MS,
  REGENERATION_POLL_SAFETY_CEILING_MS,
  REGENERATION_STILL_RUNNING_NOTICE,
} from "../../lib/discussionRegenerationStatus";
import {
  evaluateProspectDeploymentCompleteness,
  websiteIntelligenceHasUsableContent,
} from "../../services/prospects/prospectDeploymentAssetContract";
import { resolveProspectDisplayStatus } from "../../services/prospects/prospectDisplay";
import {
  isProspectImportTrigger,
  resolveProspectWebsiteLearningDecision,
} from "../../services/prospects/prospectWebsiteLearningPolicy";
import { WEBSITE_INTELLIGENCE_MAX_PAGES } from "../../services/prospects/prospectWebsiteUrl";

const ROOT = process.cwd();

const USABLE_WEBSITE_INTEL = {
  scraped_at: "2026-07-12T10:00:00.000Z",
  pages_analyzed: 4,
  pages_limit: 10,
  business_knowledge: {
    services: "• Botox\n• Fillers",
    overview: "Aesthetic clinic",
  },
};

const COMPLETE_CTA_WITHOUT_KE = `
PERSONALIZED_OUTREACH_EMAIL:
Hello

FOLLOW_UP_EMAIL:
Following up

LINKEDIN_CONNECTION:
Hi

WHATSAPP_OUTREACH:
INITIAL MESSAGE
Hi there

NEWSLETTER_IDEA:
Idea

BLOG_POST_IDEA:
Post

RECOMMENDED_CTA:
Book a call
`.trim();

const COMPLETE_CTA_WITH_KE = `${COMPLETE_CTA_WITHOUT_KE}

KNOWLEDGE_ENHANCEMENT:
Business Overview
• Aesthetic clinic

Services
• Botox
`;

describe("Sprint 2B finalization — website learning trigger policy", () => {
  it("Manual Import (discussion_import) triggers website learning when no stored intel", () => {
    const decision = resolveProspectWebsiteLearningDecision({
      triggerType: "discussion_import",
      hasWebsite: true,
      websiteIntelligence: null,
    });
    assert.equal(decision.shouldCrawl, true);
    assert.equal(decision.reason, "initial_import");
  });

  it("CSV Import uses the same discussion_import crawl policy", () => {
    const importer = readFileSync(
      join(ROOT, "services/prospects/prospectImporter.ts"),
      "utf8",
    );
    // CSV and manual import enqueue with default discussion_import
    assert.match(
      importer,
      /triggerType:\s*options\?\.triggerType \?\? "discussion_import"/,
    );
    const decision = resolveProspectWebsiteLearningDecision({
      triggerType: "discussion_import",
      hasWebsite: true,
      websiteIntelligence: {},
    });
    assert.equal(decision.shouldCrawl, true);
  });

  it("Refresh Intelligence does not crawl", () => {
    const decision = resolveProspectWebsiteLearningDecision({
      triggerType: "manual_refresh",
      hasWebsite: true,
      websiteIntelligence: USABLE_WEBSITE_INTEL,
    });
    assert.equal(decision.shouldCrawl, false);
    assert.equal(decision.reason, "intelligence_refresh");
  });

  it("Append Information (discussion_update) does not crawl", () => {
    const decision = resolveProspectWebsiteLearningDecision({
      triggerType: "discussion_update",
      hasWebsite: true,
      websiteIntelligence: USABLE_WEBSITE_INTEL,
    });
    assert.equal(decision.shouldCrawl, false);
    assert.equal(decision.reason, "non_import_trigger");
  });

  it("status/lifecycle metadata regeneration uses discussion_update (no crawl)", () => {
    const route = readFileSync(
      join(ROOT, "app/api/prospects/[id]/route.ts"),
      "utf8",
    );
    assert.match(route, /triggerType:\s*"discussion_update"/);
    const decision = resolveProspectWebsiteLearningDecision({
      triggerType: "discussion_update",
      hasWebsite: true,
      websiteIntelligence: null,
    });
    assert.equal(decision.shouldCrawl, false);
  });

  it("import retry may resume crawl when stored intel is not usable", () => {
    const decision = resolveProspectWebsiteLearningDecision({
      triggerType: "discussion_import",
      hasWebsite: true,
      websiteIntelligence: {
        scraped_at: "2026-07-12T10:00:00.000Z",
        error: "timeout",
        pages_analyzed: 0,
      },
    });
    assert.equal(decision.shouldCrawl, true);
    assert.equal(decision.reason, "import_retry_resume");
  });

  it("import retry reuses stored usable website intelligence (no duplicate crawl)", () => {
    const decision = resolveProspectWebsiteLearningDecision({
      triggerType: "discussion_import",
      hasWebsite: true,
      websiteIntelligence: USABLE_WEBSITE_INTEL,
    });
    assert.equal(decision.shouldCrawl, false);
    assert.equal(decision.reason, "import_retry_reuse_stored");
  });

  it("regeneration retries (manual_refresh) never create duplicate crawls", () => {
    for (let attempt = 0; attempt < 3; attempt += 1) {
      const decision = resolveProspectWebsiteLearningDecision({
        triggerType: "manual_refresh",
        hasWebsite: true,
        websiteIntelligence: USABLE_WEBSITE_INTEL,
      });
      assert.equal(decision.shouldCrawl, false);
    }
  });

  it("worker executor wires trigger type into prepareProspectBridgeBeforeGeneration", () => {
    const executor = readFileSync(
      join(ROOT, "services/generationJobs/generationJobExecutor.ts"),
      "utf8",
    );
    assert.match(executor, /resolveProspectWebsiteLearningDecision/);
    assert.match(
      executor,
      /prepareProspectBridgeBeforeGeneration\([\s\S]*triggerType:\s*job\.trigger_type/,
    );
  });

  it("prep path skips WebsiteIntelligenceProvider for non-import triggers", () => {
    const prep = readFileSync(
      join(ROOT, "services/prospects/prospectImporter.ts"),
      "utf8",
    );
    assert.match(prep, /website_learning_skipped/);
    assert.match(prep, /stored_website_intelligence_loaded/);
    assert.match(prep, /Never mutate website_intelligence on refresh/);
  });
});

describe("Sprint 2B finalization — Knowledge Enhancement completeness", () => {
  it("stored usable website knowledge requires Knowledge Enhancement", () => {
    assert.equal(
      websiteIntelligenceHasUsableContent(USABLE_WEBSITE_INTEL),
      true,
    );
    const report = evaluateProspectDeploymentCompleteness({
      suggestedCta: COMPLETE_CTA_WITHOUT_KE,
      requireKnowledgeEnhancement: true,
    });
    assert.equal(report.complete, false);
    assert.ok(report.missingRequiredKeys.includes("KNOWLEDGE_ENHANCEMENT"));
  });

  it("no stored website knowledge does not force invented Knowledge Enhancement", () => {
    assert.equal(websiteIntelligenceHasUsableContent(null), false);
    assert.equal(websiteIntelligenceHasUsableContent({}), false);
    const report = evaluateProspectDeploymentCompleteness({
      suggestedCta: COMPLETE_CTA_WITHOUT_KE,
      requireKnowledgeEnhancement: false,
    });
    assert.equal(report.complete, true);
    assert.ok(!report.missingRequiredKeys.includes("KNOWLEDGE_ENHANCEMENT"));
  });

  it("missing required Knowledge Enhancement fails candidate publication safely", () => {
    const report = evaluateProspectDeploymentCompleteness({
      suggestedCta: COMPLETE_CTA_WITHOUT_KE,
      requireKnowledgeEnhancement: true,
    });
    assert.equal(report.complete, false);
  });

  it("complete candidate with KE publishes when website knowledge exists", () => {
    const report = evaluateProspectDeploymentCompleteness({
      suggestedCta: COMPLETE_CTA_WITH_KE,
      requireKnowledgeEnhancement: true,
    });
    assert.equal(report.complete, true);
  });
});

describe("Sprint 2B finalization — progress stages", () => {
  it("import displays Learning from website", () => {
    const labels = resolveProspectGenerationPhaseLabels("discussion_import");
    assert.equal(labels[0], "Learning from website");
    assert.ok(isProspectImportTrigger("discussion_import"));
  });

  it("refresh never displays Learning from website", () => {
    const labels = resolveProspectGenerationPhaseLabels("manual_refresh");
    assert.ok(!labels.includes("Learning from website"));
  });

  it("refresh never displays Understanding discussion", () => {
    const labels = resolveProspectGenerationPhaseLabels("manual_refresh");
    assert.ok(!labels.includes("Understanding discussion"));
  });

  it("refresh begins with Building executive intelligence", () => {
    const labels = resolveProspectGenerationPhaseLabels("manual_refresh");
    assert.equal(labels[0], "Building executive intelligence");
    assert.equal(
      resolveProspectGenerationPhaseIndex("discussion_analysis", "manual_refresh"),
      0,
    );
  });

  it("import maps website stage to Learning from website", () => {
    assert.equal(
      resolveProspectGenerationPhaseIndex(
        "website_intelligence",
        "discussion_import",
      ),
      0,
    );
  });
});

describe("Sprint 2B finalization — durable polling and status", () => {
  it("active job beyond 150 seconds remains active (safety ceiling is 15 minutes)", () => {
    assert.ok(REGENERATION_POLL_SAFETY_CEILING_MS >= 15 * 60 * 1000);
    assert.ok(REGENERATION_POLL_SAFETY_CEILING_MS > 150_000);
    assert.equal(
      isActiveRegenerationJobStatus("processing"),
      true,
    );
    // Still in flight after 150s → not complete
    assert.equal(
      isFullPipelineRegenerationComplete(
        { latestAnalysisUpdatedAt: null, blueprintUpdatedAt: null },
        {
          latestAnalysisId: null,
          latestAnalysisCreatedAt: null,
          latestAnalysisUpdatedAt: null,
          blueprintUpdatedAt: null,
          regenerationInFlight: true,
          jobStatus: "processing",
        },
        Date.now() - 160_000,
      ),
      false,
    );
  });

  it("polling continues until durable terminal status (in-flight blocks complete)", () => {
    assert.equal(
      isFullPipelineRegenerationComplete(
        {
          latestAnalysisUpdatedAt: "2026-07-01T00:00:00.000Z",
          blueprintUpdatedAt: "2026-07-01T00:00:00.000Z",
        },
        {
          latestAnalysisId: "a2",
          latestAnalysisCreatedAt: "2026-07-12T00:00:00.000Z",
          latestAnalysisUpdatedAt: "2026-07-12T00:00:00.000Z",
          blueprintUpdatedAt: "2026-07-12T00:00:00.000Z",
          regenerationInFlight: true,
          jobStatus: "processing",
        },
        Date.now() - 5_000,
      ),
      false,
    );
  });

  it("success completes when fingerprints advance and job is not in flight", () => {
    const queuedAt = Date.parse("2026-07-12T12:00:00.000Z");
    assert.equal(
      isFullPipelineRegenerationComplete(
        {
          latestAnalysisUpdatedAt: "2026-07-01T00:00:00.000Z",
          blueprintUpdatedAt: "2026-07-01T00:00:00.000Z",
        },
        {
          latestAnalysisId: "a2",
          latestAnalysisCreatedAt: "2026-07-12T12:01:00.000Z",
          latestAnalysisUpdatedAt: "2026-07-12T12:01:00.000Z",
          blueprintUpdatedAt: "2026-07-12T12:01:00.000Z",
          regenerationInFlight: false,
          jobStatus: "completed",
        },
        queuedAt,
      ),
      true,
    );
  });

  it("failure preserves previous Current Version messaging", () => {
    assert.equal(
      isTerminalFailedRegeneration({
        regenerationInFlight: false,
        jobStatus: "failed",
      }),
      true,
    );
    assert.match(
      REGENERATION_FAILED_PRESERVE_NOTICE,
      /previous Executive Version remains available/i,
    );
    assert.equal(
      resolveProspectDisplayStatus({
        prospectStatus: "Processing Failed",
        jobStatus: null,
        hasCurrentVersion: true,
      }),
      "Processing Failed",
    );
  });

  it("Library and detail resolve active/success/failure identically", () => {
    assert.equal(
      resolveProspectDisplayStatus({
        jobStatus: "processing",
        hasCurrentVersion: true,
      }),
      "Generating Executive Intelligence",
    );
    assert.equal(
      resolveProspectDisplayStatus({
        jobStatus: "failed",
        hasCurrentVersion: true,
      }),
      "Processing Failed",
    );
    assert.equal(
      resolveProspectDisplayStatus({
        jobStatus: null,
        hasCurrentVersion: true,
      }),
      "Ready",
    );
  });

  it("poll cadence starts near 2–3s and backs off", () => {
    assert.ok(REGENERATION_POLL_INTERVAL_MS >= 2_000);
    assert.ok(REGENERATION_POLL_INTERVAL_MS <= 3_000);
    const early = nextRegenerationPollIntervalMs({ elapsedMs: 5_000 });
    const later = nextRegenerationPollIntervalMs({ elapsedMs: 90_000 });
    const hidden = nextRegenerationPollIntervalMs({
      elapsedMs: 5_000,
      documentHidden: true,
    });
    assert.equal(early, REGENERATION_POLL_INTERVAL_MS);
    assert.ok(later > early);
    assert.ok(hidden >= 5_000);
  });

  it("provider stops polling on unmount and avoids overlapping polls", () => {
    const provider = readFileSync(
      join(
        ROOT,
        "components/discussions/DiscussionRegenerationProvider.tsx",
      ),
      "utf8",
    );
    assert.match(provider, /pollInFlightRef/);
    assert.match(provider, /stopPolling\(\)/);
    assert.match(provider, /visibilitychange/);
    assert.match(provider, /REGENERATION_POLL_SAFETY_CEILING_MS/);
    assert.match(provider, /REGENERATION_STILL_RUNNING_NOTICE/);
    assert.equal(
      REGENERATION_STILL_RUNNING_NOTICE.includes(
        "Generation is still running in the background",
      ),
      true,
    );
    // Must not clear generating solely because 150s elapsed
    assert.doesNotMatch(
      provider,
      /Date\.now\(\)\s*-\s*queuedAtMs\s*>=\s*REGENERATION_POLL_TIMEOUT_MS/,
    );
  });
});

describe("Sprint 2B finalization — regression guards", () => {
  it("maximum 10-page import crawl remains enforced", () => {
    assert.equal(WEBSITE_INTELLIGENCE_MAX_PAGES, 10);
  });

  it("Website Analysis UI documents import-only capture reuse", () => {
    const ui = readFileSync(
      join(ROOT, "components/prospects/ProspectHomepageIntelligence.tsx"),
      "utf8",
    );
    assert.match(ui, /Pages analyzed/);
    assert.match(
      ui,
      /Website knowledge was captured during Prospect import and is reused/,
    );
  });

  it("diagnostics distinguish import crawl vs refresh reuse", () => {
    const diagnostics = readFileSync(
      join(ROOT, "services/prospects/prospectGenerationDiagnostics.ts"),
      "utf8",
    );
    assert.match(diagnostics, /website_discovery_started/);
    assert.match(diagnostics, /website_learning_completed/);
    assert.match(diagnostics, /stored_website_intelligence_loaded/);
    assert.match(diagnostics, /website_learning_skipped/);
  });

  it("atomic publication refuse-to-publish incomplete candidates remains in place", () => {
    const service = readFileSync(
      join(ROOT, "services/executiveVersions/executiveVersionService.ts"),
      "utf8",
    );
    assert.match(service, /websiteIntelligenceSupportsKnowledgeEnhancement/);
    assert.match(service, /incomplete|complete|refuse|reject/i);
  });
});
