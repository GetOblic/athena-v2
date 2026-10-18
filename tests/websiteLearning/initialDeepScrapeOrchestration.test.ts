import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, it } from "node:test";
import { websiteIntelligenceHasUsableContent } from "../../services/prospects/prospectWebsiteLearningPolicy";
import {
  INITIAL_RESEARCH_FOLLOW_ON_TRIGGER,
  INITIAL_RESEARCH_USES_SEPARATE_ENTITLEMENT,
  MANUAL_DEEP_SCRAPE_FOLLOW_ON_TRIGGER,
  MAX_FALLBACK_SETTLE_ATTEMPTS,
  adoptedFallbackFollowOnId,
  buildInitialResearchFallbackGenerationProgress,
  buildInitialResearchProgress,
  concurrentProspectInitialResearch,
  continuationForClaimedInitialResearch,
  ACTIVE_GENERATION_LOOKUP_FAILED,
  FALLBACK_GENERATION_LOOKUP_FAILED,
  UNRELATED_ACTIVE_GENERATION_BLOCK,
  decideAwaitingFollowOnTerminalFailure,
  decideDeferredFallbackSettlement,
  decideIdentityInitialTrain,
  decideProspectInitialResearch,
  decideUnresolvedFallbackWrite,
  deepScrapeFailRpcWouldRetry,
  deepScrapeFailureIsTerminal,
  deepScrapeStatusIsClaimable,
  fallbackEnqueueBlockedByActiveJob,
  nonConsumingFallbackBlockMessage,
  planEvidenceFreeProspectFallback,
  unchangedFallbackAttempts,
  isFailedInitialResearchForWebsite,
  isInitialResearchFallbackGenerationProgress,
  isInitialResearchProgress,
  mergePreservedInitialResearchProgress,
  selectFallbackGenerationJob,
  selectProspectFollowOnTrigger,
  shouldSuppressProspectHomepageScrape,
  visibleStatusAfterFallbackGiveUp,
  withInitialResearchFallback,
} from "../../services/websiteLearning/deepScrape/initialResearchPolicy";

const ROOT = process.cwd();

function read(relativePath: string): string {
  return readFileSync(path.join(ROOT, relativePath), "utf8");
}

const deepV1 = {
  provider: "deep_v1",
  url: "https://acme.example",
  pages_analyzed: 4,
  business_knowledge: { about: "Acme builds tools." },
  about: "Acme builds tools.",
};

const homepageOnly = {
  provider: "homepage_only",
  url: "https://acme.example",
  pages_analyzed: 1,
  about: "Homepage copy",
};

describe("initial prospect research scheduling", () => {
  it("schedules deep scrape for a first generation with a valid website and no intelligence", () => {
    const decision = decideProspectInitialResearch({
      triggerType: "discussion_import",
      website: "https://acme.example",
      websiteIntelligence: null,
      hasCurrentExecutiveVersion: false,
    });
    assert.equal(decision.schedule, true);
    assert.equal(decision.reason, "schedule_initial_research");
    assert.equal(
      concurrentProspectInitialResearch({
        schedule: true,
        activeDeepScrape: false,
      }),
      "enqueue_deep_scrape",
    );
  });

  it("reuses existing deep_v1 and homepage intelligence without a new crawl", () => {
    assert.equal(websiteIntelligenceHasUsableContent(deepV1), true);
    assert.equal(
      decideProspectInitialResearch({
        triggerType: "discussion_import",
        website: "https://acme.example",
        websiteIntelligence: deepV1,
        hasCurrentExecutiveVersion: false,
      }).reason,
      "usable_intelligence",
    );
    assert.equal(
      decideProspectInitialResearch({
        triggerType: "manual_refresh",
        website: "https://acme.example",
        websiteIntelligence: homepageOnly,
        hasCurrentExecutiveVersion: false,
      }).reason,
      "usable_intelligence",
    );
  });

  it("does not schedule on refresh with a version, discussion_update, Think Differently, or follow-on", () => {
    assert.equal(
      decideProspectInitialResearch({
        triggerType: "manual_refresh",
        website: "https://acme.example",
        websiteIntelligence: null,
        hasCurrentExecutiveVersion: true,
      }).reason,
      "existing_executive_version",
    );
    assert.equal(
      decideProspectInitialResearch({
        triggerType: "discussion_update",
        website: "https://acme.example",
        hasCurrentExecutiveVersion: false,
      }).reason,
      "discussion_update",
    );
    assert.equal(
      decideProspectInitialResearch({
        triggerType: "prospect_deep_scrape",
        website: "https://acme.example",
        hasCurrentExecutiveVersion: false,
      }).reason,
      "deep_scrape_follow_on",
    );
    assert.equal(
      decideProspectInitialResearch({
        triggerType: "manual_refresh",
        website: "https://acme.example",
        hasCurrentExecutiveVersion: false,
        progress: {
          generationMode: "think_differently",
          pipeline: "strategic_blueprint_and_deployment_assets",
        },
      }).reason,
      "think_differently",
    );
    assert.equal(
      decideProspectInitialResearch({
        triggerType: "discussion_import",
        website: "https://acme.example",
        hasCurrentExecutiveVersion: false,
        progress: buildInitialResearchFallbackGenerationProgress(),
      }).reason,
      "fallback_generation",
    );
  });

  it("double-submit reuses the active deep scrape and does not also enqueue generation", () => {
    assert.equal(
      concurrentProspectInitialResearch({
        schedule: true,
        activeDeepScrape: true,
      }),
      "reuse_active_deep_scrape",
    );
    assert.equal(
      concurrentProspectInitialResearch({
        schedule: false,
        activeDeepScrape: true,
      }),
      "enqueue_generation",
    );
  });
});

describe("initial identity research scheduling", () => {
  it("enqueues research before the first compile when the website is valid", () => {
    assert.equal(
      decideIdentityInitialTrain({
        brainObtained: false,
        website: "acme.example",
        websiteIntelligence: null,
        masterProfile: null,
        activeInitialResearch: false,
        failedInitialResearchForWebsite: false,
      }),
      "enqueue_initial_research",
    );
  });

  it("compiles immediately when intelligence or homepage learning already exists", () => {
    assert.equal(
      decideIdentityInitialTrain({
        brainObtained: false,
        website: "https://acme.example",
        websiteIntelligence: deepV1,
        masterProfile: null,
        activeInitialResearch: false,
        failedInitialResearchForWebsite: false,
      }),
      "compile_existing",
    );
    assert.equal(
      decideIdentityInitialTrain({
        brainObtained: false,
        website: "https://acme.example",
        websiteIntelligence: null,
        masterProfile: { homepage_learning: "Historical homepage" },
        activeInitialResearch: false,
        failedInitialResearchForWebsite: false,
      }),
      "compile_existing",
    );
  });

  it("keeps retraining on the existing compile path", () => {
    assert.equal(
      decideIdentityInitialTrain({
        brainObtained: true,
        website: "https://acme.example",
        websiteIntelligence: null,
        masterProfile: { homepage_learning: "Kept" },
        activeInitialResearch: false,
        failedInitialResearchForWebsite: false,
      }),
      "compile_existing",
    );
  });

  it("waits on a second submit and compiles without a fetch after terminal failure", () => {
    assert.equal(
      decideIdentityInitialTrain({
        brainObtained: false,
        website: "https://acme.example",
        activeInitialResearch: true,
        failedInitialResearchForWebsite: false,
      }),
      "wait_for_active_research",
    );
    assert.equal(
      decideIdentityInitialTrain({
        brainObtained: false,
        website: "https://acme.example",
        activeInitialResearch: false,
        failedInitialResearchForWebsite: true,
      }),
      "compile_without_website_fetch",
    );
    assert.equal(
      isFailedInitialResearchForWebsite(
        {
          progress: buildInitialResearchProgress(),
          status: "failed",
          promoted_at: null,
          root_url: "https://acme.example/",
        },
        "acme.example",
      ),
      true,
    );
    assert.equal(
      isFailedInitialResearchForWebsite(
        {
          progress: {},
          status: "failed",
          promoted_at: null,
          root_url: "https://acme.example/",
        },
        "acme.example",
      ),
      false,
    );
  });
});

