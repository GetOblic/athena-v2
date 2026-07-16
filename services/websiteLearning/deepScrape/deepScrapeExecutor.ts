/**
 * Deep Website Scrape worker execution — Phase A crawl + Phase B follow-on.
 *
 * Prospect Phase B parks the deep job as awaiting_follow_on so the same
 * concurrency-1 worker can process the generation job without deadlock.
 */

import {
  compileMasterIdentityProfile,
  getAthenaIdentityById,
} from "@/services/identity/identityService";
import { getAthenaWorkerConfig } from "@/services/generationJobs/generationJobWorkerConfig";
import {
  getGenerationJobById,
} from "@/services/generationJobs/generationJobService";
import { ensureProspectGenerationQueued } from "@/services/prospects/prospectImporter";
import { getProspectById, updateProspect } from "@/services/prospects/prospectService";
import { supabaseAdmin } from "@/lib/supabaseAdmin";
import { runDeepWebsiteCrawl } from "@/services/websiteLearning/deepScrape/crawlEngine";
import {
  deepIntelligenceHasUsableContent,
  isDeepWebsiteIntelligence,
  type DeepWebsiteIntelligence,
} from "@/services/websiteLearning/deepScrape/deepWebsiteIntelligence";
import { DeepScrapeHeartbeatController } from "@/services/websiteLearning/deepScrape/deepScrapeHeartbeat";
import {
  assertDeepScrapePageParity,
  BRAIN_DEEP_SCRAPE_PAGE_PARITY_FAILED,
  buildPromotableDeepWebsiteIntelligence,
  countDeepPages,
  DeepScrapePageParityError,
  listValidDeepPages,
  readDeepIntelligencePageCount,
} from "@/services/websiteLearning/deepScrape/deepScrapePageContract";
import {
  completeDeepScrapeJobWithClaim,
  failDeepScrapeJobWithClaim,
  updateDeepScrapeJobFields,
} from "@/services/websiteLearning/deepScrape/deepScrapeJobService";
import {
  formatDeepScrapeErrorMessage,
  type AthenaWebsiteDeepScrapeJob,
} from "@/services/websiteLearning/deepScrape/deepScrapeJobTypes";
import {
  DeepScrapeStateTransitionError,
  isPersistedDeepScrapeStage,
} from "@/services/websiteLearning/deepScrape/deepScrapeStages";
import { logDeepScrapeEvent } from "@/services/websiteLearning/deepScrape/observability";

type RenewLease = (
  stage?: string | null,
  progress?: Record<string, unknown> | null,
) => Promise<void>;

function classifyDeepScrapeError(error: unknown): {
  code: string;
  message: string;
  retryable: boolean;
} {
  if (error instanceof DeepScrapeStateTransitionError) {
    return {
      code: error.code,
      message: error.message,
      retryable: false,
    };
  }
  if (error instanceof DeepScrapePageParityError) {
    return {
      code: error.code,
      message: error.message,
      retryable: false,
    };
  }

  const message =
    error instanceof Error ? error.message : "Deep scrape failed";
  const code = message
    .replace(/\s+/g, "_")
    .replace(/[^A-Z0-9_]/gi, "")
    .slice(0, 80)
    .toUpperCase() || "DEEP_SCRAPE_FAILED";

  const terminal = new Set([
    "INVALID_WEBSITE_URL",
    "IP_LITERAL_REJECTED",
    "PRIVATE_IP_REJECTED",
    "CROSS_DOMAIN_REJECTED",
    "INSUFFICIENT_USEFUL_CONTENT",
    "EMPTY_OR_THIN_HOMEPAGE",
    "EMPTY_OR_UNUSABLE_CORPUS",
    "NO_USABLE_PAGES",
    "NO_PERMISSIBLE_CRAWL_TARGETS",
    "ROBOTS_DENIED",
    "ROOT_FETCH_FAILED",
    "UNSUPPORTED_CONTENT_TYPE",
    "SYNTHESIS_PARSE_FAILED",
    "EXTRACTION_COLLAPSED_TO_SHARED_TEMPLATE",
    "DEEP_SCRAPE_STATE_TRANSITION_INVALID",
    "DEEP_SCRAPE_CANDIDATE_ACCOUNTING_MISMATCH",
    BRAIN_DEEP_SCRAPE_PAGE_PARITY_FAILED,
  ]);

  const retryableCodes = new Set([
    "PAGE_TIMEOUT",
    "FETCH_FAILED",
    "DNS_LOOKUP_FAILED",
    "HTTP_429",
    "HTTP_500",
    "HTTP_502",
    "HTTP_503",
    "HTTP_504",
    "MALFORMED_ANALYSIS_CONTRACT",
    "PLAYWRIGHT_CHROMIUM_UNAVAILABLE",
  ]);

  if (terminal.has(code)) {
    return { code, message, retryable: false };
  }
  if (retryableCodes.has(code) || /timeout|temporar|network/i.test(message)) {
    return { code, message, retryable: true };
  }
  return { code, message, retryable: false };
}

