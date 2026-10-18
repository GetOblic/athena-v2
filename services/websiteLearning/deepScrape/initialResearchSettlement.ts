/**
 * Exactly-once evidence-free fallback after a failed initial Deep Scrape.
 * Does not crawl, does not write website intelligence, and does not reserve
 * or consume a second Free entitlement.
 */

import {
  compileMasterIdentityProfile,
  getAthenaIdentityById,
  releaseIdentityBrainProcessing,
} from "@/services/identity/identityService";
import { isIdentityBrainObtained } from "@/lib/organization/freeIdentityGeneration";
import {
  findInitialResearchFallbackGenerationJob,
  getGenerationJobById,
  readActiveGenerationJobForDiscussion,
} from "@/services/generationJobs/generationJobService";
import { ensureProspectGenerationQueued } from "@/services/prospects/prospectImporter";
import {
  getProspectById,
  updateProspect,
} from "@/services/prospects/prospectService";
import {
  failDeepScrapeJobWithClaim,
  releaseProcessingDeepScrapeForRetry,
  updateDeepScrapeJobFields,
} from "@/services/websiteLearning/deepScrape/deepScrapeJobService";
import type { AthenaWebsiteDeepScrapeJob } from "@/services/websiteLearning/deepScrape/deepScrapeJobTypes";
import { formatDeepScrapeErrorMessage } from "@/services/websiteLearning/deepScrape/deepScrapeJobTypes";
import {
  ACTIVE_GENERATION_LOOKUP_FAILED,
  FALLBACK_GENERATION_LOOKUP_FAILED,
  INITIAL_RESEARCH_FOLLOW_ON_TRIGGER,
  UNRELATED_ACTIVE_GENERATION_BLOCK,
  adoptedFallbackFollowOnId,
  buildInitialResearchFallbackGenerationProgress,
  continuationForClaimedInitialResearch,
  decideDeferredFallbackSettlement,
  decideUnresolvedFallbackWrite,
  isInitialResearchFallbackGenerationProgress,
  nonConsumingFallbackBlockMessage,
  planEvidenceFreeProspectFallback,
  readInitialResearchOrchestration,
  unchangedFallbackAttempts,
  visibleStatusAfterFallbackGiveUp,
  withInitialResearchFallback,
} from "@/services/websiteLearning/deepScrape/initialResearchPolicy";

/** Same delay as the retryable fail RPC. */
const FALLBACK_SETTLEMENT_RETRY_DELAY_MS = 30_000;

