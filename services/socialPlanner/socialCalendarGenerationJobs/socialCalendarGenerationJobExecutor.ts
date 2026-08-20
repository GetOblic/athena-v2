/**
 * Claim and execute organization-level Social Calendar generation jobs.
 * Orchestrates L2/L3/L5. Persistence is complete/fail RPC only.
 */

import { readIdentityExecutiveIntelligence } from "@/services/identity/identityExecutiveIntelligence";
import { getAthenaWorkerConfig } from "@/services/generationJobs/generationJobWorkerConfig";
import { composeSocialPlannerIntelligence } from "@/services/socialPlanner/intelligence/composeSocialPlannerIntelligence";
import {
  defaultBuildBrain,
  defaultLoadDeepWebsiteIntelligence,
} from "@/services/socialPlanner/intelligence/socialPlannerIntelligenceSources";
import { SocialPlannerIntelligenceError } from "@/services/socialPlanner/intelligence/socialPlannerIntelligenceTypes";
import { generateHistoricallyDiverseSocialCalendar } from "@/services/socialPlanner/diversity/generateHistoricallyDiverseSocialCalendar";
import { generateThinkDifferentlySocialCalendar } from "@/services/socialPlanner/thinkDifferently/generateThinkDifferentlySocialCalendar";
import { generateConversationRevisionSocialCalendar } from "@/services/socialPlanner/conversationRevision/generateConversationRevisionSocialCalendar";
import { tryParsePersistedRevisionContext } from "@/services/socialPlanner/conversationRevision/validateSocialPlannerRevisionBrief";
import type { SocialPlannerHistoryLoader } from "@/services/socialPlanner/diversity/socialPlannerSocialMemoryTypes";
import {
  tryParsePersistedSocialCalendarContext,
  tryParsePersistedSocialCalendarPackage,
} from "@/services/socialPlanner/socialCalendarPersistedPackage";
import {
  buildFrozenConversationRevisionProvenance,
  buildFrozenSocialCalendarProvenance,
  buildFrozenThinkDifferentlyProvenance,
  toProvenanceJson,
} from "@/services/socialPlanner/socialCalendarProvenance";
import {
  extractSocialPlannerGeographicReach,
  extractSocialPlannerWebsiteContact,
} from "@/services/socialPlanner/geography/resolveSocialPlannerGeography";
import type { SocialPlannerGeographyEvidence } from "@/services/socialPlanner/geography/socialPlannerGeographyTypes";
import { SocialCalendarContextError } from "@/services/socialPlanner/calendar/socialCalendarContextTypes";
import { validateSocialCalendarContext } from "@/services/socialPlanner/calendar/validateSocialCalendarContext";
import {
  SocialCalendarPackageValidationError,
  SocialPlannerGenerationError,
  SocialPlannerSocialMemoryError,
} from "@/services/socialPlanner/generation/socialPlannerGenerationErrors";
import {
  SocialCalendarGuidanceError,
  SocialCalendarLineageError,
  SocialCalendarPeriodError,
  normalizeSocialCalendarPeriod,
  normalizeSocialCalendarUserGuidance,
} from "@/services/socialPlanner/socialCalendarTypes";
import {
  getSocialCalendarById,
  socialPlannerHistoryLoader,
} from "@/services/socialPlanner/socialCalendarService";
import {
  claimNextSocialCalendarGenerationJob,
  completeSocialCalendarGenerationJobWithClaim,
  failSocialCalendarGenerationJobWithClaim,
  heartbeatSocialCalendarGenerationJob,
} from "@/services/socialPlanner/socialCalendarGenerationJobs/socialCalendarGenerationJobService";
import {
  SOCIAL_CALENDAR_ERROR_METADATA_FAILURES_MAX,
  SOCIAL_CALENDAR_ERROR_METADATA_FAILURE_MAX_CHARS,
  type AthenaSocialCalendarGenerationJob,
} from "@/services/socialPlanner/socialCalendarGenerationJobs/socialCalendarGenerationJobTypes";