async function promoteBrainIntelligence(input: {
  identityId: string;
  organizationId: string;
  jobId: string;
  rootUrl: string;
  intelligence: DeepWebsiteIntelligence;
  acceptedPageCount: number;
}): Promise<DeepWebsiteIntelligence> {
  const payload = buildPromotableDeepWebsiteIntelligence(input.intelligence);
  const promotedPageCount = countDeepPages(payload.pages);

  try {
    assertDeepScrapePageParity({
      acceptedPageCount: input.acceptedPageCount,
      synthesisInputPageCount: input.acceptedPageCount,
      crawlResultPageCount: countDeepPages(input.intelligence.pages),
      promotedPageCount,
      promotedPages: payload.pages,
    });
  } catch (error) {
    if (error instanceof DeepScrapePageParityError) {
      logDeepScrapeEvent("brain_deep_scrape_page_parity_failed", {
        organizationId: input.organizationId,
        jobId: input.jobId,
        sourceType: "brain",
        identityId: input.identityId,
        rootUrl: input.rootUrl,
        failureCode: error.code,
        diagnostic: {
          ...error.diagnostic,
          acceptedPageCount: input.acceptedPageCount,
          promotedPageCount,
          normalizedUrls: listValidDeepPages(payload.pages).map((page) => page.url),
        },
      });
    }
    throw error;
  }

  const { data, error } = await supabaseAdmin
    .from("athena_identity")
    .update({
      website_intelligence: payload,
      updated_at: new Date().toISOString(),
    })
    .eq("id", input.identityId)
    .eq("organization_id", input.organizationId)
    .select("website_intelligence")
    .maybeSingle();

  if (error) {
    throw new Error(`PERSISTENCE_FAILED: ${error.message}`);
  }
  if (!data) {
    throw new DeepScrapePageParityError(
      "Brain identity update matched zero rows while promoting deep website intelligence",
      {
        identityId: input.identityId,
        organizationId: input.organizationId,
      },
    );
  }

  const storedPages = countDeepPages(
    (data as { website_intelligence?: unknown }).website_intelligence &&
      typeof (data as { website_intelligence?: unknown }).website_intelligence ===
        "object"
      ? (
          (data as { website_intelligence: Record<string, unknown> })
            .website_intelligence as { pages?: unknown }
        ).pages
      : null,
  );

  try {
    assertDeepScrapePageParity({
      acceptedPageCount: input.acceptedPageCount,
      synthesisInputPageCount: input.acceptedPageCount,
      crawlResultPageCount: countDeepPages(input.intelligence.pages),
      promotedPageCount: storedPages,
      promotedPages: (
        (data as { website_intelligence: DeepWebsiteIntelligence })
          .website_intelligence
      ).pages,
    });
  } catch (error) {
    if (error instanceof DeepScrapePageParityError) {
      logDeepScrapeEvent("brain_deep_scrape_page_parity_failed", {
        organizationId: input.organizationId,
        jobId: input.jobId,
        sourceType: "brain",
        identityId: input.identityId,
        rootUrl: input.rootUrl,
        failureCode: error.code,
        diagnostic: {
          ...error.diagnostic,
          phase: "identity_readback",
        },
      });
    }
    throw error;
  }

  logDeepScrapeEvent("brain_deep_scrape_identity_promoted", {
    organizationId: input.organizationId,
    jobId: input.jobId,
    sourceType: "brain",
    identityId: input.identityId,
    rootUrl: input.rootUrl,
    pagesAnalyzed: storedPages,
    diagnostic: {
      acceptedPageCount: input.acceptedPageCount,
      promotedPageCount: storedPages,
      normalizedUrls: listValidDeepPages(payload.pages).map((page) => page.url),
    },
  });
  logDeepScrapeEvent("brain_deep_scrape_page_parity_verified", {
    organizationId: input.organizationId,
    jobId: input.jobId,
    sourceType: "brain",
    identityId: input.identityId,
    rootUrl: input.rootUrl,
    pagesAnalyzed: storedPages,
    diagnostic: {
      acceptedPageCount: input.acceptedPageCount,
      synthesisInputPageCount: input.acceptedPageCount,
      crawlResultPageCount: countDeepPages(input.intelligence.pages),
      promotedPageCount: storedPages,
    },
  });

  return payload;
}