describe("initial research success, failure, and exactly-once follow-on", () => {
  const base = {
    isInitialResearch: true,
    promoted: false,
    fallback: "idle" as const,
    fallbackAttempts: 0,
    sourceType: "prospect" as const,
    terminalFailure: false,
    followOnJobId: null,
    followOnMatchesFallback: false,
    brainReady: false,
  };

  it("prospect success crawls, then uses one promoted Phase B follow-on", () => {
    assert.deepEqual(continuationForClaimedInitialResearch(base), {
      kind: "scrape",
    });
    assert.deepEqual(
      continuationForClaimedInitialResearch({
        ...base,
        promoted: true,
        terminalFailure: true,
      }),
      { kind: "promoted_phase_b" },
    );
    assert.equal(
      selectProspectFollowOnTrigger(buildInitialResearchProgress()),
      INITIAL_RESEARCH_FOLLOW_ON_TRIGGER,
    );
  });

  it("identity success compiles only after promotion", () => {
    assert.deepEqual(
      continuationForClaimedInitialResearch({
        ...base,
        sourceType: "brain",
      }),
      { kind: "scrape" },
    );
    assert.deepEqual(
      continuationForClaimedInitialResearch({
        ...base,
        sourceType: "brain",
        promoted: true,
      }),
      { kind: "promoted_phase_b" },
    );
  });

  it("terminal content failure and exhausted retries enqueue one evidence-free follow-on", () => {
    assert.equal(
      deepScrapeFailureIsTerminal({
        retryable: false,
        attemptCount: 1,
        maxAttempts: 3,
      }),
      true,
    );
    assert.equal(
      deepScrapeFailureIsTerminal({
        retryable: true,
        attemptCount: 2,
        maxAttempts: 3,
      }),
      false,
    );
    assert.equal(
      deepScrapeFailureIsTerminal({
        retryable: true,
        attemptCount: 3,
        maxAttempts: 3,
      }),
      true,
    );

    const first = continuationForClaimedInitialResearch({
      ...base,
      terminalFailure: true,
    });
    assert.deepEqual(first, {
      kind: "evidence_free_prospect_fallback",
      reuseFollowOn: false,
    });
    const second = continuationForClaimedInitialResearch({
      ...base,
      fallback: "pending",
      terminalFailure: true,
      followOnJobId: "job-1",
    });
    assert.deepEqual(second, {
      kind: "evidence_free_prospect_fallback",
      reuseFollowOn: true,
    });
    assert.deepEqual(
      continuationForClaimedInitialResearch({
        ...base,
        fallback: "settled",
        followOnJobId: "job-1",
      }),
      { kind: "terminal_failure_only" },
    );
  });

  it("identity failure compiles once and does not crawl again after the brain is ready", () => {
    assert.deepEqual(
      continuationForClaimedInitialResearch({
        ...base,
        sourceType: "brain",
        terminalFailure: true,
      }),
      { kind: "evidence_free_brain_compile", alreadyReady: false },
    );
    assert.deepEqual(
      continuationForClaimedInitialResearch({
        ...base,
        sourceType: "brain",
        fallback: "pending",
        brainReady: true,
      }),
      { kind: "evidence_free_brain_compile", alreadyReady: true },
    );
  });

  it("crash during fallback reuses the recorded follow-on instead of crawling or enqueueing again", () => {
    const progress = withInitialResearchFallback(buildInitialResearchProgress(), {
      fallback: "pending",
      failureCode: "NO_USABLE_PAGES",
      failureMessage: "No readable pages",
    });
    assert.equal(readFallback(progress), "pending");
    assert.equal(
      isInitialResearchFallbackGenerationProgress(
        buildInitialResearchFallbackGenerationProgress(),
      ),
      true,
    );
    assert.equal(shouldSuppressProspectHomepageScrape(
      buildInitialResearchFallbackGenerationProgress(),
    ), true);
    assert.deepEqual(
      continuationForClaimedInitialResearch({
        ...base,
        fallback: "pending",
        followOnMatchesFallback: true,
      }),
      { kind: "evidence_free_prospect_fallback", reuseFollowOn: true },
    );
  });

  it("manual research is not classified as initial research and keeps its follow-on trigger", () => {
    assert.equal(isInitialResearchProgress({}), false);
    assert.equal(isInitialResearchProgress(null), false);
    assert.equal(
      selectProspectFollowOnTrigger({}),
      MANUAL_DEEP_SCRAPE_FOLLOW_ON_TRIGGER,
    );
    assert.deepEqual(
      continuationForClaimedInitialResearch({
        ...base,
        isInitialResearch: false,
        terminalFailure: true,
      }),
      { kind: "scrape" },
    );
    assert.deepEqual(
      continuationForClaimedInitialResearch({
        ...base,
        isInitialResearch: false,
        promoted: true,
      }),
      { kind: "promoted_phase_b" },
    );
  });

  it("preserves the initial-research marker when heartbeat progress replaces the payload", () => {
    const merged = mergePreservedInitialResearchProgress(
      buildInitialResearchProgress(),
      { pagesCrawled: 2, phase: "crawling" },
    );
    assert.equal(isInitialResearchProgress(merged), true);
    assert.equal(merged.pagesCrawled, 2);
    const explicit = withInitialResearchFallback(merged, { fallback: "pending" });
    const kept = mergePreservedInitialResearchProgress(
      { pagesCrawled: 1 },
      explicit,
    );
    assert.equal(readFallback(kept), "pending");
  });
});