export const SOCIAL_CALENDAR_EXECUTOR_STAGES = [
  "queued",
  "calendar_context",
  "intelligence",
  "generation",
  "diversity",
  "source_divergence",
  "revision_satisfaction",
  "finalizing",
] as const;

export type SocialCalendarExecutorStage =
  (typeof SOCIAL_CALENDAR_EXECUTOR_STAGES)[number];

export type ClaimedSocialCalendarJobExecution = {
  job: AthenaSocialCalendarGenerationJob;
  claimToken: string;
};

export class SocialCalendarExecutorValidationError extends Error {
  readonly code: string;
  readonly retryable = false;

  constructor(code: string, message: string) {
    super(message);
    this.name = "SocialCalendarExecutorValidationError";
    this.code = code;
  }
}

export type SocialCalendarExecutorDeps = {
  getCalendar?: typeof getSocialCalendarById;
  composeIntelligence?: typeof composeSocialPlannerIntelligence;
  generate?: typeof generateHistoricallyDiverseSocialCalendar;
  generateThinkDifferently?: typeof generateThinkDifferentlySocialCalendar;
  generateConversationRevision?: typeof generateConversationRevisionSocialCalendar;
  historyLoader?: SocialPlannerHistoryLoader;
  loadGeographyEvidence?: (
    organizationId: string,
  ) => Promise<SocialPlannerGeographyEvidence>;
  complete?: typeof completeSocialCalendarGenerationJobWithClaim;
  fail?: typeof failSocialCalendarGenerationJobWithClaim;
  heartbeat?: typeof heartbeatSocialCalendarGenerationJob;
};

export function boundSocialCalendarValidationFailures(
  failures: string[],
): string[] {
  return failures
    .filter((failure) => typeof failure === "string" && failure.trim())
    .slice(0, SOCIAL_CALENDAR_ERROR_METADATA_FAILURES_MAX)
    .map((failure) =>
      failure.slice(0, SOCIAL_CALENDAR_ERROR_METADATA_FAILURE_MAX_CHARS),
    );
}

export function classifySocialCalendarExecutorError(error: unknown): {
  code: string;
  message: string;
  retryable: boolean;
  stage: string;
  failures: string[];
} {
  if (error instanceof SocialCalendarExecutorValidationError) {
    return {
      code: error.code,
      message: error.message.slice(0, 1000),
      retryable: false,
      stage: "failed",
      failures: [],
    };
  }
  if (error instanceof SocialCalendarPackageValidationError) {
    return {
      code: error.code,
      message: error.message.slice(0, 1000),
      retryable: false,
      stage: "validation",
      failures: boundSocialCalendarValidationFailures(error.failures),
    };
  }
  if (error instanceof SocialPlannerGenerationError) {
    return {
      code: error.code,
      message: error.message.slice(0, 1000),
      retryable: error.retryable,
      stage: error.stage,
      failures: boundSocialCalendarValidationFailures(error.failures),
    };
  }
  if (error instanceof SocialPlannerSocialMemoryError) {
    return {
      code: error.code,
      message: error.message.slice(0, 1000),
      retryable: error.retryable,
      stage: "social_memory",
      failures: [],
    };
  }
  if (error instanceof SocialPlannerIntelligenceError) {
    return {
      code: error.code,
      message: error.message.slice(0, 1000),
      retryable: false,
      stage: "intelligence",
      failures: [],
    };
  }
  if (
    error instanceof SocialCalendarContextError ||
    error instanceof SocialCalendarPeriodError ||
    error instanceof SocialCalendarGuidanceError ||
    error instanceof SocialCalendarLineageError
  ) {
    return {
      code: error.code,
      message: error.message.slice(0, 1000),
      retryable: false,
      stage: "calendar_context",
      failures: [],
    };
  }

  const message = error instanceof Error ? error.message : String(error);
  const lower = message.toLowerCase();
  const retryable =
    lower.includes("timeout") ||
    lower.includes("rate limit") ||
    lower.includes("429") ||
    lower.includes("503") ||
    lower.includes("network") ||
    lower.includes("econnreset") ||
    lower.includes("fetch failed");

  return {
    code: "SOCIAL_CALENDAR_GENERATION_FAILED",
    message: message.slice(0, 1000),
    retryable,
    stage: "failed",
    failures: [],
  };
}