export async function settleEvidenceFreeInitialResearch(input: {
  job: AthenaWebsiteDeepScrapeJob;
  claimToken: string;
  errorCode: string;
  errorMessage: string;
}): Promise<"failed" | "retryable" | "claim_lost"> {
  const job = input.job;
  const orchestration = readInitialResearchOrchestration(job.progress);
  const failureCode = orchestration?.failureCode ?? input.errorCode;
  const failureMessage =
    orchestration?.failureMessage ??
    formatDeepScrapeErrorMessage(input.errorCode, input.errorMessage);

  if (orchestration?.fallback === "settled") {
    const failed = await failDeepScrapeJobWithClaim({
      jobId: job.id,
      claimToken: input.claimToken,
      organizationId: job.organization_id,
      errorCode: failureCode,
      errorMessage: failureMessage,
      retryable: false,
      attemptCount: job.attempt_count,
      failedStage: "failed",
      errorMetadata: {
        phase: "initial_research_fallback",
        researchSucceeded: false,
        followOnJobId: job.follow_on_generation_job_id,
      },
    });
    if (!failed) return "claim_lost";
    if (!job.follow_on_generation_job_id) {
      await settleVisibleInitialResearchGiveUp(job);
    }
    return failed.status === "retryable" ? "retryable" : "failed";
  }

  const pendingProgress = withInitialResearchFallback(job.progress, {
    fallback: "pending",
    failureCode,
    failureMessage,
    fallbackAttempts: orchestration?.fallbackAttempts ?? 0,
  });
  job.progress = pendingProgress;
  await updateDeepScrapeJobFields({
    jobId: job.id,
    organizationId: job.organization_id,
    patch: { progress: pendingProgress },
  });

  const followOn = await resolveExistingFallbackFollowOn(job);
  if (followOn.status === "unavailable") {
    const blocked = planEvidenceFreeProspectFallback({
      lookupUnavailable: true,
      existingFallbackJobId: null,
    });
    return deferInitialResearchFallback({
      job,
      claimToken: input.claimToken,
      failureCode,
      failureMessage,
      fallbackAttempts: unchangedFallbackAttempts(
        orchestration?.fallbackAttempts ?? 0,
      ),
      blockedMessage:
        blocked.action === "defer_unrelated_active_generation"
          ? UNRELATED_ACTIVE_GENERATION_BLOCK
          : FALLBACK_GENERATION_LOOKUP_FAILED,
    });
  }
  if (followOn.status === "found") {
    await persistFollowOnId(job, followOn.id);
  } else {
    job.follow_on_generation_job_id = null;
  }
  const brainReady = await identityBrainReady(job);
  const continuation = continuationForClaimedInitialResearch({
    isInitialResearch: true,
    promoted: Boolean(job.promoted_at),
    fallback: "pending",
    fallbackAttempts: orchestration?.fallbackAttempts ?? 0,
    sourceType: job.source_type,
    terminalFailure: true,
    followOnJobId: job.follow_on_generation_job_id,
    followOnMatchesFallback: Boolean(job.follow_on_generation_job_id),
    brainReady,
  });

  try {
    if (continuation.kind === "evidence_free_brain_compile" && !continuation.alreadyReady) {
      const identity = job.identity_id
        ? await getAthenaIdentityById(job.identity_id, job.organization_id)
        : null;
      if (!identity) throw new Error("IDENTITY_NOT_FOUND");
      await compileMasterIdentityProfile(identity, job.organization_id, {
        skipLiveWebsiteFetch: true,
      });
      if (!(await identityBrainReady(job))) {
        throw new Error("BRAIN_COMPILE_NOT_READY");
      }
    } else if (
      continuation.kind === "evidence_free_prospect_fallback" &&
      !continuation.reuseFollowOn
    ) {
      const enqueued = await enqueueProspectEvidenceFreeGeneration(job);
      await persistFollowOnId(job, enqueued);
    } else if (
      continuation.kind === "evidence_free_prospect_fallback" &&
      job.follow_on_generation_job_id
    ) {
      await persistFollowOnId(job, job.follow_on_generation_job_id);
    }

    const settled = withInitialResearchFallback(job.progress, {
      fallback: "settled",
      failureCode,
      failureMessage,
    });
    job.progress = settled;
    await updateDeepScrapeJobFields({
      jobId: job.id,
      organizationId: job.organization_id,
      patch: { progress: settled },
    });

    const failed = await failDeepScrapeJobWithClaim({
      jobId: job.id,
      claimToken: input.claimToken,
      organizationId: job.organization_id,
      errorCode: failureCode,
      errorMessage: failureMessage,
      retryable: false,
      attemptCount: job.attempt_count,
      failedStage: job.promoted_at ? "regenerating" : "failed",
      errorMetadata: {
        phase: "initial_research_fallback",
        researchSucceeded: false,
        followOnJobId: job.follow_on_generation_job_id,
      },
    });
    if (!failed) return "claim_lost";
    if (
      continuation.kind === "terminal_failure_only" &&
      !job.follow_on_generation_job_id
    ) {
      await settleVisibleInitialResearchGiveUp(job);
    }
    return failed.status === "retryable" ? "retryable" : "failed";
  } catch (error) {
    const blocked = nonConsumingFallbackBlockMessage(error);
    if (blocked) {
      return deferInitialResearchFallback({
        job,
        claimToken: input.claimToken,
        failureCode,
        failureMessage,
        fallbackAttempts: unchangedFallbackAttempts(
          orchestration?.fallbackAttempts ?? 0,
        ),
        blockedMessage: blocked,
      });
    }
    const attempts = (orchestration?.fallbackAttempts ?? 0) + 1;
    const retryProgress = withInitialResearchFallback(job.progress, {
      fallback: "pending",
      failureCode,
      failureMessage,
      fallbackAttempts: attempts,
    });
    job.progress = retryProgress;
    await updateDeepScrapeJobFields({
      jobId: job.id,
      organizationId: job.organization_id,
      patch: { progress: retryProgress },
    });

    const write = decideUnresolvedFallbackWrite({
      fallbackAttemptsAfterFailure: attempts,
      crawlAttemptCount: job.attempt_count,
      crawlMaxAttempts: job.max_attempts,
      followOnPersisted: Boolean(job.follow_on_generation_job_id),
    });
    const errorMessage =
      error instanceof Error ? error.message : failureMessage;

    if (write.method === "direct_retryable") {
      const released = await releaseProcessingDeepScrapeForRetry({
        jobId: job.id,
        claimToken: input.claimToken,
        organizationId: job.organization_id,
        errorCode: failureCode,
        errorMessage,
        nextAttemptAt: new Date(
          Date.now() + FALLBACK_SETTLEMENT_RETRY_DELAY_MS,
        ).toISOString(),
        errorMetadata: {
          phase: "initial_research_fallback",
          researchSucceeded: false,
          fallbackAttempts: attempts,
        },
      });
      return released ? "retryable" : "claim_lost";
    }

    if (write.settleVisibleStatus) {
      const settled = withInitialResearchFallback(job.progress, {
        fallback: "settled",
        failureCode,
        failureMessage,
        fallbackAttempts: attempts,
      });
      job.progress = settled;
      await updateDeepScrapeJobFields({
        jobId: job.id,
        organizationId: job.organization_id,
        patch: { progress: settled },
      });
    }

    const failed = await failDeepScrapeJobWithClaim({
      jobId: job.id,
      claimToken: input.claimToken,
      organizationId: job.organization_id,
      errorCode: failureCode,
      errorMessage,
      retryable: write.retryable,
      attemptCount: job.attempt_count,
      failedStage: "failed",
      errorMetadata: {
        phase: "initial_research_fallback",
        researchSucceeded: false,
        fallbackAttempts: attempts,
      },
    });
    if (!failed) return "claim_lost";
    if (write.settleVisibleStatus) {
      await settleVisibleInitialResearchGiveUp(job);
    }
    return failed.status === "retryable" ? "retryable" : "failed";
  }
}