describe("free entitlement and untouched workflows", () => {
  it("does not treat initial research as a second entitlement", () => {
    assert.equal(INITIAL_RESEARCH_USES_SEPARATE_ENTITLEMENT, false);
    const settlement = read(
      "services/websiteLearning/deepScrape/initialResearchSettlement.ts",
    );
    const policy = read(
      "services/websiteLearning/deepScrape/initialResearchPolicy.ts",
    );
    assert.doesNotMatch(
      settlement,
      /reserveFreeConvert|consumeFreeConvert|reserveFreeIdentity|consumeFreeIdentity/,
    );
    assert.doesNotMatch(policy, /reserveFreeConvert|consumeFreeConvert/);
    assert.match(settlement, /researchSucceeded: false/);
    assert.match(settlement, /skipLiveWebsiteFetch: true/);
  });

  it("leaves public manual Deep Scrape authorization unchanged", () => {
    const brain = read("app/api/identity/deep-scrape/route.ts");
    const prospect = read("app/api/prospects/[id]/deep-scrape/route.ts");
    assert.match(brain, /brain_status !== "ready"/);
    assert.match(brain, /assertCurrentFreeIdentityGeneration/);
    assert.doesNotMatch(brain, /initial_research|buildInitialResearchProgress/);
    assert.match(prospect, /NO_EXECUTIVE_VERSION/);
    assert.match(prospect, /assertCurrentFreeConvertGeneration/);
    assert.match(prospect, /action: "deep_scrape"/);
    assert.doesNotMatch(prospect, /buildInitialResearchProgress/);
  });

  it("does not crawl on GetOblic or Google conversion, Audience, or the refresh route", () => {
    const getoblic = read(
      "services/getoblicDirectory/getoblicDirectoryConvertService.ts",
    );
    const google = read(
      "services/googleBusiness/googleBusinessConvertService.ts",
    );
    const audience = read("services/personas/personaImporter.ts");
    const refresh = read("app/api/prospects/[id]/refresh/route.ts");
    for (const source of [getoblic, google, audience, refresh]) {
      assert.doesNotMatch(
        source,
        /enqueueProspectDeepScrapeJob|enqueueBrainDeepScrapeJob|buildInitialResearchProgress|runDeepWebsiteCrawl/,
      );
    }
    assert.match(refresh, /triggerType:\s*"manual_refresh"/);
  });

  it("wires fallback suppression and does not run the crawler inside generation or Train", () => {
    const importer = read("services/prospects/prospectImporter.ts");
    const executor = read(
      "services/websiteLearning/deepScrape/deepScrapeExecutor.ts",
    );
    const generation = read(
      "services/generationJobs/generationJobExecutor.ts",
    );
    const identity = read("services/identity/identityService.ts");
    assert.match(importer, /enqueueProspectDeepScrapeJob/);
    assert.match(importer, /skipInitialResearch/);
    assert.doesNotMatch(importer, /runDeepWebsiteCrawl/);
    assert.match(executor, /selectProspectFollowOnTrigger/);
    assert.match(executor, /settleEvidenceFreeInitialResearch/);
    assert.match(executor, /mergePreservedInitialResearchProgress/);
    assert.match(generation, /shouldSuppressProspectHomepageScrape/);
    assert.match(identity, /enqueueBrainDeepScrapeJob/);
    assert.match(identity, /skipLiveWebsiteFetch: true/);
    assert.doesNotMatch(identity, /runDeepWebsiteCrawl/);
    assert.match(identity, /return compileMasterIdentityProfile\(data, input\.organizationId\)/);
  });
});

