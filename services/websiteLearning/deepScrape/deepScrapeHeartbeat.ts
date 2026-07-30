/**
 * Single-owned heartbeat lifecycle for a claimed Deep Scrape job.
 */

import {
  heartbeatDeepScrapeJob,
  type HeartbeatDeepScrapeResult,
} from "@/services/websiteLearning/deepScrape/deepScrapeJobService";
import {
  coerceHeartbeatStage,
  DeepScrapeStateTransitionError,
  mapProgressStageToPersisted,
  type DeepScrapePersistedStage,
} from "@/services/websiteLearning/deepScrape/deepScrapeStages";
import { logDeepScrapeEvent } from "@/services/websiteLearning/deepScrape/observability";

export type DeepScrapeHeartbeatFailureKind =
  | "validation"
  | "claim_lost"
  | "transport"
  | "closed";

export class DeepScrapeHeartbeatController {
  private closed = false;
  private started = false;
  private timer: ReturnType<typeof setInterval> | null = null;
  private chain: Promise<void> = Promise.resolve();
  private currentStage: DeepScrapePersistedStage | null;
  private currentProgress: Record<string, unknown> | null = null;
  private readonly abort = new AbortController();
  private validationFatal: DeepScrapeStateTransitionError | null = null;
  private claimLost = false;
  private consecutiveTransportFailures = 0;
  private readonly maxTransportRetries: number;

  constructor(
    private readonly opts: {
      jobId: string;
      claimToken: string;
      workerId: string;
      organizationId: string;
      sourceType: "brain" | "prospect" | "persona";
      leaseSeconds: number;
      intervalMs: number;
      initialStage: string;
      maxTransportRetries?: number;
    },
  ) {
    this.currentStage = mapProgressStageToPersisted(opts.initialStage);
    this.maxTransportRetries = opts.maxTransportRetries ?? 3;
  }

  get isClosed(): boolean {
    return this.closed;
  }

  get isClaimLost(): boolean {
    return this.claimLost;
  }

  get validationError(): DeepScrapeStateTransitionError | null {
    return this.validationFatal;
  }

  get stage(): DeepScrapePersistedStage | null {
    return this.currentStage;
  }

  start(): void {
    if (this.started || this.closed) return;
    this.started = true;
    logDeepScrapeEvent("deep_scrape_heartbeat_started", {
      organizationId: this.opts.organizationId,
      jobId: this.opts.jobId,
      sourceType: this.opts.sourceType,
      stage: this.currentStage,
      diagnostic: {
        workerId: this.opts.workerId,
        leaseSeconds: this.opts.leaseSeconds,
        intervalMs: this.opts.intervalMs,
        executionClosed: false,
      },
    });
    this.timer = setInterval(() => {
      void this.enqueue(() => this.performHeartbeat(null, null, "interval"));
    }, this.opts.intervalMs);
  }

  /**
   * Renew lease, optionally advancing stage/progress after validation.
   * Serializes all heartbeat writes for this execution.
   */
  async renew(
    stage?: string | null,
    progress?: Record<string, unknown> | null,
  ): Promise<void> {
    await this.enqueue(() => this.performHeartbeat(stage, progress, "renew"));
    if (this.validationFatal) {
      throw this.validationFatal;
    }
  }

  async stop(): Promise<void> {
    if (this.closed) {
      await this.chain.catch(() => undefined);
      return;
    }
    this.closed = true;
    this.abort.abort();
    if (this.timer) {
      clearInterval(this.timer);
      this.timer = null;
    }
    await this.chain.catch(() => undefined);
    logDeepScrapeEvent("deep_scrape_heartbeat_stopped", {
      organizationId: this.opts.organizationId,
      jobId: this.opts.jobId,
      sourceType: this.opts.sourceType,
      stage: this.currentStage,
      diagnostic: {
        workerId: this.opts.workerId,
        executionClosed: true,
        claimLost: this.claimLost,
        validationFatal: this.validationFatal?.code ?? null,
      },
    });
  }

  private enqueue(work: () => Promise<void>): Promise<void> {
    const run = this.chain.then(work, work);
    this.chain = run.catch(() => undefined);
    return run;
  }