async function promoteProspectIntelligence(input: {
  prospectId: string;
  organizationId: string;
  intelligence: DeepWebsiteIntelligence;
}): Promise<DeepWebsiteIntelligence> {
  const payload = buildPromotableDeepWebsiteIntelligence(input.intelligence);
  const updated = await updateProspect(input.prospectId, input.organizationId, {
    website_intelligence: payload as unknown as Record<string, unknown>,
  });
  if (!updated) {
    throw new Error("PERSISTENCE_FAILED");
  }
  return payload;
}

function checkpointIntelligence(
  job: AthenaWebsiteDeepScrapeJob,
): DeepWebsiteIntelligence | null {
  if (!job.crawl_result) return null;
  if (!deepIntelligenceHasUsableContent(job.crawl_result)) return null;
  const intel = job.crawl_result as unknown as DeepWebsiteIntelligence;
  const pageCount = countDeepPages(intel.pages);
  if (pageCount <= 0) return null;
  // Stale/collapsed checkpoint: progress saw more accepted pages than persisted.
  const progressAccepted =
    typeof job.progress?.pagesAccepted === "number"
      ? job.progress.pagesAccepted
      : typeof job.progress?.pagesCrawled === "number"
        ? job.progress.pagesCrawled
        : job.pages_crawled;
  if (progressAccepted > 1 && pageCount <= 1) {
    return null;
  }
  if (intel.pages_analyzed !== pageCount) {
    intel.pages_analyzed = pageCount;
  }
  return intel;
}

async function persistSynthesisCheckpoint(input: {
  job: AthenaWebsiteDeepScrapeJob;
  intelligence: DeepWebsiteIntelligence;
  crawlSummary: Record<string, unknown> | DeepWebsiteIntelligence["crawl_summary"];
  pagesDiscovered: number;
  pagesCrawled: number;
  pagesAnalyzed: number;
}): Promise<void> {
  await updateDeepScrapeJobFields({
    jobId: input.job.id,
    organizationId: input.job.organization_id,
    patch: {
      crawl_result: input.intelligence,
      crawl_summary: input.crawlSummary,
      pages_discovered: input.pagesDiscovered,
      pages_crawled: input.pagesCrawled,
      pages_analyzed: input.pagesAnalyzed,
      current_stage: "persisting",
      progress: {
        ...(input.job.progress ?? {}),
        pagesDiscovered: input.pagesDiscovered,
        pagesCrawled: input.pagesCrawled,
        pagesAnalyzed: input.pagesAnalyzed,
        synthesisCompleted: true,
        phase: "persisting",
      },
    },
  });
}