describe("gate 2d lifecycle corrections", () => {
  const prospectBase = {
    isInitialResearch: true,
    promoted: true,
    fallback: "idle" as const,
    fallbackAttempts: 0,
    sourceType: "prospect" as const,
    terminalFailure: false,
    followOnJobId: "gen-1",
    followOnMatchesFallback: true,
    brainReady: false,
  };

  it("failed initial follow-on is terminal and is not replayed", () => {
    assert.equal(
      decideAwaitingFollowOnTerminalFailure({ isInitialResearch: true }),
      "terminal_initial_research",
    );
    assert.equal(deepScrapeStatusIsClaimable("failed"), false);
    assert.equal(deepScrapeStatusIsClaimable("retryable"), true);
    assert.equal(deepScrapeStatusIsClaimable("awaiting_follow_on"), false);
    const executor = sliceFunction(
      read("services/websiteLearning/deepScrape/deepScrapeExecutor.ts"),
      "async function reconcileOneAwaitingFollowOnJob",
    );
    assert.match(executor, /terminal_initial_research/);
    assert.match(executor, /status:\s*"failed"/);
    assert.match(executor, /next_attempt_at:\s*null/);
    assert.doesNotMatch(executor, /ensureProspectGenerationQueued/);
    assert.equal(
      continuationForClaimedInitialResearch({
        ...prospectBase,
        promoted: true,
      }).kind,
      "promoted_phase_b",
    );
  });

  it("releases Free on terminal generation failure without another automatic generation", () => {
    const failSql = read(
      "supabase/migrations/20260917000006_patch_athena_generation_job_free_convert.sql",
    );
    assert.match(failSql, /v_status = 'failed'/);
    assert.match(failSql, /release_athena_free_convert/);
    const settlement = read(
      "services/websiteLearning/deepScrape/initialResearchSettlement.ts",
    );
    assert.doesNotMatch(
      settlement,
      /reserveFreeConvert|consumeFreeConvert|releaseFreeConvert|reserveFreeIdentity|consumeFreeIdentity/,
    );
    assert.equal(INITIAL_RESEARCH_USES_SEPARATE_ENTITLEMENT, false);
    assert.equal(
      decideAwaitingFollowOnTerminalFailure({ isInitialResearch: true }),
      "terminal_initial_research",
    );
    assert.equal(
      isFailedInitialResearchForWebsite(
        {
          progress: buildInitialResearchProgress(),
          status: "completed",
          promoted_at: "2026-10-18T00:00:00.000Z",
          root_url: "https://acme.example/",
        },
        "https://acme.example",
      ),
      false,
    );
    assert.equal(
      decideProspectInitialResearch({
        triggerType: "manual_refresh",
        website: "https://acme.example",
        websiteIntelligence: null,
        hasCurrentExecutiveVersion: true,
      }).schedule,
      false,
    );
  });

  it("an active generation prevents initial research scheduling", () => {
    assert.equal(
      concurrentProspectInitialResearch({
        schedule: true,
        activeDeepScrape: false,
        activeGeneration: true,
      }),
      "reuse_active_generation",
    );
    assert.equal(
      concurrentProspectInitialResearch({
        schedule: true,
        activeDeepScrape: true,
        activeGeneration: true,
      }),
      "reuse_active_generation",
    );
    const importer = read("services/prospects/prospectImporter.ts");
    const reuseAt = importer.indexOf(
      'initialResearchAction === "reuse_active_generation"',
    );
    const enqueueAt = importer.indexOf("await enqueueProspectDeepScrapeJob(");
    assert.ok(reuseAt > 0);
    assert.ok(enqueueAt > reuseAt);
    assert.match(importer, /readActiveGenerationJobForDiscussion/);
  });

  it("keeps fallback retryable when the final crawl attempt cannot enqueue", () => {
    assert.equal(
      deepScrapeFailRpcWouldRetry({
        retryable: true,
        attemptCount: 3,
        maxAttempts: 3,
      }),
      false,
    );
    assert.deepEqual(
      decideUnresolvedFallbackWrite({
        fallbackAttemptsAfterFailure: 1,
        crawlAttemptCount: 3,
        crawlMaxAttempts: 3,
        followOnPersisted: false,
      }),
      { method: "direct_retryable", settleVisibleStatus: false },
    );
    assert.equal(deepScrapeStatusIsClaimable("retryable"), true);
    assert.equal(deepScrapeStatusIsClaimable("failed"), false);
    const release = sliceFunction(
      read("services/websiteLearning/deepScrape/deepScrapeJobService.ts"),
      "export async function releaseProcessingDeepScrapeForRetry",
    );
    assert.match(release, /status:\s*"retryable"/);
    assert.match(release, /\.eq\("claim_token", input\.claimToken\)/);
    assert.match(release, /\.eq\("status", "processing"\)/);
    assert.doesNotMatch(release, /attempt_count/);
    const settlement = read(
      "services/websiteLearning/deepScrape/initialResearchSettlement.ts",
    );
    assert.match(settlement, /releaseProcessingDeepScrapeForRetry/);
    assert.match(settlement, /decideUnresolvedFallbackWrite/);
    assert.doesNotMatch(settlement, /job\.attempt_count < job\.max_attempts/);
  });

  it("reuses a persisted follow-on after a crash and does not enqueue again", () => {
    assert.deepEqual(
      continuationForClaimedInitialResearch({
        isInitialResearch: true,
        promoted: false,
        fallback: "pending",
        fallbackAttempts: 1,
        sourceType: "prospect",
        terminalFailure: true,
        followOnJobId: "fallback-job",
        followOnMatchesFallback: true,
        brainReady: false,
      }),
      { kind: "evidence_free_prospect_fallback", reuseFollowOn: true },
    );
    assert.deepEqual(
      decideUnresolvedFallbackWrite({
        fallbackAttemptsAfterFailure: 1,
        crawlAttemptCount: 3,
        crawlMaxAttempts: 3,
        followOnPersisted: true,
      }),
      { method: "fail_rpc", retryable: false, settleVisibleStatus: false },
    );
    const settlement = read(
      "services/websiteLearning/deepScrape/initialResearchSettlement.ts",
    );
    const persistAt = settlement.indexOf("persistFollowOnId");
    const enqueueAt = settlement.indexOf("enqueueProspectEvidenceFreeGeneration");
    assert.ok(persistAt > 0);
    assert.ok(enqueueAt > persistAt);
    assert.match(settlement, /findInitialResearchFallbackGenerationJob/);
    assert.doesNotMatch(settlement, /getLatestGenerationJobForDiscussion/);
  });

  it("finds an older fallback generation when a newer unrelated job exists", () => {
    const jobs = [
      {
        id: "other-org",
        organizationId: "org-2",
        discussionId: "disc-1",
        createdAt: "2026-01-01T00:00:00.000Z",
        progress: buildInitialResearchFallbackGenerationProgress(),
      },
      {
        id: "fallback-old",
        organizationId: "org-1",
        discussionId: "disc-1",
        createdAt: "2026-02-01T00:00:00.000Z",
        progress: buildInitialResearchFallbackGenerationProgress(),
      },
      {
        id: "newer-unrelated",
        organizationId: "org-1",
        discussionId: "disc-1",
        createdAt: "2026-03-01T00:00:00.000Z",
        progress: { phase: "manual_refresh" },
      },
      {
        id: "other-discussion",
        organizationId: "org-1",
        discussionId: "disc-2",
        createdAt: "2026-01-15T00:00:00.000Z",
        progress: buildInitialResearchFallbackGenerationProgress(),
      },
    ];
    assert.equal(
      selectFallbackGenerationJob(jobs, "org-1", "disc-1"),
      "fallback-old",
    );
    assert.equal(selectFallbackGenerationJob(jobs, "org-2", "disc-9"), null);
    assert.equal(
      adoptedFallbackFollowOnId({
        jobId: "newer-unrelated",
        progress: { phase: "manual_refresh" },
      }),
      null,
    );
    assert.equal(
      adoptedFallbackFollowOnId({
        jobId: "fallback-old",
        progress: buildInitialResearchFallbackGenerationProgress(),
      }),
      "fallback-old",
    );
    assert.equal(
      fallbackEnqueueBlockedByActiveJob({
        activeJobId: "newer-unrelated",
        activeProgress: { phase: "manual_refresh" },
      }),
      true,
    );
    const finder = sliceFunction(
      read("services/generationJobs/generationJobService.ts"),
      "export async function findInitialResearchFallbackGenerationJob",
    );
    assert.match(finder, /\.eq\("organization_id", organization\)/);
    assert.match(finder, /\.eq\("discussion_id", discussion\)/);
    assert.match(finder, /INITIAL_RESEARCH_FALLBACK_GENERATION_KEY/);
    assert.match(finder, /ascending:\s*true/);
  });

  it("settles Identity and Prospect on final give-up without wiping stored knowledge", () => {
    assert.equal(MAX_FALLBACK_SETTLE_ATTEMPTS, 3);
    assert.deepEqual(
      decideUnresolvedFallbackWrite({
        fallbackAttemptsAfterFailure: MAX_FALLBACK_SETTLE_ATTEMPTS,
        crawlAttemptCount: 1,
        crawlMaxAttempts: 3,
        followOnPersisted: false,
      }),
      { method: "fail_rpc", retryable: false, settleVisibleStatus: true },
    );
    assert.deepEqual(
      visibleStatusAfterFallbackGiveUp({
        sourceType: "brain",
        identityBrainStatus: "processing",
      }),
      { identityBrainStatus: "pending", prospectStatus: null },
    );
    assert.deepEqual(
      visibleStatusAfterFallbackGiveUp({
        sourceType: "brain",
        identityBrainStatus: "ready",
      }),
      { identityBrainStatus: null, prospectStatus: null },
    );
    assert.deepEqual(
      visibleStatusAfterFallbackGiveUp({ sourceType: "prospect" }),
      { identityBrainStatus: null, prospectStatus: "Processing Failed" },
    );
    const identity = sliceFunction(
      read("services/identity/identityService.ts"),
      "export async function releaseIdentityBrainProcessing",
    );
    assert.match(identity, /brain_status:\s*"pending"/);
    assert.match(identity, /\.eq\("brain_status", "processing"\)/);
    assert.doesNotMatch(identity, /master_profile|website_intelligence|about_you/);
    const settlement = sliceFunction(
      read("services/websiteLearning/deepScrape/initialResearchSettlement.ts"),
      "async function settleVisibleInitialResearchGiveUp",
    );
    assert.match(settlement, /status:\s*visible\.prospectStatus/);
    assert.match(settlement, /last_activity:/);
    assert.doesNotMatch(
      settlement,
      /website_intelligence|business_name|master_profile|executive_version/,
    );
    assert.equal(
      decideIdentityInitialTrain({
        brainObtained: false,
        website: "https://acme.example",
        activeInitialResearch: false,
        failedInitialResearchForWebsite: true,
      }),
      "compile_without_website_fetch",
    );
  });

  it("leaves ordinary manual Deep Scrape retry behavior in place", () => {
    assert.equal(
      decideAwaitingFollowOnTerminalFailure({ isInitialResearch: false }),
      "retry_manual_deep_scrape",
    );
    assert.equal(
      selectProspectFollowOnTrigger({}),
      MANUAL_DEEP_SCRAPE_FOLLOW_ON_TRIGGER,
    );
    assert.equal(isInitialResearchProgress({}), false);
    const executor = sliceFunction(
      read("services/websiteLearning/deepScrape/deepScrapeExecutor.ts"),
      "async function reconcileOneAwaitingFollowOnJob",
    );
    assert.match(executor, /status:\s*"retryable"/);
    assert.match(executor, /current_stage:\s*"regenerating"/);
    assert.deepEqual(
      continuationForClaimedInitialResearch({
        isInitialResearch: false,
        promoted: true,
        fallback: "idle",
        fallbackAttempts: 0,
        sourceType: "persona",
        terminalFailure: true,
        followOnJobId: null,
        followOnMatchesFallback: false,
        brainReady: false,
      }),
      { kind: "promoted_phase_b" },
    );
  });

  it("still produces one first generation after a successful initial Deep Scrape", () => {
    assert.equal(
      selectProspectFollowOnTrigger(buildInitialResearchProgress()),
      INITIAL_RESEARCH_FOLLOW_ON_TRIGGER,
    );
    assert.equal(
      concurrentProspectInitialResearch({
        schedule: true,
        activeDeepScrape: false,
        activeGeneration: false,
      }),
      "enqueue_deep_scrape",
    );
    assert.equal(
      decideProspectInitialResearch({
        triggerType: "discussion_import",
        website: "https://acme.example",
        websiteIntelligence: deepV1,
        hasCurrentExecutiveVersion: false,
      }).schedule,
      false,
    );
    assert.equal(INITIAL_RESEARCH_USES_SEPARATE_ENTITLEMENT, false);
  });

  it("does not homepage-scrape an evidence-free fallback generation", () => {
    const fallback = buildInitialResearchFallbackGenerationProgress();
    assert.equal(shouldSuppressProspectHomepageScrape(fallback), true);
    assert.equal(shouldSuppressProspectHomepageScrape({}), false);
    assert.equal(isInitialResearchFallbackGenerationProgress(fallback), true);
    const generation = read(
      "services/generationJobs/generationJobExecutor.ts",
    );
    assert.match(generation, /shouldSuppressProspectHomepageScrape\(job\.progress\)/);
  });
});