/**
 * Leave fallback pending and the job claimably retryable.
 * Does not increment fallbackAttempts, enqueue, crawl, or give up.
 */
async function deferInitialResearchFallback(input: {
  job: AthenaWebsiteDeepScrapeJob;
  claimToken: string;
  failureCode: string;
  failureMessage: string;
  fallbackAttempts: number;
  blockedMessage: string;
}): Promise<"failed" | "retryable" | "claim_lost"> {
  const fallbackAttempts = unchangedFallbackAttempts(input.fallbackAttempts);
  const retryProgress = withInitialResearchFallback(input.job.progress, {
    fallback: "pending",
    failureCode: input.failureCode,
    failureMessage: input.failureMessage,
    fallbackAttempts,
  });
  input.job.progress = retryProgress;
  await updateDeepScrapeJobFields({
    jobId: input.job.id,
    organizationId: input.job.organization_id,
    patch: { progress: retryProgress },
  });

  const write = decideDeferredFallbackSettlement({
    crawlAttemptCount: input.job.attempt_count,
    crawlMaxAttempts: input.job.max_attempts,
  });
  const errorMetadata = {
    phase: "initial_research_fallback",
    researchSucceeded: false,
    fallbackAttempts,
  };

  if (write.method === "direct_retryable") {
    const released = await releaseProcessingDeepScrapeForRetry({
      jobId: input.job.id,
      claimToken: input.claimToken,
      organizationId: input.job.organization_id,
      errorCode: input.failureCode,
      errorMessage: input.blockedMessage,
      nextAttemptAt: new Date(
        Date.now() + FALLBACK_SETTLEMENT_RETRY_DELAY_MS,
      ).toISOString(),
      errorMetadata,
    });
    return released ? "retryable" : "claim_lost";
  }

  const failed = await failDeepScrapeJobWithClaim({
    jobId: input.job.id,
    claimToken: input.claimToken,
    organizationId: input.job.organization_id,
    errorCode: input.failureCode,
    errorMessage: input.blockedMessage,
    retryable: true,
    attemptCount: input.job.attempt_count,
    failedStage: "failed",
    errorMetadata,
  });
  if (!failed) return "claim_lost";
  return failed.status === "retryable" ? "retryable" : "failed";
}

async function persistFollowOnId(
  job: AthenaWebsiteDeepScrapeJob,
  followOnJobId: string,
): Promise<void> {
  if (job.follow_on_generation_job_id === followOnJobId) return;
  const persisted = await updateDeepScrapeJobFields({
    jobId: job.id,
    organizationId: job.organization_id,
    patch: { follow_on_generation_job_id: followOnJobId },
  });
  if (!persisted) {
    throw new Error("FOLLOW_ON_PERSIST_FAILED");
  }
  job.follow_on_generation_job_id = followOnJobId;
}