export async function executeClaimedDeepScrapeJob(
  workerId: string,
  claimed: { job: AthenaWebsiteDeepScrapeJob; claimToken: string },
  options?: { shouldStop?: () => boolean },
): Promise<"completed" | "failed" | "retryable" | "claim_lost" | "awaiting_follow_on"> {
  const { job, claimToken } = claimed;
  const workerConfig = getAthenaWorkerConfig();
  let terminalWritten = false;

  const heartbeat = new DeepScrapeHeartbeatController({
    jobId: job.id,
    claimToken,
    workerId,
    organizationId: job.organization_id,
    sourceType: job.source_type,
    leaseSeconds: workerConfig.leaseSeconds,
    intervalMs: workerConfig.heartbeatIntervalMs,
    initialStage: isPersistedDeepScrapeStage(job.current_stage)
      ? job.current_stage
      : "discovering",
  });

  const renewLease: RenewLease = async (stage, progress) => {
    await heartbeat.renew(stage, progress);
  };

  const isClaimLost = () =>
    heartbeat.isClaimLost || Boolean(heartbeat.validationError);

  heartbeat.start();

  try {
    logDeepScrapeEvent("deep_scrape_job_claimed", {
      organizationId: job.organization_id,
      jobId: job.id,
      sourceType: job.source_type,
      identityId: job.identity_id,
      prospectId: job.prospect_id,
      domain: job.normalized_domain,
      stage: job.current_stage,
      diagnostic: {
        workerId,
        attemptCount: job.attempt_count,
        leaseExpiry: job.claim_expires_at,
        checkpointFlags: {
          hasCrawlResult: Boolean(job.crawl_result),
          promoted: Boolean(job.promoted_at),
          hasFollowOn: Boolean(job.follow_on_generation_job_id),
          hasExecutiveVersion: Boolean(job.result_executive_version_id),
        },
      },
    });

    // Resume Phase B when intelligence was already promoted.
    if (job.promoted_at && job.source_type === "brain") {
      const result = await runBrainPhaseB(
        job,
        claimToken,
        renewLease,
        isClaimLost,
      );
      if (result === "completed") {
        terminalWritten = true;
        logDeepScrapeEvent("deep_scrape_job_completed", {
          organizationId: job.organization_id,
          jobId: job.id,
          sourceType: "brain",
          identityId: job.identity_id,
          domain: job.normalized_domain,
          pagesAnalyzed: job.pages_analyzed,
        });
      }
      return result;
    }
    if (job.promoted_at && job.source_type === "prospect") {
      return await parkProspectPhaseB(
        job,
        claimToken,
        renewLease,
        isClaimLost,
        () => heartbeat.stop(),
      );
    }

    // Resume Phase A promote when synthesis checkpoint already exists.
    const reused = checkpointIntelligence(job);
    let intelligence: DeepWebsiteIntelligence;
    let pagesDiscovered = job.pages_discovered;
    let pagesCrawled = job.pages_crawled;
    let pagesAnalyzed = job.pages_analyzed;
    let crawlSummary =
      (job.crawl_summary as DeepWebsiteIntelligence["crawl_summary"] | null) ??
      null;

    if (reused) {
      logDeepScrapeEvent("deep_scrape_checkpoint_reused", {
        organizationId: job.organization_id,
        jobId: job.id,
        sourceType: job.source_type,
        identityId: job.identity_id,
        prospectId: job.prospect_id,
        domain: job.normalized_domain,
        pagesAnalyzed: reused.pages_analyzed,
        diagnostic: {
          workerId,
          checkpoint: "synthesis",
          synthesisSkipped: true,
          crawlSkipped: true,
        },
      });
      intelligence = buildPromotableDeepWebsiteIntelligence(reused);
      pagesAnalyzed = countDeepPages(intelligence.pages);
      pagesCrawled = Math.max(pagesCrawled, pagesAnalyzed);
      crawlSummary = intelligence.crawl_summary;
      if (job.source_type === "brain") {
        logDeepScrapeEvent("brain_deep_scrape_pages_collected", {
          organizationId: job.organization_id,
          jobId: job.id,
          sourceType: "brain",
          identityId: job.identity_id,
          rootUrl: job.root_url,
          pagesAnalyzed,
          diagnostic: {
            checkpointReused: true,
            acceptedPageCount: pagesAnalyzed,
            synthesisInputPageCount: pagesAnalyzed,
            crawlResultPageCount: pagesAnalyzed,
            normalizedUrls: listValidDeepPages(intelligence.pages).map(
              (page) => page.url,
            ),
          },
        });
      }
      await renewLease("persisting", {
        pagesDiscovered,
        pagesCrawled,
        pagesAnalyzed,
        synthesisCompleted: true,
        phase: "persisting",
      });
    } else {
      await renewLease("discovering", {
        pagesDiscovered: 0,
        pagesCrawled: 0,
        pagesTarget: 25,
      });
      if (options?.shouldStop?.()) return "claim_lost";
      if (heartbeat.validationError) throw heartbeat.validationError;

      const crawl = await runDeepWebsiteCrawl({
        websiteUrl: job.root_url,
        organizationId: job.organization_id,
        jobId: job.id,
        sourceType: job.source_type,
        onProgress: async (progress) => {
          await renewLease(progress.stage, {
            pagesDiscovered: progress.pagesDiscovered,
            pagesCrawled: progress.pagesCrawled,
            pagesTarget: progress.pagesTarget,
            pagesAttempted: progress.pagesAttempted ?? null,
            pagesAccepted: progress.pagesAccepted ?? progress.pagesCrawled,
            pagesRendered: progress.pagesRendered ?? 0,
            pagesRejected: progress.pagesRejected ?? 0,
            phase: progress.stage === "rendering" ? "rendering" : progress.stage,
          });
        },
      });

      if (heartbeat.validationError) throw heartbeat.validationError;

      if (!deepIntelligenceHasUsableContent(crawl.intelligence)) {
        throw new Error("INSUFFICIENT_USEFUL_CONTENT");
      }

      intelligence = crawl.intelligence;
      pagesDiscovered = crawl.pagesDiscovered;
      pagesCrawled = crawl.pagesCrawled;
      pagesAnalyzed = crawl.pagesAnalyzed;
      crawlSummary = crawl.crawlSummary;

      // Durable synthesis checkpoint before promote — reclaim must not re-call Gemini.
      await renewLease("persisting", {
        pagesDiscovered,
        pagesCrawled,
        pagesAnalyzed,
        synthesisCompleted: true,
        phase: "persisting",
      });
      await persistSynthesisCheckpoint({
        job,
        intelligence,
        crawlSummary,
        pagesDiscovered,
        pagesCrawled,
        pagesAnalyzed,
      });
      job.crawl_result = intelligence as unknown as Record<string, unknown>;
      job.crawl_summary = crawlSummary as unknown as Record<string, unknown>;
      job.pages_discovered = pagesDiscovered;
      job.pages_crawled = pagesCrawled;
      job.pages_analyzed = pagesAnalyzed;
    }

    if (options?.shouldStop?.()) return "claim_lost";
    if (heartbeat.validationError) throw heartbeat.validationError;

    const acceptedPageCount = countDeepPages(intelligence.pages);
    if (acceptedPageCount <= 0) {
      throw new DeepScrapePageParityError(
        "Synthesized deep intelligence contained no valid pages",
        { jobId: job.id, sourceType: job.source_type },
      );
    }
    // Prefer the durable page array length over any stale counter.
    pagesAnalyzed = acceptedPageCount;
    intelligence = buildPromotableDeepWebsiteIntelligence(intelligence);

    if (job.source_type === "brain" && job.identity_id) {
      logDeepScrapeEvent("brain_deep_scrape_crawl_result_persisted", {
        organizationId: job.organization_id,
        jobId: job.id,
        sourceType: "brain",
        identityId: job.identity_id,
        rootUrl: job.root_url,
        pagesAnalyzed: acceptedPageCount,
        diagnostic: {
          crawlResultPageCount: acceptedPageCount,
          pagesCrawled,
          pagesDiscovered,
          normalizedUrls: listValidDeepPages(intelligence.pages).map(
            (page) => page.url,
          ),
        },
      });
      intelligence = await promoteBrainIntelligence({
        identityId: job.identity_id,
        organizationId: job.organization_id,
        jobId: job.id,
        rootUrl: job.root_url,
        intelligence,
        acceptedPageCount,
      });
    } else if (job.source_type === "prospect" && job.prospect_id) {
      intelligence = await promoteProspectIntelligence({
        prospectId: job.prospect_id,
        organizationId: job.organization_id,
        intelligence,
      });
    } else {
      throw new Error("INVALID_SOURCE");
    }

    pagesAnalyzed = countDeepPages(intelligence.pages);

    const promotedAt = new Date().toISOString();
    await updateDeepScrapeJobFields({
      jobId: job.id,
      organizationId: job.organization_id,
      patch: {
        promoted_at: promotedAt,
        pages_analyzed: pagesAnalyzed,
        crawl_result: intelligence,
        crawl_summary: {
          ...(crawlSummary as Record<string, unknown>),
          pages_analyzed: pagesAnalyzed,
        },
      },
    });

    logDeepScrapeEvent("deep_intelligence_promoted", {
      organizationId: job.organization_id,
      jobId: job.id,
      sourceType: job.source_type,
      identityId: job.identity_id,
      prospectId: job.prospect_id,
      domain: job.normalized_domain,
      pagesAnalyzed,
    });

    job.promoted_at = promotedAt;
    job.pages_analyzed = pagesAnalyzed;
    job.crawl_result = intelligence as unknown as Record<string, unknown>;
    job.crawl_summary = {
      ...(crawlSummary as Record<string, unknown>),
      pages_analyzed: pagesAnalyzed,
    };

    if (job.source_type === "brain") {
      const result = await runBrainPhaseB(
        job,
        claimToken,
        renewLease,
        isClaimLost,
      );
      if (result === "completed") {
        terminalWritten = true;
        logDeepScrapeEvent("deep_scrape_job_completed", {
          organizationId: job.organization_id,
          jobId: job.id,
          sourceType: "brain",
          identityId: job.identity_id,
          domain: job.normalized_domain,
          pagesAnalyzed: job.pages_analyzed,
        });
      }
      return result;
    }
    return await parkProspectPhaseB(
      job,
      claimToken,
      renewLease,
      isClaimLost,
      () => heartbeat.stop(),
    );
  } catch (error) {
    const classified = classifyDeepScrapeError(error);
    logDeepScrapeEvent("deep_scrape_failed", {
      organizationId: job.organization_id,
      jobId: job.id,
      sourceType: job.source_type,
      identityId: job.identity_id,
      prospectId: job.prospect_id,
      domain: job.normalized_domain,
      failureCode: classified.code,
      stage: heartbeat.stage ?? job.current_stage,
    });
    logDeepScrapeEvent("deep_scrape_job_failed", {
      organizationId: job.organization_id,
      jobId: job.id,
      sourceType: job.source_type,
      failureCode: classified.code,
      stage: heartbeat.stage ?? job.current_stage,
      diagnostic: {
        workerId,
        retryable: classified.retryable,
        attemptCount: job.attempt_count,
      },
    });

    // Keep promoted deep intelligence; Phase B failures are always retryable
    // unless the failure is a non-retryable lifecycle/schema error.
    const retryable =
      classified.code === "DEEP_SCRAPE_STATE_TRANSITION_INVALID" ||
      classified.code === BRAIN_DEEP_SCRAPE_PAGE_PARITY_FAILED
        ? false
        : job.promoted_at
          ? true
          : classified.retryable;

    const failedStage = job.promoted_at
      ? job.source_type === "brain"
        ? "retraining"
        : "regenerating"
      : heartbeat.stage && isPersistedDeepScrapeStage(heartbeat.stage)
        ? heartbeat.stage
        : isPersistedDeepScrapeStage(job.current_stage)
          ? job.current_stage
          : "failed";

    const failed = await failDeepScrapeJobWithClaim({
      jobId: job.id,
      claimToken,
      organizationId: job.organization_id,
      errorCode: classified.code,
      errorMessage: formatDeepScrapeErrorMessage(
        classified.code,
        classified.message,
      ),
      retryable,
      attemptCount: job.attempt_count,
      failedStage,
      errorMetadata: {
        workerId,
        phase: job.promoted_at ? "B" : "A",
      },
    });
    terminalWritten = true;

    return failed?.status === "retryable" ? "retryable" : "failed";
  } finally {
    await heartbeat.stop();
    void terminalWritten;
  }
}