describe("gate 2f lifecycle corrections", () => {
  const prospectClaim = {
    isInitialResearch: true,
    promoted: false,
    fallback: "pending" as const,
    sourceType: "prospect" as const,
    terminalFailure: true,
    followOnJobId: null as string | null,
    followOnMatchesFallback: false,
    brainReady: false,
  };

  it("unrelated active generation does not consume fallbackAttempts", () => {
    const plan = planEvidenceFreeProspectFallback({
      lookupUnavailable: false,
      existingFallbackJobId: null,
      activeJobId: "manual-job",
      activeProgress: { phase: "manual_refresh" },
    });
    assert.equal(plan.action, "defer_unrelated_active_generation");
    assert.equal(unchangedFallbackAttempts(0), 0);
    assert.equal(unchangedFallbackAttempts(2), 2);
    assert.equal(
      nonConsumingFallbackBlockMessage(
        new Error(UNRELATED_ACTIVE_GENERATION_BLOCK),
      ),
      UNRELATED_ACTIVE_GENERATION_BLOCK,
    );
    assert.equal(
      nonConsumingFallbackBlockMessage(new Error("IDENTITY_NOT_FOUND")),
      null,
    );
    const settlement = sliceFunction(
      read("services/websiteLearning/deepScrape/initialResearchSettlement.ts"),
      "export async function settleEvidenceFreeInitialResearch",
    );
    const blockedAt = settlement.indexOf("nonConsumingFallbackBlockMessage");
    const incrementAt = settlement.indexOf("fallbackAttempts ?? 0) + 1");
    assert.ok(blockedAt > 0);
    assert.ok(incrementAt > blockedAt);
    assert.match(settlement, /unchangedFallbackAttempts/);
  });

  it("repeated contention cannot trigger terminal give-up", () => {
    let attempts = 0;
    for (let turn = 0; turn < 8; turn += 1) {
      const plan = planEvidenceFreeProspectFallback({
        lookupUnavailable: false,
        existingFallbackJobId: null,
        activeJobId: "manual-job",
        activeProgress: { phase: "manual_refresh" },
      });
      assert.equal(plan.action, "defer_unrelated_active_generation");
      attempts = unchangedFallbackAttempts(attempts);
      const write = decideDeferredFallbackSettlement({
        crawlAttemptCount: 3,
        crawlMaxAttempts: 3,
      });
      assert.deepEqual(write, { method: "direct_retryable" });
      assert.equal("settleVisibleStatus" in write, false);
    }
    assert.equal(attempts, 0);
    assert.equal(
      continuationForClaimedInitialResearch({
        ...prospectClaim,
        fallbackAttempts: attempts,
      }).kind,
      "evidence_free_prospect_fallback",
    );
    assert.deepEqual(
      decideUnresolvedFallbackWrite({
        fallbackAttemptsAfterFailure: MAX_FALLBACK_SETTLE_ATTEMPTS,
        crawlAttemptCount: 1,
        crawlMaxAttempts: 3,
        followOnPersisted: false,
      }),
      { method: "fail_rpc", retryable: false, settleVisibleStatus: true },
    );
    const deferral = sliceFunction(
      read("services/websiteLearning/deepScrape/initialResearchSettlement.ts"),
      "async function deferInitialResearchFallback",
    );
    assert.doesNotMatch(deferral, /settleVisibleInitialResearchGiveUp/);
    assert.doesNotMatch(deferral, /ensureProspectGenerationQueued/);
    assert.match(deferral, /fallback:\s*"pending"/);
    assert.match(deferral, /decideDeferredFallbackSettlement/);
  });

  it("contention resolves and settlement resumes exactly once", () => {
    let attempts = 0;
    let enqueued = 0;
    let followOn: string | null = null;

    const step = (activeUnrelated: boolean) => {
      const plan = planEvidenceFreeProspectFallback({
        lookupUnavailable: false,
        existingFallbackJobId: followOn,
        activeJobId: activeUnrelated ? "manual-job" : null,
        activeProgress: activeUnrelated ? { phase: "manual_refresh" } : null,
      });
      if (plan.action === "defer_unrelated_active_generation") {
        attempts = unchangedFallbackAttempts(attempts);
        assert.equal(
          continuationForClaimedInitialResearch({
            ...prospectClaim,
            fallbackAttempts: attempts,
            followOnJobId: followOn,
            followOnMatchesFallback: Boolean(followOn),
          }).kind,
          "evidence_free_prospect_fallback",
        );
        return;
      }
      assert.equal(plan.action, "enqueue");
      enqueued += 1;
      followOn = "fallback-once";
    };

    step(true);
    step(true);
    step(true);
    assert.equal(attempts, 0);
    assert.equal(enqueued, 0);
    assert.equal(followOn, null);
    step(false);
    assert.equal(enqueued, 1);
    assert.equal(followOn, "fallback-once");
    assert.deepEqual(
      planEvidenceFreeProspectFallback({
        lookupUnavailable: false,
        existingFallbackJobId: followOn,
        activeJobId: null,
        activeProgress: null,
      }),
      { action: "reuse", jobId: "fallback-once" },
    );
    assert.deepEqual(
      continuationForClaimedInitialResearch({
        ...prospectClaim,
        fallbackAttempts: attempts,
        followOnJobId: followOn,
        followOnMatchesFallback: true,
      }),
      { kind: "evidence_free_prospect_fallback", reuseFollowOn: true },
    );
    assert.equal(enqueued, 1);
    const executor = sliceFunction(
      read("services/websiteLearning/deepScrape/deepScrapeExecutor.ts"),
      "export async function executeClaimedDeepScrapeJob",
    );
    const settleAt = executor.indexOf("settleEvidenceFreeInitialResearch");
    const crawlAt = executor.indexOf("runDeepWebsiteCrawl");
    assert.ok(settleAt > 0 && crawlAt > settleAt);
    assert.match(executor, /initialFallback\.fallback !== "idle"/);
  });

  it("fallback lookup error cannot enqueue another generation", () => {
    const plan = planEvidenceFreeProspectFallback({
      lookupUnavailable: true,
      existingFallbackJobId: null,
      activeJobId: null,
      activeProgress: null,
    });
    assert.equal(plan.action, "defer_lookup_unavailable");
    assert.equal(
      nonConsumingFallbackBlockMessage(
        new Error(FALLBACK_GENERATION_LOOKUP_FAILED),
      ),
      FALLBACK_GENERATION_LOOKUP_FAILED,
    );
    const settlement = sliceFunction(
      read("services/websiteLearning/deepScrape/initialResearchSettlement.ts"),
      "export async function settleEvidenceFreeInitialResearch",
    );
    const unavailableAt = settlement.indexOf('followOn.status === "unavailable"');
    const enqueueAt = settlement.indexOf("enqueueProspectEvidenceFreeGeneration");
    const clearAt = settlement.indexOf("follow_on_generation_job_id = null");
    assert.ok(unavailableAt > 0);
    assert.ok(enqueueAt > unavailableAt);
    assert.ok(clearAt > unavailableAt);
    const resolve = sliceFunction(
      read("services/websiteLearning/deepScrape/initialResearchSettlement.ts"),
      "async function resolveExistingFallbackFollowOn",
    );
    assert.match(resolve, /fallback\.outcome === "error"/);
    assert.match(resolve, /status: "unavailable"/);
    assert.match(resolve, /fallback\.outcome === "found"/);
    assert.match(resolve, /status: "none"/);
    const finder = sliceFunction(
      read("services/generationJobs/generationJobService.ts"),
      "export async function findInitialResearchFallbackGenerationJob",
    );
    assert.match(finder, /outcome: "error"/);
    assert.match(finder, /outcome: "none"/);
    assert.match(finder, /outcome: "found"/);
    const activeRead = sliceFunction(
      read("services/generationJobs/generationJobService.ts"),
      "export async function getActiveGenerationJobForDiscussion",
    );
    assert.match(activeRead, /return null/);
    const byId = sliceFunction(
      read("services/generationJobs/generationJobService.ts"),
      "export async function getGenerationJobById",
    );
    assert.match(byId, /return null/);
  });

  it("repeated lookup errors do not consume fallbackAttempts", () => {
    let attempts = 1;
    for (let turn = 0; turn < 6; turn += 1) {
      const plan = planEvidenceFreeProspectFallback({
        lookupUnavailable: true,
        existingFallbackJobId: null,
      });
      assert.equal(plan.action, "defer_lookup_unavailable");
      attempts = unchangedFallbackAttempts(attempts);
      const write = decideDeferredFallbackSettlement({
        crawlAttemptCount: 2,
        crawlMaxAttempts: 3,
      });
      assert.deepEqual(write, { method: "fail_rpc" });
      assert.equal("settleVisibleStatus" in write, false);
    }
    assert.equal(attempts, 1);
    assert.equal(
      continuationForClaimedInitialResearch({
        ...prospectClaim,
        fallbackAttempts: attempts,
      }).kind,
      "evidence_free_prospect_fallback",
    );
  });

  it("successful empty lookup can enqueue normally", () => {
    assert.deepEqual(
      planEvidenceFreeProspectFallback({
        lookupUnavailable: false,
        existingFallbackJobId: null,
        activeJobId: null,
        activeProgress: null,
      }),
      { action: "enqueue" },
    );
    assert.deepEqual(
      continuationForClaimedInitialResearch({
        ...prospectClaim,
        fallbackAttempts: 0,
      }),
      { kind: "evidence_free_prospect_fallback", reuseFollowOn: false },
    );
    const enqueue = sliceFunction(
      read("services/websiteLearning/deepScrape/initialResearchSettlement.ts"),
      "async function enqueueProspectEvidenceFreeGeneration",
    );
    const planAt = enqueue.indexOf("planEvidenceFreeProspectFallback");
    const queueAt = enqueue.indexOf("ensureProspectGenerationQueued");
    assert.ok(planAt > 0);
    assert.ok(queueAt > planAt);
    assert.match(enqueue, /UNRELATED_ACTIVE_GENERATION_BLOCK/);
    assert.match(enqueue, /INITIAL_RESEARCH_FOLLOW_ON_TRIGGER/);
    assert.match(enqueue, /skipInitialResearch: true/);
  });

  it("reuses an older fallback despite a newer unrelated job", () => {
    const jobs = [
      {
        id: "fallback-old",
        organizationId: "org-1",
        discussionId: "disc-1",
        createdAt: "2026-02-01T00:00:00.000Z",
        progress: buildInitialResearchFallbackGenerationProgress(),
      },
      {
        id: "newer-unrelated",
        organizationId: "org-1",
        discussionId: "disc-1",
        createdAt: "2026-03-01T00:00:00.000Z",
        progress: { phase: "manual_refresh" },
      },
    ];
    const selected = selectFallbackGenerationJob(jobs, "org-1", "disc-1");
    assert.equal(selected, "fallback-old");
    assert.deepEqual(
      planEvidenceFreeProspectFallback({
        lookupUnavailable: false,
        existingFallbackJobId: selected,
        activeJobId: "newer-unrelated",
        activeProgress: { phase: "manual_refresh" },
      }),
      { action: "reuse", jobId: "fallback-old" },
    );
    const finder = sliceFunction(
      read("services/generationJobs/generationJobService.ts"),
      "export async function findInitialResearchFallbackGenerationJob",
    );
    assert.match(finder, /\.eq\("organization_id", organization\)/);
    assert.match(finder, /\.eq\("discussion_id", discussion\)/);
    assert.match(finder, /INITIAL_RESEARCH_FALLBACK_GENERATION_KEY/);
    assert.match(finder, /ascending:\s*true/);
  });

  it("final crawl attempt still permits delayed fallback settlement", () => {
    assert.equal(
      deepScrapeFailRpcWouldRetry({
        retryable: true,
        attemptCount: 3,
        maxAttempts: 3,
      }),
      false,
    );
    assert.deepEqual(
      decideUnresolvedFallbackWrite({
        fallbackAttemptsAfterFailure: 1,
        crawlAttemptCount: 3,
        crawlMaxAttempts: 3,
        followOnPersisted: false,
      }),
      { method: "direct_retryable", settleVisibleStatus: false },
    );
    assert.deepEqual(
      decideDeferredFallbackSettlement({
        crawlAttemptCount: 3,
        crawlMaxAttempts: 3,
      }),
      { method: "direct_retryable" },
    );
    assert.deepEqual(
      decideDeferredFallbackSettlement({
        crawlAttemptCount: 1,
        crawlMaxAttempts: 3,
      }),
      { method: "fail_rpc" },
    );
    assert.equal(deepScrapeStatusIsClaimable("retryable"), true);
    assert.equal(deepScrapeStatusIsClaimable("failed"), false);
    const deferral = sliceFunction(
      read("services/websiteLearning/deepScrape/initialResearchSettlement.ts"),
      "async function deferInitialResearchFallback",
    );
    assert.match(deferral, /releaseProcessingDeepScrapeForRetry/);
    assert.match(deferral, /FALLBACK_SETTLEMENT_RETRY_DELAY_MS/);
    assert.match(deferral, /retryable: true/);
    const release = sliceFunction(
      read("services/websiteLearning/deepScrape/deepScrapeJobService.ts"),
      "export async function releaseProcessingDeepScrapeForRetry",
    );
    assert.match(release, /\.eq\("claim_token", input\.claimToken\)/);
    assert.match(release, /status:\s*"retryable"/);
    assert.doesNotMatch(release, /attempt_count/);
  });

  it("leaves ordinary manual Deep Scrape unchanged", () => {
    assert.equal(
      decideAwaitingFollowOnTerminalFailure({ isInitialResearch: false }),
      "retry_manual_deep_scrape",
    );
    assert.equal(
      selectProspectFollowOnTrigger({}),
      MANUAL_DEEP_SCRAPE_FOLLOW_ON_TRIGGER,
    );
    assert.equal(isInitialResearchProgress({}), false);
    assert.deepEqual(
      continuationForClaimedInitialResearch({
        isInitialResearch: false,
        promoted: false,
        fallback: "idle",
        fallbackAttempts: 0,
        sourceType: "prospect",
        terminalFailure: true,
        followOnJobId: null,
        followOnMatchesFallback: false,
        brainReady: false,
      }),
      { kind: "scrape" },
    );
    assert.deepEqual(
      continuationForClaimedInitialResearch({
        isInitialResearch: false,
        promoted: true,
        fallback: "idle",
        fallbackAttempts: 0,
        sourceType: "persona",
        terminalFailure: true,
        followOnJobId: null,
        followOnMatchesFallback: false,
        brainReady: false,
      }),
      { kind: "promoted_phase_b" },
    );
    const executor = sliceFunction(
      read("services/websiteLearning/deepScrape/deepScrapeExecutor.ts"),
      "async function reconcileOneAwaitingFollowOnJob",
    );
    assert.match(executor, /decideAwaitingFollowOnTerminalFailure/);
    assert.match(executor, /status:\s*"retryable"/);
    assert.match(executor, /current_stage:\s*"regenerating"/);
  });

  it("leaves Free entitlement behavior unchanged", () => {
    assert.equal(INITIAL_RESEARCH_USES_SEPARATE_ENTITLEMENT, false);
    const settlement = read(
      "services/websiteLearning/deepScrape/initialResearchSettlement.ts",
    );
    const policy = read(
      "services/websiteLearning/deepScrape/initialResearchPolicy.ts",
    );
    assert.doesNotMatch(
      settlement,
      /reserveFreeConvert|consumeFreeConvert|releaseFreeConvert|reserveFreeIdentity|consumeFreeIdentity/,
    );
    assert.doesNotMatch(
      policy,
      /reserveFreeConvert|consumeFreeConvert|releaseFreeConvert|reserveFreeIdentity|consumeFreeIdentity/,
    );
    assert.equal(
      fallbackEnqueueBlockedByActiveJob({
        activeJobId: "manual-job",
        activeProgress: { phase: "manual_refresh" },
      }),
      true,
    );
  });
});