export async function loadTrustedSocialPlannerGeographyEvidence(
  organizationId: string,
): Promise<SocialPlannerGeographyEvidence> {
  const [brain, website] = await Promise.all([
    defaultBuildBrain(organizationId).catch(() => null),
    defaultLoadDeepWebsiteIntelligence(organizationId).catch(() => null),
  ]);

  const executive = readIdentityExecutiveIntelligence(
    brain?.businessMemory.identity?.masterProfile,
  );

  return {
    executiveGeographicReach: extractSocialPlannerGeographicReach(executive),
    deepWebsiteContactInformation: extractSocialPlannerWebsiteContact(website),
  };
}

export async function executeClaimedSocialCalendarGenerationJob(
  workerId: string,
  claimed: ClaimedSocialCalendarJobExecution,
  options?: {
    shouldStop?: () => boolean;
    deps?: SocialCalendarExecutorDeps;
  },
): Promise<"completed" | "failed" | "retryable" | "claim_lost"> {
  const { job, claimToken } = claimed;
  const workerConfig = getAthenaWorkerConfig();
  const deps = options?.deps ?? {};
  const getCalendar = deps.getCalendar ?? getSocialCalendarById;
  const composeIntelligence =
    deps.composeIntelligence ?? composeSocialPlannerIntelligence;
  const generate = deps.generate ?? generateHistoricallyDiverseSocialCalendar;
  const historyLoader = deps.historyLoader ?? socialPlannerHistoryLoader;
  const loadGeographyEvidence =
    deps.loadGeographyEvidence ?? loadTrustedSocialPlannerGeographyEvidence;
  const complete = deps.complete ?? completeSocialCalendarGenerationJobWithClaim;
  const fail = deps.fail ?? failSocialCalendarGenerationJobWithClaim;
  const heartbeat = deps.heartbeat ?? heartbeatSocialCalendarGenerationJob;

  let heartbeatTimer: ReturnType<typeof setInterval> | null = null;
  let claimLost = false;
  let currentStage: string = job.generation_stage ?? "calendar_context";

  const stopHeartbeat = () => {
    if (heartbeatTimer) {
      clearInterval(heartbeatTimer);
      heartbeatTimer = null;
    }
  };

  const renewLease = async (stage?: string) => {
    const renewed = await heartbeat({
      jobId: job.id,
      claimToken,
      leaseSeconds: workerConfig.leaseSeconds,
      stage: stage ?? null,
    });
    if (!renewed) {
      claimLost = true;
    }
    return renewed;
  };

  heartbeatTimer = setInterval(() => {
    void renewLease(currentStage);
  }, workerConfig.heartbeatIntervalMs);

  console.log("[ATHENA_SOCIAL_PLANNER_JOBS] execute_started", {
    workerId,
    jobId: job.id,
    calendarId: job.calendar_id,
    organizationId: job.organization_id,
    attempt: job.attempt_count,
  });

  try {
    if (options?.shouldStop?.()) {
      stopHeartbeat();
      await fail({
        jobId: job.id,
        claimToken,
        errorCode: "WORKER_STOPPING",
        errorMessage: "Worker shutting down before Social Calendar generation completed.",
        retryable: true,
        failedStage: currentStage,
      });
      return "retryable";
    }

    const calendar = await getCalendar(job.calendar_id, job.organization_id);
    if (!calendar) {
      stopHeartbeat();
      await fail({
        jobId: job.id,
        claimToken,
        errorCode: "CALENDAR_NOT_FOUND",
        errorMessage: "Social Calendar missing or organization mismatch.",
        retryable: false,
        failedStage: "failed",
      });
      return "failed";
    }

    if (calendar.organization_id !== job.organization_id) {
      throw new SocialCalendarExecutorValidationError(
        "TENANT_MISMATCH",
        "Social Calendar organization does not match the generation job.",
      );
    }

    // Ready Social Calendars are immutable — do not overwrite package/context/provenance.
    if (calendar.status === "Ready" && calendar.package_json) {
      stopHeartbeat();
      await complete({
        jobId: job.id,
        claimToken,
        packageJson: calendar.package_json,
        calendarContextJson: calendar.calendar_context_json,
        provenanceJson: calendar.provenance_json,
      });
      return "completed";
    }

    if (
      calendar.generation_mode !== "standard" &&
      calendar.generation_mode !== "think_differently" &&
      calendar.generation_mode !== "conversation_revision"
    ) {
      throw new SocialCalendarExecutorValidationError(
        "UNSUPPORTED_GENERATION_MODE",
        "Unsupported Social Calendar generation mode.",
      );
    }

    normalizeSocialCalendarPeriod(calendar.period_start, calendar.period_end);
    normalizeSocialCalendarUserGuidance(calendar.user_guidance);

    currentStage = "calendar_context";
    if (!(await renewLease(currentStage))) {
      return "claim_lost";
    }

    currentStage = "intelligence";
    if (!(await renewLease(currentStage))) {
      return "claim_lost";
    }

    let frozenCalendarContextJson: Record<string, unknown>;
    let provenanceJson: Record<string, unknown>;
    let packageJson: Record<string, unknown>;

    if (calendar.generation_mode === "think_differently") {
      if (!calendar.source_calendar_id || !calendar.root_calendar_id) {
        throw new SocialCalendarExecutorValidationError(
          "UNSUPPORTED_LINEAGE",
          "Think Differently calendars must preserve source and root lineage.",
        );
      }

      const source = await getCalendar(
        calendar.source_calendar_id,
        job.organization_id,
      );
      if (!source || source.organization_id !== job.organization_id) {
        throw new SocialCalendarExecutorValidationError(
          "THINK_DIFFERENTLY_SOURCE_NOT_READY",
          "Think Differently source calendar is missing or not in this organization.",
        );
      }
      if (source.status !== "Ready") {
        throw new SocialCalendarExecutorValidationError(
          "THINK_DIFFERENTLY_SOURCE_NOT_READY",
          "Think Differently requires a Ready source Social Calendar.",
        );
      }
      const sourcePackage = tryParsePersistedSocialCalendarPackage(
        source.package_json,
      );
      const sourceCalendarContext = tryParsePersistedSocialCalendarContext(
        source.calendar_context_json,
      );
      if (!sourcePackage || !sourceCalendarContext) {
        throw new SocialCalendarExecutorValidationError(
          "THINK_DIFFERENTLY_SOURCE_PACKAGE_INVALID",
          "Think Differently source calendar package or calendar context is unusable.",
        );
      }
      if (
        source.period_start !== calendar.period_start ||
        source.period_end !== calendar.period_end
      ) {
        throw new SocialCalendarExecutorValidationError(
          "UNSUPPORTED_LINEAGE",
          "Think Differently must reuse the source calendar period.",
        );
      }

      const generateThinkDifferently =
        deps.generateThinkDifferently ?? generateThinkDifferentlySocialCalendar;
      const context = await composeIntelligence({
        organizationId: job.organization_id,
        calendarContext: sourceCalendarContext,
      });
      const calendarContext = validateSocialCalendarContext(context.calendarContext);

      currentStage = "generation";
      if (!(await renewLease(currentStage))) {
        return "claim_lost";
      }

      const result = await generateThinkDifferently({
        context,
        userGuidance: calendar.user_guidance,
        sourceCalendar: source,
        sourcePackage,
        derivativeVersionNumber: calendar.version_number,
        deps: { historyLoader },
      });

      currentStage = "diversity";
      if (!(await renewLease(currentStage))) {
        return "claim_lost";
      }
      currentStage = "source_divergence";
      if (!(await renewLease(currentStage))) {
        return "claim_lost";
      }

      if (claimLost || options?.shouldStop?.()) {
        stopHeartbeat();
        await fail({
          jobId: job.id,
          claimToken,
          errorCode: claimLost ? "CLAIM_LOST" : "WORKER_STOPPING",
          errorMessage: claimLost
            ? "Social Calendar generation claim was lost."
            : "Worker shutting down before Social Calendar completion.",
          retryable: true,
          failedStage: currentStage,
        });
        return claimLost ? "claim_lost" : "retryable";
      }

      currentStage = "finalizing";
      stopHeartbeat();
      packageJson = result.package as unknown as Record<string, unknown>;
      frozenCalendarContextJson = calendarContext as unknown as Record<
        string,
        unknown
      >;
      provenanceJson = toProvenanceJson(
        buildFrozenThinkDifferentlyProvenance({
          context,
          calendarContext,
          generationProvenance: result.generationProvenance,
        }),
      );
    } else if (calendar.generation_mode === "conversation_revision") {
      if (!calendar.source_calendar_id || !calendar.root_calendar_id) {
        throw new SocialCalendarExecutorValidationError(
          "UNSUPPORTED_LINEAGE",
          "Conversation Revision calendars must preserve source and root lineage.",
        );
      }

      const source = await getCalendar(
        calendar.source_calendar_id,
        job.organization_id,
      );
      if (!source || source.organization_id !== job.organization_id) {
        throw new SocialCalendarExecutorValidationError(
          "CONVERSATION_REVISION_SOURCE_NOT_READY",
          "Conversation Revision source calendar is missing or not in this organization.",
        );
      }
      if (source.status !== "Ready") {
        throw new SocialCalendarExecutorValidationError(
          "CONVERSATION_REVISION_SOURCE_NOT_READY",
          "Conversation Revision requires a Ready source Social Calendar.",
        );
      }
      const sourcePackage = tryParsePersistedSocialCalendarPackage(
        source.package_json,
      );
      const sourceCalendarContext = tryParsePersistedSocialCalendarContext(
        source.calendar_context_json,
      );
      if (!sourcePackage || !sourceCalendarContext) {
        throw new SocialCalendarExecutorValidationError(
          "CONVERSATION_REVISION_SOURCE_PACKAGE_INVALID",
          "Conversation Revision source calendar package or calendar context is unusable.",
        );
      }
      if (
        source.period_start !== calendar.period_start ||
        source.period_end !== calendar.period_end
      ) {
        throw new SocialCalendarExecutorValidationError(
          "UNSUPPORTED_LINEAGE",
          "Conversation Revision must reuse the source calendar period.",
        );
      }

      const revisionContext = tryParsePersistedRevisionContext(
        calendar.revision_context_json,
        source.id,
        sourcePackage.period.dates,
      );
      if (!revisionContext) {
        throw new SocialCalendarExecutorValidationError(
          "CONVERSATION_REVISION_CONTEXT_INVALID",
          "Conversation Revision requires a frozen Apply-time revision context.",
        );
      }

      const generateConversationRevision =
        deps.generateConversationRevision ??
        generateConversationRevisionSocialCalendar;
      const context = await composeIntelligence({
        organizationId: job.organization_id,
        calendarContext: sourceCalendarContext,
      });
      const calendarContext = validateSocialCalendarContext(context.calendarContext);

      currentStage = "generation";
      if (!(await renewLease(currentStage))) {
        return "claim_lost";
      }

      const result = await generateConversationRevision({
        context,
        userGuidance: calendar.user_guidance,
        sourceCalendar: source,
        sourcePackage,
        revisionContext,
        derivativeVersionNumber: calendar.version_number,
        deps: { historyLoader },
      });

      currentStage = "diversity";
      if (!(await renewLease(currentStage))) {
        return "claim_lost";
      }
      currentStage = "revision_satisfaction";
      if (!(await renewLease(currentStage))) {
        return "claim_lost";
      }

      if (claimLost || options?.shouldStop?.()) {
        stopHeartbeat();
        await fail({
          jobId: job.id,
          claimToken,
          errorCode: claimLost ? "CLAIM_LOST" : "WORKER_STOPPING",
          errorMessage: claimLost
            ? "Social Calendar generation claim was lost."
            : "Worker shutting down before Social Calendar completion.",
          retryable: true,
          failedStage: currentStage,
        });
        return claimLost ? "claim_lost" : "retryable";
      }

      currentStage = "finalizing";
      stopHeartbeat();
      packageJson = result.package as unknown as Record<string, unknown>;
      frozenCalendarContextJson = calendarContext as unknown as Record<
        string,
        unknown
      >;
      provenanceJson = toProvenanceJson(
        buildFrozenConversationRevisionProvenance({
          context,
          calendarContext,
          generationProvenance: result.generationProvenance,
        }),
      );
    } else {
      const geographyEvidence = await loadGeographyEvidence(job.organization_id);
      const context = await composeIntelligence({
        organizationId: job.organization_id,
        periodStart: calendar.period_start,
        periodEnd: calendar.period_end,
        geographyEvidence,
      });

      const calendarContext = validateSocialCalendarContext(context.calendarContext);

      currentStage = "generation";
      if (!(await renewLease(currentStage))) {
        return "claim_lost";
      }

      const result = await generate({
        context,
        userGuidance: calendar.user_guidance,
        generationMode: "standard",
        deps: { historyLoader },
      });

      currentStage = "diversity";
      if (!(await renewLease(currentStage))) {
        return "claim_lost";
      }

      if (claimLost || options?.shouldStop?.()) {
        stopHeartbeat();
        await fail({
          jobId: job.id,
          claimToken,
          errorCode: claimLost ? "CLAIM_LOST" : "WORKER_STOPPING",
          errorMessage: claimLost
            ? "Social Calendar generation claim was lost."
            : "Worker shutting down before Social Calendar completion.",
          retryable: true,
          failedStage: currentStage,
        });
        return claimLost ? "claim_lost" : "retryable";
      }

      currentStage = "finalizing";
      stopHeartbeat();
      const provenance = buildFrozenSocialCalendarProvenance({
        context,
        calendarContext,
        generationProvenance: result.generationProvenance,
      });
      packageJson = result.package as unknown as Record<string, unknown>;
      frozenCalendarContextJson = calendarContext as unknown as Record<
        string,
        unknown
      >;
      provenanceJson = toProvenanceJson(provenance);
    }

    const completed = await complete({
      jobId: job.id,
      claimToken,
      packageJson,
      calendarContextJson: frozenCalendarContextJson,
      provenanceJson,
    });

    if (!completed) {
      console.error("[ATHENA_SOCIAL_PLANNER_JOBS] complete_claim_lost", {
        jobId: job.id,
        calendarId: job.calendar_id,
      });
      return "claim_lost";
    }

    console.log("[ATHENA_SOCIAL_PLANNER_JOBS] execute_completed", {
      workerId,
      jobId: job.id,
      calendarId: job.calendar_id,
    });
    return "completed";
  } catch (error) {
    stopHeartbeat();
    const classified = classifySocialCalendarExecutorError(error);

    if (classified.code === "CLAIM_LOST" || claimLost) {
      return "claim_lost";
    }

    const failed = await fail({
      jobId: job.id,
      claimToken,
      errorCode: classified.code,
      errorMessage: classified.message,
      retryable: classified.retryable,
      failedStage: classified.stage,
      errorMetadata:
        classified.failures.length > 0
          ? { failures: classified.failures }
          : null,
    });

    console.error("[ATHENA_SOCIAL_PLANNER_JOBS] execute_failed", {
      workerId,
      jobId: job.id,
      calendarId: job.calendar_id,
      code: classified.code,
      retryable: classified.retryable,
      status: failed?.status ?? null,
      message: classified.message,
      failures: classified.failures,
    });

    if (failed?.status === "retryable") return "retryable";
    return "failed";
  } finally {
    stopHeartbeat();
  }
}

export async function claimAndExecuteNextSocialCalendarGenerationJob(
  workerId: string,
  options?: { shouldStop?: () => boolean },
): Promise<boolean> {
  const claimed = await claimNextSocialCalendarGenerationJob({ workerId });
  if (!claimed) return false;

  await executeClaimedSocialCalendarGenerationJob(workerId, claimed, options);
  return true;
}