async function runBrainPhaseB(
  job: AthenaWebsiteDeepScrapeJob,
  claimToken: string,
  renewLease: RenewLease,
  isClaimLost: () => boolean,
): Promise<"completed" | "failed" | "retryable" | "claim_lost"> {
  if (!job.identity_id) {
    throw new Error("INVALID_SOURCE");
  }

  await renewLease("retraining", {
    pagesAnalyzed: job.pages_analyzed,
    phase: "brain_deep_scrape",
  });
  if (isClaimLost()) return "claim_lost";

  logDeepScrapeEvent("brain_retraining_started", {
    organizationId: job.organization_id,
    jobId: job.id,
    sourceType: "brain",
    identityId: job.identity_id,
    domain: job.normalized_domain,
    pagesAnalyzed: job.pages_analyzed,
    stage: "retraining",
  });

  const identity = await getAthenaIdentityById(
    job.identity_id,
    job.organization_id,
  );
  if (!identity) {
    throw new Error("IDENTITY_NOT_FOUND");
  }

  const promotedPageCount = readDeepIntelligencePageCount(
    identity.website_intelligence,
  );
  if (promotedPageCount <= 0) {
    throw new DeepScrapePageParityError(
      "Brain retraining refused: promoted website_intelligence has no pages",
      {
        jobId: job.id,
        identityId: job.identity_id,
        jobPagesAnalyzed: job.pages_analyzed,
      },
    );
  }

  const compiled = await compileMasterIdentityProfile(
    identity,
    job.organization_id,
  );

  const trainedAt = new Date().toISOString();
  // Last Deep Scrape counters come from promoted pages, never a stale job counter.
  await supabaseAdmin
    .from("athena_identity")
    .update({
      last_deep_scrape_at: trainedAt,
      last_deep_scrape_pages: promotedPageCount,
      updated_at: trainedAt,
    })
    .eq("id", job.identity_id)
    .eq("organization_id", job.organization_id);

  if (!compiled || compiled.brain_status !== "ready") {
    throw new Error("BRAIN_RETRAINING_FAILED");
  }

  assertDeepScrapePageParity({
    acceptedPageCount: promotedPageCount,
    synthesisInputPageCount: promotedPageCount,
    crawlResultPageCount: promotedPageCount,
    promotedPageCount,
    lastDeepScrapePages: promotedPageCount,
    promotedPages: isDeepWebsiteIntelligence(identity.website_intelligence)
      ? identity.website_intelligence.pages
      : [],
  });

  const completed = await completeDeepScrapeJobWithClaim({
    jobId: job.id,
    claimToken,
    organizationId: job.organization_id,
    pagesAnalyzed: promotedPageCount,
    brainRetrainedAt: trainedAt,
    crawlSummary: job.crawl_summary,
  });

  logDeepScrapeEvent("brain_retraining_completed", {
    organizationId: job.organization_id,
    jobId: job.id,
    sourceType: "brain",
    identityId: job.identity_id,
    domain: job.normalized_domain,
    pagesAnalyzed: job.pages_analyzed,
  });

  return completed ? "completed" : "claim_lost";
}