describe("gate 2g active generation read", () => {
  const prospectClaim = {
    isInitialResearch: true,
    promoted: false,
    fallback: "pending" as const,
    sourceType: "prospect" as const,
    terminalFailure: true,
    followOnJobId: null as string | null,
    followOnMatchesFallback: false,
    brainReady: false,
  };

  it("reuses an active generation found by a successful read", () => {
    assert.equal(
      concurrentProspectInitialResearch({
        schedule: true,
        activeDeepScrape: true,
        activeGenerationRead: "found",
      }),
      "reuse_active_generation",
    );
    assert.deepEqual(
      planEvidenceFreeProspectFallback({
        lookupUnavailable: false,
        activeLookupUnavailable: false,
        existingFallbackJobId: null,
        activeJobId: "fallback-job",
        activeProgress: buildInitialResearchFallbackGenerationProgress(),
      }),
      { action: "reuse", jobId: "fallback-job" },
    );
    const importer = sliceFunction(
      read("services/prospects/prospectImporter.ts"),
      "export async function ensureProspectGenerationQueued",
    );
    const foundAt = importer.indexOf('outcome === "found"');
    const reuseAt = importer.indexOf(
      'initialResearchAction === "reuse_active_generation"',
    );
    const enqueueAt = importer.indexOf("await enqueueProspectDeepScrapeJob(");
    assert.ok(foundAt > 0);
    assert.ok(reuseAt > foundAt);
    assert.ok(enqueueAt > reuseAt);
  });

  it("schedules initial Deep Scrape after a successful empty active-generation read", () => {
    assert.equal(
      concurrentProspectInitialResearch({
        schedule: true,
        activeDeepScrape: false,
        activeGenerationRead: "none",
      }),
      "enqueue_deep_scrape",
    );
    assert.equal(
      concurrentProspectInitialResearch({
        schedule: true,
        activeDeepScrape: true,
        activeGenerationRead: "none",
      }),
      "reuse_active_deep_scrape",
    );
    assert.deepEqual(
      planEvidenceFreeProspectFallback({
        lookupUnavailable: false,
        activeLookupUnavailable: false,
        existingFallbackJobId: null,
        activeJobId: null,
        activeProgress: null,
      }),
      { action: "enqueue" },
    );
    const reader = sliceFunction(
      read("services/generationJobs/generationJobService.ts"),
      "export async function readActiveGenerationJobForDiscussion",
    );
    assert.match(reader, /outcome: "none"/);
    assert.match(reader, /outcome: "found"/);
    assert.match(reader, /\.eq\("organization_id", organization\)/);
    assert.match(reader, /\.eq\("discussion_id", discussion\)/);
    assert.match(reader, /"queued", "processing", "retryable"/);
  });

  it("does not schedule initial Deep Scrape when the active-generation read errors", () => {
    assert.equal(
      concurrentProspectInitialResearch({
        schedule: true,
        activeDeepScrape: false,
        activeGenerationRead: "error",
      }),
      "defer_active_generation_lookup",
    );
    assert.equal(
      concurrentProspectInitialResearch({
        schedule: true,
        activeDeepScrape: true,
        activeGenerationRead: "error",
      }),
      "defer_active_generation_lookup",
    );
    const importer = sliceFunction(
      read("services/prospects/prospectImporter.ts"),
      "export async function ensureProspectGenerationQueued",
    );
    const deferAt = importer.indexOf(
      'initialResearchAction === "defer_active_generation_lookup"',
    );
    const deepAt = importer.indexOf("await enqueueProspectDeepScrapeJob(");
    const generationAt = importer.indexOf("enqueueDiscussionGenerationJob(");
    assert.ok(deferAt > 0);
    assert.ok(deepAt > deferAt);
    assert.ok(generationAt > deferAt);
    assert.match(importer, /queued: false/);
    assert.doesNotMatch(
      importer,
      /reserveFreeConvert|consumeFreeConvert|releaseFreeConvert|reserveFreeIdentity|consumeFreeIdentity/,
    );
    const reader = sliceFunction(
      read("services/generationJobs/generationJobService.ts"),
      "export async function readActiveGenerationJobForDiscussion",
    );
    assert.match(reader, /outcome: "error"/);
    const collapsed = sliceFunction(
      read("services/generationJobs/generationJobService.ts"),
      "export async function getActiveGenerationJobForDiscussion",
    );
    assert.match(collapsed, /return null/);
  });

  it("defers evidence-free fallback when the active-generation read errors", () => {
    const plan = planEvidenceFreeProspectFallback({
      lookupUnavailable: false,
      activeLookupUnavailable: true,
      existingFallbackJobId: null,
      activeJobId: null,
      activeProgress: null,
    });
    assert.equal(plan.action, "defer_active_generation_lookup");
    assert.deepEqual(
      planEvidenceFreeProspectFallback({
        lookupUnavailable: false,
        activeLookupUnavailable: true,
        existingFallbackJobId: "fallback-old",
        activeJobId: "manual-job",
        activeProgress: { phase: "manual_refresh" },
      }),
      { action: "reuse", jobId: "fallback-old" },
    );
    assert.equal(
      nonConsumingFallbackBlockMessage(
        new Error(ACTIVE_GENERATION_LOOKUP_FAILED),
      ),
      ACTIVE_GENERATION_LOOKUP_FAILED,
    );
    const enqueue = sliceFunction(
      read("services/websiteLearning/deepScrape/initialResearchSettlement.ts"),
      "async function enqueueProspectEvidenceFreeGeneration",
    );
    const deferAt = enqueue.indexOf("defer_active_generation_lookup");
    const queueAt = enqueue.indexOf("ensureProspectGenerationQueued");
    assert.ok(deferAt > 0);
    assert.ok(queueAt > deferAt);
    assert.match(enqueue, /readActiveGenerationJobForDiscussion/);
    assert.match(enqueue, /activeLookup\.outcome === "error"/);
    assert.match(enqueue, /ACTIVE_GENERATION_LOOKUP_FAILED/);
    const deferral = sliceFunction(
      read("services/websiteLearning/deepScrape/initialResearchSettlement.ts"),
      "async function deferInitialResearchFallback",
    );
    assert.match(deferral, /decideDeferredFallbackSettlement/);
    assert.match(deferral, /unchangedFallbackAttempts/);
    assert.match(deferral, /fallback:\s*"pending"/);
    assert.doesNotMatch(deferral, /ensureProspectGenerationQueued/);
    assert.doesNotMatch(deferral, /settleVisibleInitialResearchGiveUp/);
  });

  it("does not enqueue a duplicate after a transient active-generation read error", () => {
    let deepScrapes = 0;
    let generations = 0;
    const schedule = (read: "error" | "none" | "found") => {
      const action = concurrentProspectInitialResearch({
        schedule: true,
        activeDeepScrape: false,
        activeGeneration: read === "found",
        activeGenerationRead: read,
      });
      if (action === "defer_active_generation_lookup") return;
      if (action === "enqueue_deep_scrape") deepScrapes += 1;
      if (action === "enqueue_generation") generations += 1;
    };
    schedule("error");
    schedule("error");
    assert.equal(deepScrapes, 0);
    assert.equal(generations, 0);
    schedule("none");
    assert.equal(deepScrapes, 1);
    assert.equal(generations, 0);
    schedule("found");
    assert.equal(deepScrapes, 1);
    assert.equal(generations, 0);

    let fallbackEnqueues = 0;
    const settle = (activeLookupUnavailable: boolean) => {
      const plan = planEvidenceFreeProspectFallback({
        lookupUnavailable: false,
        activeLookupUnavailable,
        existingFallbackJobId: fallbackEnqueues > 0 ? "fallback-once" : null,
        activeJobId: null,
        activeProgress: null,
      });
      if (plan.action === "defer_active_generation_lookup") return;
      if (plan.action === "reuse") return;
      assert.equal(plan.action, "enqueue");
      fallbackEnqueues += 1;
    };
    settle(true);
    settle(true);
    assert.equal(fallbackEnqueues, 0);
    settle(false);
    assert.equal(fallbackEnqueues, 1);
    settle(false);
    assert.equal(fallbackEnqueues, 1);
    assert.equal(
      continuationForClaimedInitialResearch({
        ...prospectClaim,
        followOnJobId: "fallback-once",
        followOnMatchesFallback: true,
      }).kind,
      "evidence_free_prospect_fallback",
    );
  });

  it("does not increment fallbackAttempts for a transient database error", () => {
    let attempts = 2;
    for (let turn = 0; turn < 6; turn += 1) {
      const plan = planEvidenceFreeProspectFallback({
        lookupUnavailable: false,
        activeLookupUnavailable: true,
        existingFallbackJobId: null,
      });
      assert.equal(plan.action, "defer_active_generation_lookup");
      attempts = unchangedFallbackAttempts(attempts);
      assert.equal(
        nonConsumingFallbackBlockMessage(
          new Error(ACTIVE_GENERATION_LOOKUP_FAILED),
        ),
        ACTIVE_GENERATION_LOOKUP_FAILED,
      );
      const write = decideDeferredFallbackSettlement({
        crawlAttemptCount: 3,
        crawlMaxAttempts: 3,
      });
      assert.deepEqual(write, { method: "direct_retryable" });
      assert.equal("settleVisibleStatus" in write, false);
    }
    assert.equal(attempts, 2);
    assert.equal(
      continuationForClaimedInitialResearch({
        ...prospectClaim,
        fallbackAttempts: attempts,
      }).kind,
      "evidence_free_prospect_fallback",
    );
    const settlement = sliceFunction(
      read("services/websiteLearning/deepScrape/initialResearchSettlement.ts"),
      "export async function settleEvidenceFreeInitialResearch",
    );
    const blockedAt = settlement.indexOf("nonConsumingFallbackBlockMessage");
    const incrementAt = settlement.indexOf("fallbackAttempts ?? 0) + 1");
    assert.ok(blockedAt > 0);
    assert.ok(incrementAt > blockedAt);
  });

  it("leaves Free entitlement unchanged", () => {
    assert.equal(INITIAL_RESEARCH_USES_SEPARATE_ENTITLEMENT, false);
    const settlement = read(
      "services/websiteLearning/deepScrape/initialResearchSettlement.ts",
    );
    const policy = read(
      "services/websiteLearning/deepScrape/initialResearchPolicy.ts",
    );
    const importer = sliceFunction(
      read("services/prospects/prospectImporter.ts"),
      "export async function ensureProspectGenerationQueued",
    );
    for (const source of [settlement, policy, importer]) {
      assert.doesNotMatch(
        source,
        /reserveFreeConvert|consumeFreeConvert|releaseFreeConvert|reserveFreeIdentity|consumeFreeIdentity/,
      );
    }
  });

  it("leaves ordinary manual Deep Scrape unchanged", () => {
    assert.equal(
      decideAwaitingFollowOnTerminalFailure({ isInitialResearch: false }),
      "retry_manual_deep_scrape",
    );
    assert.equal(
      selectProspectFollowOnTrigger({}),
      MANUAL_DEEP_SCRAPE_FOLLOW_ON_TRIGGER,
    );
    assert.equal(isInitialResearchProgress({}), false);
    assert.equal(
      concurrentProspectInitialResearch({
        schedule: false,
        activeDeepScrape: false,
      }),
      "enqueue_generation",
    );
    assert.equal(
      decideProspectInitialResearch({
        triggerType: "prospect_deep_scrape",
        website: "https://acme.example",
        websiteIntelligence: null,
        hasCurrentExecutiveVersion: false,
      }).schedule,
      false,
    );
    const manual = read("app/api/prospects/[id]/deep-scrape/route.ts");
    assert.doesNotMatch(manual, /readActiveGenerationJobForDiscussion/);
    assert.doesNotMatch(manual, /buildInitialResearchProgress/);
    assert.match(manual, /enqueueProspectDeepScrapeJob/);
    const importer = sliceFunction(
      read("services/prospects/prospectImporter.ts"),
      "export async function ensureProspectGenerationQueued",
    );
    const guardAt = importer.indexOf("scheduleInitialResearch && discussionId");
    const readAt = importer.indexOf("readActiveGenerationJobForDiscussion");
    assert.ok(guardAt > 0);
    assert.ok(readAt > guardAt);
  });

  it("keeps unrelated active-generation callers on the null-on-error read", () => {
    for (const relative of [
      "services/generationJobs/generationJobRunner.ts",
      "app/prospects/[id]/page.tsx",
      "app/personas/[id]/page.tsx",
      "app/api/prospects/[id]/status/route.ts",
      "app/api/personas/[id]/status/route.ts",
      "app/api/discussions/[id]/status/route.ts",
    ]) {
      const source = read(relative);
      assert.match(source, /getActiveGenerationJobForDiscussion/);
      assert.doesNotMatch(source, /readActiveGenerationJobForDiscussion/);
    }
    const create = sliceFunction(
      read("services/generationJobs/generationJobService.ts"),
      "export async function createGenerationJob",
    );
    assert.match(create, /getActiveGenerationJobForDiscussion\(/);
    assert.doesNotMatch(create, /readActiveGenerationJobForDiscussion/);
    const finder = sliceFunction(
      read("services/generationJobs/generationJobService.ts"),
      "export async function findInitialResearchFallbackGenerationJob",
    );
    assert.match(finder, /outcome: "error"/);
    assert.match(finder, /outcome: "none"/);
    assert.match(finder, /outcome: "found"/);
    assert.match(finder, /\.eq\("organization_id", organization\)/);
    assert.match(finder, /\.eq\("discussion_id", discussion\)/);
  });
});

function sliceFunction(source: string, signature: string): string {
  const start = source.indexOf(signature);
  if (start < 0) return "";
  const next = source.indexOf("\nexport ", start + signature.length);
  const nextLocal = source.indexOf("\nasync function ", start + signature.length);
  const endCandidates = [next, nextLocal].filter((index) => index > start);
  const end =
    endCandidates.length > 0 ? Math.min(...endCandidates) : source.length;
  return source.slice(start, end);
}

function readFallback(progress: Record<string, unknown>): string | null {
  const orchestration = progress.orchestration;
  if (!orchestration || typeof orchestration !== "object") return null;
  const fallback = (orchestration as { fallback?: unknown }).fallback;
  return typeof fallback === "string" ? fallback : null;
}