async function settleVisibleInitialResearchGiveUp(
  job: AthenaWebsiteDeepScrapeJob,
): Promise<void> {
  if (job.follow_on_generation_job_id) return;

  if (job.source_type === "brain" && job.identity_id) {
    const identity = await getAthenaIdentityById(
      job.identity_id,
      job.organization_id,
    );
    const visible = visibleStatusAfterFallbackGiveUp({
      sourceType: "brain",
      identityBrainStatus: identity?.brain_status ?? null,
    });
    if (visible.identityBrainStatus === "pending") {
      await releaseIdentityBrainProcessing({
        identityId: job.identity_id,
        organizationId: job.organization_id,
      });
    }
    return;
  }

  if (job.source_type === "prospect" && job.prospect_id) {
    const visible = visibleStatusAfterFallbackGiveUp({
      sourceType: "prospect",
    });
    if (!visible.prospectStatus) return;
    await updateProspect(job.prospect_id, job.organization_id, {
      status: visible.prospectStatus,
      last_activity: new Date().toISOString(),
    });
  }
}

async function identityBrainReady(
  job: AthenaWebsiteDeepScrapeJob,
): Promise<boolean> {
  if (job.source_type !== "brain" || !job.identity_id) return false;
  const identity = await getAthenaIdentityById(
    job.identity_id,
    job.organization_id,
  );
  return isIdentityBrainObtained(identity);
}

async function resolveExistingFallbackFollowOn(
  job: AthenaWebsiteDeepScrapeJob,
): Promise<
  | { status: "found"; id: string }
  | { status: "none" }
  | { status: "unavailable" }
> {
  if (job.follow_on_generation_job_id) {
    const existing = await getGenerationJobById(
      job.follow_on_generation_job_id,
      job.organization_id,
    );
    if (!existing) {
      return { status: "found", id: job.follow_on_generation_job_id };
    }
    if (isInitialResearchFallbackGenerationProgress(existing.progress)) {
      return { status: "found", id: existing.id };
    }
  }
  const discussionId = await discussionIdForJob(job);
  if (!discussionId) return { status: "none" };
  const fallback = await findInitialResearchFallbackGenerationJob(
    discussionId,
    job.organization_id,
  );
  if (fallback.outcome === "error") return { status: "unavailable" };
  if (fallback.outcome === "found") {
    return { status: "found", id: fallback.job.id };
  }
  return { status: "none" };
}

async function discussionIdForJob(
  job: AthenaWebsiteDeepScrapeJob,
): Promise<string | null> {
  if (job.discussion_id) return job.discussion_id;
  if (!job.prospect_id) return null;
  const prospect = await getProspectById(job.prospect_id, job.organization_id);
  return prospect?.linked_discussion_id ?? null;
}

async function enqueueProspectEvidenceFreeGeneration(
  job: AthenaWebsiteDeepScrapeJob,
): Promise<string> {
  if (!job.prospect_id) throw new Error("INVALID_SOURCE");
  const prospect = await getProspectById(job.prospect_id, job.organization_id);
  if (!prospect) throw new Error("PROSPECT_NOT_FOUND");
  const discussionId = prospect.linked_discussion_id;
  const activeLookup = discussionId
    ? await readActiveGenerationJobForDiscussion(
        discussionId,
        job.organization_id,
      )
    : { outcome: "none" as const };
  const plan = planEvidenceFreeProspectFallback({
    lookupUnavailable: false,
    activeLookupUnavailable: activeLookup.outcome === "error",
    existingFallbackJobId: null,
    activeJobId: activeLookup.outcome === "found" ? activeLookup.job.id : null,
    activeProgress:
      activeLookup.outcome === "found" ? activeLookup.job.progress : null,
  });
  if (plan.action === "reuse") return plan.jobId;
  if (plan.action === "defer_lookup_unavailable") {
    throw new Error(FALLBACK_GENERATION_LOOKUP_FAILED);
  }
  if (plan.action === "defer_active_generation_lookup") {
    throw new Error(ACTIVE_GENERATION_LOOKUP_FAILED);
  }
  if (plan.action === "defer_unrelated_active_generation") {
    throw new Error(UNRELATED_ACTIVE_GENERATION_BLOCK);
  }
  const queued = await ensureProspectGenerationQueued(prospect, {
    requestedBy: job.requested_by,
    triggerType: INITIAL_RESEARCH_FOLLOW_ON_TRIGGER,
    progress: buildInitialResearchFallbackGenerationProgress(),
    skipInitialResearch: true,
  });
  const adopted = adoptedFallbackFollowOnId({
    jobId: queued.jobId,
    progress: queued.jobId
      ? (
          await getGenerationJobById(queued.jobId, job.organization_id)
        )?.progress
      : null,
  });
  if (!adopted) throw new Error("PROSPECT_GENERATION_ENQUEUE_FAILED");
  return adopted;
}