/**
 * Enqueue existing full Prospect generation, then park deep job so the worker
 * can process the generation job. Finalization happens in reconcileAwaitingFollowOnJobs.
 */
async function parkProspectPhaseB(
  job: AthenaWebsiteDeepScrapeJob,
  claimToken: string,
  renewLease: RenewLease,
  isClaimLost: () => boolean,
  stopHeartbeat?: () => Promise<void>,
): Promise<"awaiting_follow_on" | "failed" | "retryable" | "claim_lost"> {
  if (!job.prospect_id) {
    throw new Error("INVALID_SOURCE");
  }

  await renewLease("regenerating", {
    pagesAnalyzed: job.pages_analyzed,
    phase: "prospect_deep_scrape",
  });
  if (isClaimLost()) return "claim_lost";

  const prospect = await getProspectById(
    job.prospect_id,
    job.organization_id,
  );
  if (!prospect) {
    throw new Error("PROSPECT_NOT_FOUND");
  }

  let followOnJobId = job.follow_on_generation_job_id;
  let reusedFollowOn = false;
  if (followOnJobId) {
    const existing = await getGenerationJobById(
      followOnJobId,
      job.organization_id,
    );
    if (
      existing &&
      (existing.status === "queued" ||
        existing.status === "processing" ||
        existing.status === "retryable" ||
        existing.status === "completed")
    ) {
      reusedFollowOn = true;
      logDeepScrapeEvent("deep_scrape_follow_on_reused", {
        organizationId: job.organization_id,
        jobId: job.id,
        sourceType: "prospect",
        prospectId: job.prospect_id,
        followOnJobId,
        executiveVersionId:
          existing.published_version_id ?? existing.executive_version_id,
        diagnostic: {
          generationStatus: existing.status,
        },
      });
    } else {
      followOnJobId = null;
    }
  }

  if (!followOnJobId) {
    const queued = await ensureProspectGenerationQueued(prospect, {
      requestedBy: job.requested_by,
      triggerType: "prospect_deep_scrape",
    });
    followOnJobId = queued.jobId ?? null;
    if (!followOnJobId) {
      throw new Error("PROSPECT_GENERATION_ENQUEUE_FAILED");
    }

    logDeepScrapeEvent("prospect_generation_started", {
      organizationId: job.organization_id,
      jobId: job.id,
      sourceType: "prospect",
      prospectId: job.prospect_id,
      discussionId: prospect.linked_discussion_id,
      domain: job.normalized_domain,
      followOnJobId,
      pagesAnalyzed: job.pages_analyzed,
      diagnostic: {
        reusedFollowOn,
      },
    });
  }

  // Stop heartbeat before releasing the claim so late ticks cannot write.
  if (stopHeartbeat) {
    await stopHeartbeat();
  }

  const parked = await updateDeepScrapeJobFields({
    jobId: job.id,
    organizationId: job.organization_id,
    patch: {
      status: "awaiting_follow_on",
      current_stage: "regenerating",
      follow_on_generation_job_id: followOnJobId,
      claim_token: null,
      claimed_by: null,
      claim_expires_at: null,
      discussion_id: prospect.linked_discussion_id,
      progress: {
        ...(job.progress ?? {}),
        phase: "awaiting_follow_on",
        followOnJobId,
      },
    },
  });

  // Drop claim without failing — status already awaiting_follow_on.
  void claimToken;
  void parked;

  return "awaiting_follow_on";
}