  private async performHeartbeat(
    stage: string | null | undefined,
    progress: Record<string, unknown> | null | undefined,
    source: "interval" | "renew",
  ): Promise<void> {
    if (this.closed || this.abort.signal.aborted) {
      return;
    }

    let nextStage: DeepScrapePersistedStage | null = null;
    let nextProgress = progress ?? null;

    try {
      if (stage != null && stage !== "") {
        const mapped = mapProgressStageToPersisted(stage);
        if (mapped == null) {
          throw new DeepScrapeStateTransitionError(
            `Heartbeat refused invalid stage "${stage}"`,
            this.currentStage,
            stage,
          );
        }
        if (stage === "rendering") {
          nextProgress = {
            ...(nextProgress ?? this.currentProgress ?? {}),
            phase: "rendering",
          };
        }
        // Backward stages renew lease only; never write an illegal rollback.
        nextStage = coerceHeartbeatStage(this.currentStage, stage);
      }
    } catch (error) {
      if (error instanceof DeepScrapeStateTransitionError) {
        this.validationFatal = error;
        logDeepScrapeEvent("deep_scrape_heartbeat_failed", {
          organizationId: this.opts.organizationId,
          jobId: this.opts.jobId,
          sourceType: this.opts.sourceType,
          stage: this.currentStage,
          failureCode: error.code,
          diagnostic: {
            workerId: this.opts.workerId,
            reason: "validation" satisfies DeepScrapeHeartbeatFailureKind,
            priorStage: error.priorStage,
            nextStage: error.nextStage,
            source,
            executionClosed: this.closed,
          },
        });
        logDeepScrapeEvent("deep_scrape_stage_transition_rejected", {
          organizationId: this.opts.organizationId,
          jobId: this.opts.jobId,
          sourceType: this.opts.sourceType,
          stage: this.currentStage,
          failureCode: error.code,
          diagnostic: {
            priorStage: error.priorStage,
            nextStage: error.nextStage,
            source,
          },
        });
        return;
      }
      throw error;
    }

    if (nextProgress) {
      this.currentProgress = nextProgress;
    }

    const result: HeartbeatDeepScrapeResult = await heartbeatDeepScrapeJob({
      jobId: this.opts.jobId,
      claimToken: this.opts.claimToken,
      leaseSeconds: this.opts.leaseSeconds,
      stage: nextStage,
      progress: nextProgress,
      allowStage: true,
    });

    if (this.closed || this.abort.signal.aborted) {
      return;
    }

    if (result.ok) {
      this.consecutiveTransportFailures = 0;
      if (nextStage && nextStage !== this.currentStage) {
        logDeepScrapeEvent("deep_scrape_stage_transition", {
          organizationId: this.opts.organizationId,
          jobId: this.opts.jobId,
          sourceType: this.opts.sourceType,
          stage: nextStage,
          diagnostic: {
            workerId: this.opts.workerId,
            priorStage: this.currentStage,
            nextStage,
            source,
            attemptCount: result.job.attempt_count,
            leaseExpiry: result.job.claim_expires_at,
          },
        });
        this.currentStage = nextStage;
      } else if (nextStage) {
        this.currentStage = nextStage;
      }
      if (source === "renew" || nextStage) {
        logDeepScrapeEvent("deep_scrape_heartbeat_succeeded", {
          organizationId: this.opts.organizationId,
          jobId: this.opts.jobId,
          sourceType: this.opts.sourceType,
          stage: this.currentStage,
          diagnostic: {
            workerId: this.opts.workerId,
            source,
            leaseExpiry: result.job.claim_expires_at,
            heartbeatAge: result.job.heartbeat_at,
            executionClosed: false,
          },
        });
      }
      return;
    }

    if (result.reason === "validation") {
      this.validationFatal = new DeepScrapeStateTransitionError(
        result.message,
        this.currentStage,
        nextStage,
      );
      logDeepScrapeEvent("deep_scrape_heartbeat_failed", {
        organizationId: this.opts.organizationId,
        jobId: this.opts.jobId,
        sourceType: this.opts.sourceType,
        stage: this.currentStage,
        failureCode: result.code,
        diagnostic: {
          workerId: this.opts.workerId,
          reason: "validation",
          source,
          executionClosed: this.closed,
        },
      });
      return;
    }

    if (result.reason === "claim_lost") {
      this.claimLost = true;
      logDeepScrapeEvent("deep_scrape_heartbeat_failed", {
        organizationId: this.opts.organizationId,
        jobId: this.opts.jobId,
        sourceType: this.opts.sourceType,
        stage: this.currentStage,
        failureCode: result.code,
        diagnostic: {
          workerId: this.opts.workerId,
          reason: "claim_lost",
          source,
          executionClosed: this.closed,
        },
      });
      return;
    }

    // Transport: keep execution alive; bounded retry counter for observability.
    this.consecutiveTransportFailures += 1;
    logDeepScrapeEvent("deep_scrape_heartbeat_failed", {
      organizationId: this.opts.organizationId,
      jobId: this.opts.jobId,
      sourceType: this.opts.sourceType,
      stage: this.currentStage,
      failureCode: result.code,
      diagnostic: {
        workerId: this.opts.workerId,
        reason: "transport",
        source,
        consecutiveTransportFailures: this.consecutiveTransportFailures,
        maxTransportRetries: this.maxTransportRetries,
        executionClosed: this.closed,
      },
    });
    if (this.consecutiveTransportFailures >= this.maxTransportRetries) {
      this.claimLost = true;
    }
  }
}