/**
 * Finalize Prospect deep-scrape jobs waiting on generation completion.
 * Called from the worker loop so concurrency-1 can still process generation jobs.
 */
export async function reconcileAwaitingFollowOnJobs(): Promise<boolean> {
  const { data, error } = await supabaseAdmin
    .from("athena_website_deep_scrape_jobs")
    .select("*")
    .eq("status", "awaiting_follow_on")
    .eq("source_type", "prospect")
    .order("updated_at", { ascending: true })
    .limit(5);

  if (error || !data?.length) {
    return false;
  }

  let changed = false;

  for (const row of data) {
    const job = row as Record<string, unknown>;
    const jobId = String(job.id);
    const organizationId = String(job.organization_id);
    const followOnId = job.follow_on_generation_job_id
      ? String(job.follow_on_generation_job_id)
      : null;
    const prospectId = job.prospect_id ? String(job.prospect_id) : null;

    if (!followOnId) {
      await updateDeepScrapeJobFields({
        jobId,
        organizationId,
        patch: {
          status: "retryable",
          current_stage: "regenerating",
          error_code: "MISSING_FOLLOW_ON_JOB",
          error_message: "Follow-on generation job missing after deep scrape.",
          next_attempt_at: new Date(Date.now() + 15_000).toISOString(),
        },
      });
      changed = true;
      continue;
    }

    const generationJob = await getGenerationJobById(followOnId, organizationId);
    if (!generationJob) {
      continue;
    }

    if (
      generationJob.status === "queued" ||
      generationJob.status === "processing" ||
      generationJob.status === "retryable"
    ) {
      continue;
    }

    if (generationJob.status === "completed") {
      const versionId =
        generationJob.published_version_id ??
        generationJob.executive_version_id ??
        null;

      // Idempotent: already completed with the same EV.
      if (
        job.status === "completed" &&
        job.result_executive_version_id === versionId
      ) {
        continue;
      }

      const completedAt =
        typeof job.completed_at === "string" && job.completed_at
          ? job.completed_at
          : new Date().toISOString();

      await updateDeepScrapeJobFields({
        jobId,
        organizationId,
        patch: {
          status: "completed",
          current_stage: "completed",
          result_executive_version_id: versionId,
          completed_at: completedAt,
          error_code: null,
          error_message: null,
        },
      });

      logDeepScrapeEvent("executive_version_published", {
        organizationId,
        jobId,
        sourceType: "prospect",
        prospectId,
        discussionId: generationJob.discussion_id,
        executiveVersionId: versionId,
        followOnJobId: followOnId,
        pagesAnalyzed: Number(job.pages_analyzed ?? 0),
      });
      logDeepScrapeEvent("deep_scrape_job_completed", {
        organizationId,
        jobId,
        sourceType: "prospect",
        prospectId,
        executiveVersionId: versionId,
        followOnJobId: followOnId,
        pagesAnalyzed: Number(job.pages_analyzed ?? 0),
      });
      changed = true;
      continue;
    }

    // Generation failed terminal — keep deep intel, mark deep job failed (regen retry via new click or retryable).
    await updateDeepScrapeJobFields({
      jobId,
      organizationId,
      patch: {
        status: "retryable",
        current_stage: "regenerating",
        error_code: generationJob.error_code ?? "PROSPECT_GENERATION_FAILED",
        error_message:
          generationJob.error_message ??
          "Prospect generation failed after deep scrape promotion.",
        next_attempt_at: new Date(Date.now() + 30_000).toISOString(),
        // Keep promoted_at so reclaim resumes Phase B only.
      },
    });
    changed = true;
  }

  return changed;
}

export async function claimAndExecuteNextDeepScrapeJob(
  workerId: string,
  options?: { shouldStop?: () => boolean },
): Promise<boolean> {
  const { claimNextDeepScrapeJob } = await import(
    "@/services/websiteLearning/deepScrape/deepScrapeJobService"
  );

  const claimed = await claimNextDeepScrapeJob({ workerId });
  if (!claimed) {
    return false;
  }

  console.log("[ATHENA_DEEP_SCRAPE] job_claimed", {
    workerId,
    jobId: claimed.job.id,
    sourceType: claimed.job.source_type,
  });

  await executeClaimedDeepScrapeJob(workerId, claimed, options);
  return true;
}
