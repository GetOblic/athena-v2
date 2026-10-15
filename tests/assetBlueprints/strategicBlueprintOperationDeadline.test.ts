import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { after, before, describe, it } from "node:test";
import { callOpenRouter } from "../../lib/openrouter";
import { classifyGenerationError } from "../../services/generationJobs/generationJobErrors";
import { GENERATION_JOB_RETRY_BACKOFF_MS } from "../../services/generationJobs/generationJobTypes";
import { runSimplifiedQualityGateLoop } from "../../services/brain/reasoningPipeline/simplifiedQualityGate";
import {
  DEFAULT_STRATEGIC_BLUEPRINT_OPERATION_TIMEOUT_MS,
  executeStrategicBlueprintAttempts,
  isStrategicBlueprintOperationTimeoutError,
  MAX_STRATEGIC_BLUEPRINT_OPERATION_TIMEOUT_MS,
  MIN_STRATEGIC_BLUEPRINT_OPERATION_TIMEOUT_MS,
  normalizeStrategicBlueprintDeadlineError,
  resolveStrategicBlueprintOperationTimeoutMs,
  runStrategicBlueprintModelPhase,
  strategicBlueprintTimeoutFailure,
  StrategicBlueprintOperationTimeoutError,
  STRATEGIC_BLUEPRINT_OPERATION_TIMEOUT_ENV,
} from "../../services/assetBlueprints/strategicBlueprintOperationDeadline";

const ROOT = process.cwd();

function read(relativePath: string): string {
  return readFileSync(join(ROOT, relativePath), "utf8");
}

function completion(content: string, status = 200): Response {
  return new Response(
    JSON.stringify({
      choices: [{ message: { content } }],
    }),
    { status, headers: { "Content-Type": "application/json" } },
  );
}

function hangingFetch(
  signals: Array<AbortSignal | undefined>,
): typeof fetch {
  return ((_url: string, init?: RequestInit) => {
    const signal = init?.signal ?? undefined;
    signals.push(signal);
    return new Promise<Response>((_resolve, reject) => {
      const abort = () => {
        const error = new Error("The operation was aborted");
        error.name = "AbortError";
        reject(error);
      };
      if (signal?.aborted) {
        abort();
        return;
      }
      signal?.addEventListener("abort", abort, { once: true });
    });
  }) as typeof fetch;
}

async function failIfStalled<T>(promise: Promise<T>, ms = 1_500): Promise<T> {
  let timer: ReturnType<typeof setTimeout> | undefined;
  const stalled = new Promise<never>((_resolve, reject) => {
    timer = setTimeout(
      () => reject(new Error(`Strategic Blueprint deadline test stalled past ${ms}ms`)),
      ms,
    );
  });
  try {
    return await Promise.race([promise, stalled]);
  } finally {
    if (timer) clearTimeout(timer);
  }
}

const originalApiKey = process.env.OPENROUTER_API_KEY;

before(() => {
  process.env.OPENROUTER_API_KEY = "test-openrouter-key";
});

after(() => {
  if (originalApiKey === undefined) {
    delete process.env.OPENROUTER_API_KEY;
  } else {
    process.env.OPENROUTER_API_KEY = originalApiKey;
  }
});

describe("strategic blueprint operation deadline configuration", () => {
  it("defaults to a finite ten-minute bound and clamps configured values", () => {
    assert.equal(
      resolveStrategicBlueprintOperationTimeoutMs({}),
      DEFAULT_STRATEGIC_BLUEPRINT_OPERATION_TIMEOUT_MS,
    );
    assert.equal(DEFAULT_STRATEGIC_BLUEPRINT_OPERATION_TIMEOUT_MS, 600_000);
    assert.equal(
      resolveStrategicBlueprintOperationTimeoutMs({
        [STRATEGIC_BLUEPRINT_OPERATION_TIMEOUT_ENV]: "nope",
      }),
      DEFAULT_STRATEGIC_BLUEPRINT_OPERATION_TIMEOUT_MS,
    );
    assert.equal(
      resolveStrategicBlueprintOperationTimeoutMs({
        [STRATEGIC_BLUEPRINT_OPERATION_TIMEOUT_ENV]: "1000",
      }),
      MIN_STRATEGIC_BLUEPRINT_OPERATION_TIMEOUT_MS,
    );
    assert.equal(
      resolveStrategicBlueprintOperationTimeoutMs({
        [STRATEGIC_BLUEPRINT_OPERATION_TIMEOUT_ENV]: "99999999",
      }),
      MAX_STRATEGIC_BLUEPRINT_OPERATION_TIMEOUT_MS,
    );
    assert.equal(
      resolveStrategicBlueprintOperationTimeoutMs({
        [STRATEGIC_BLUEPRINT_OPERATION_TIMEOUT_ENV]: "180000",
      }),
      180_000,
    );
  });
});

describe("strategic blueprint provider abort", () => {
  it("aborts a hanging provider and does not start a token-budget retry", async () => {
    const signals: Array<AbortSignal | undefined> = [];
    let fetches = 0;
    const started = Date.now();

    await assert.rejects(
      () =>
        failIfStalled(
          callOpenRouter([{ role: "user", content: "blueprint" }], {
            athenaStage: "strategic_blueprint",
            generationKind: "strategic_blueprint",
            stage: "strategic_blueprint.quality_gate.attempt_1",
            signal: AbortSignal.timeout(40),
            fetchImpl: async (_url, init) => {
              fetches += 1;
              return hangingFetch(signals)(_url, init);
            },
          }),
        ),
      (error: unknown) => {
        assert.equal(error instanceof Error, true);
        assert.equal((error as Error).name, "OpenRouterRequestTimeoutError");
        assert.match((error as Error).message, /timed out/);
        return true;
      },
    );

    assert.equal(fetches, 1);
    assert.equal(signals.length, 1);
    assert.equal(signals[0]?.aborted, true);
    assert.ok(Date.now() - started < 1_500);
  });

  it("does not send a request when the signal is already aborted", async () => {
    const controller = new AbortController();
    controller.abort();
    let fetches = 0;

    await assert.rejects(
      () =>
        callOpenRouter([{ role: "user", content: "blueprint" }], {
          athenaStage: "strategic_blueprint",
          signal: controller.signal,
          fetchImpl: async () => {
            fetches += 1;
            return completion("should-not-send");
          },
        }),
      (error: unknown) => (error as Error).name === "OpenRouterRequestTimeoutError",
    );

    assert.equal(fetches, 0);
  });

  it("does not retry a token-budget failure after the signal aborts", async () => {
    const controller = new AbortController();
    let fetches = 0;

    await assert.rejects(
      () =>
        callOpenRouter([{ role: "user", content: "blueprint" }], {
          athenaStage: "strategic_blueprint",
          signal: controller.signal,
          fetchImpl: async () => {
            fetches += 1;
            controller.abort();
            return new Response(
              JSON.stringify({
                error: {
                  message: "requires more credits max_tokens Available: 1000",
                },
              }),
              { status: 402, headers: { "Content-Type": "application/json" } },
            );
          },
        }),
      (error: unknown) => (error as Error).name === "OpenRouterRequestTimeoutError",
    );

    assert.equal(fetches, 1);
    assert.equal(controller.signal.aborted, true);
  });

  it("leaves calls without a signal unbounded and able to complete", async () => {
    let seenSignal: AbortSignal | null | undefined = undefined;
    const content = await callOpenRouter(
      [{ role: "user", content: "analysis" }],
      {
        athenaStage: "discussion_analysis",
        stage: "discussion_analysis.quality_gate",
        fetchImpl: async (_url, init) => {
          seenSignal = init?.signal;
          return completion("analysis-ok");
        },
      },
    );

    assert.equal(content, "analysis-ok");
    assert.equal(seenSignal, undefined);
  });
});

describe("strategic blueprint quality gate under one deadline", () => {
  it("repeats a rejected quality pass and completes without fallback or abort", async () => {
    let generates = 0;
    let fallbacks = 0;
    const signals: Array<AbortSignal | undefined> = [];

    const result = await runStrategicBlueprintModelPhase({
      timeoutMs: 2_000,
      operation: async (signal) => {
        const gated = await runSimplifiedQualityGateLoop({
          generate: async () => {
            generates += 1;
            if (signal.aborted) {
              throw new StrategicBlueprintOperationTimeoutError(2_000);
            }
            if (generates === 1) {
              return "not json";
            }
            return callOpenRouter([{ role: "user", content: "blueprint" }], {
              athenaStage: "strategic_blueprint",
              generationKind: "strategic_blueprint",
              signal,
              fetchImpl: async (_url, init) => {
                signals.push(init?.signal);
                return completion('{"asset_title":"Clinic recall"}');
              },
            });
          },
          parse: (raw) => JSON.parse(raw) as { asset_title: string },
          validate: () => ({ valid: true, errors: [] }),
          toReviewText: (parsed) => parsed.asset_title,
        });

        return executeStrategicBlueprintAttempts({
          signal,
          timeoutMs: 2_000,
          runQualityGate: async () => ({ ok: true as const, value: gated }),
          runFallback: async () => {
            fallbacks += 1;
            return { ok: false as const, error: "fallback should not run" };
          },
        });
      },
    });

    assert.equal(generates, 2);
    assert.equal(fallbacks, 0);
    assert.equal(result.ok, true);
    assert.equal(result.fallbackUsed, false);
    assert.equal(result.value.parsed.asset_title, "Clinic recall");
    assert.equal(signals.length, 1);
    assert.equal(signals[0]?.aborted, false);
  });

  it("stops a hanging quality-gate call before fallback or another pass", async () => {
    let generates = 0;
    let fallbacks = 0;
    const signals: Array<AbortSignal | undefined> = [];
    const started = Date.now();

    await assert.rejects(
      () =>
        failIfStalled(
          runStrategicBlueprintModelPhase({
            timeoutMs: 50,
            operation: (signal) =>
              executeStrategicBlueprintAttempts({
                signal,
                timeoutMs: 50,
                runQualityGate: () =>
                  runSimplifiedQualityGateLoop({
                    generate: async () => {
                      generates += 1;
                      try {
                        return await callOpenRouter(
                          [{ role: "user", content: "hang" }],
                          {
                            athenaStage: "strategic_blueprint",
                            signal,
                            fetchImpl: hangingFetch(signals),
                          },
                        );
                      } catch (error) {
                        throw normalizeStrategicBlueprintDeadlineError(
                          error,
                          signal,
                          50,
                        );
                      }
                    },
                    parse: (raw) => raw,
                    validate: () => ({ valid: true, errors: [] }),
                    toReviewText: (raw) => raw,
                  }).then((gated) => ({ ok: true as const, value: gated })),
                runFallback: async () => {
                  fallbacks += 1;
                  return {
                    ok: true as const,
                    value: { parsed: "fallback", raw: "fallback" },
                  };
                },
              }),
          }),
        ),
      (error: unknown) => {
        assert.ok(isStrategicBlueprintOperationTimeoutError(error));
        assert.match(error.message, /Strategic Blueprint operation timed out after 50ms/);
        return true;
      },
    );

    assert.equal(generates, 1);
    assert.equal(fallbacks, 0);
    assert.equal(signals.length, 1);
    assert.equal(signals[0]?.aborted, true);
    assert.ok(Date.now() - started < 1_500);
  });

  it("aborts a hanging fallback and does not start another model call", async () => {
    let qualityCalls = 0;
    let fallbackFetches = 0;
    const signals: Array<AbortSignal | undefined> = [];

    await assert.rejects(
      () =>
        failIfStalled(
          runStrategicBlueprintModelPhase({
            timeoutMs: 50,
            operation: (signal) =>
              executeStrategicBlueprintAttempts({
                signal,
                timeoutMs: 50,
                runQualityGate: async () => {
                  qualityCalls += 1;
                  return { ok: false as const, error: "quality exhausted" };
                },
                runFallback: async () => {
                  try {
                    await callOpenRouter([{ role: "user", content: "fallback" }], {
                      athenaStage: "strategic_blueprint",
                      stage: "strategic_blueprint.briefing.fallback_single_generation",
                      signal,
                      fetchImpl: async (_url, init) => {
                        fallbackFetches += 1;
                        return hangingFetch(signals)(_url, init);
                      },
                    });
                  } catch (error) {
                    throw normalizeStrategicBlueprintDeadlineError(error, signal, 50);
                  }
                  return { ok: true as const, value: "should-not-publish" };
                },
              }),
          }),
        ),
      (error: unknown) => isStrategicBlueprintOperationTimeoutError(error),
    );

    assert.equal(qualityCalls, 1);
    assert.equal(fallbackFetches, 1);
    assert.equal(signals[0]?.aborted, true);
  });
});

describe("strategic blueprint timeout settlement", () => {
  it("fails closed for retry settlement and does not describe a published artifact", () => {
    const failure = strategicBlueprintTimeoutFailure(600_000);
    const classified = classifyGenerationError(failure.blueprintError);

    assert.equal(failure.blueprint, null);
    assert.equal(failure.blueprintGenerated, false);
    assert.equal(failure.parseFailed, true);
    assert.equal(failure.preservedPrevious, false);
    assert.equal(failure.fallbackUsed, false);
    assert.equal(classified.classification, "retryable");
    assert.equal(classified.code, "RETRYABLE_GENERATION_ERROR");
    assert.match(classified.message, /Strategic Blueprint operation timed out/);
    assert.equal(GENERATION_JOB_RETRY_BACKOFF_MS[0], 30_000);
    assert.equal(
      classifyGenerationError(new StrategicBlueprintOperationTimeoutError(600_000))
        .classification,
      "retryable",
    );
  });

  it("wires timeout into workflow failure before publication and job retry settlement", () => {
    const workflow = read("services/workflows/discussionWorkflow.ts");
    const successStart = workflow.indexOf("function workflowSuccess");
    const successEnd = workflow.indexOf("function analysisReviewText");
    const success = workflow.slice(successStart, successEnd);
    assert.match(success, /isStrategicBlueprintOperationTimeoutMessage/);
    assert.match(success, /workflowFailure/);

    const pipelineStart = workflow.indexOf("export async function processDiscussionEndToEnd");
    const pipelineEnd = workflow.indexOf("async function processDiscussionEndToEndInternal");
    const pipeline = workflow.slice(pipelineStart, pipelineEnd);
    const failureGuard = pipeline.indexOf("if (!result.success || !result.analysisId)");
    const publish = pipeline.indexOf("publishExecutiveIntelligenceVersion");
    assert.ok(failureGuard >= 0);
    assert.ok(publish > failureGuard);

    const executor = read("services/generationJobs/generationJobExecutor.ts");
    const failStart = executor.indexOf("if (!result.success)");
    const failEnd = executor.indexOf('await renewLease("executive_version")');
    const failBranch = executor.slice(failStart, failEnd);
    assert.match(failBranch, /failGenerationJobWithClaim/);
    assert.match(
      failBranch,
      /retryable: divergenceTerminal\s*\?\s*false\s*:\s*classified\.classification === "retryable"/,
    );
    assert.doesNotMatch(failBranch, /completeGenerationJobWithClaim/);

    const service = read("services/assetBlueprints/assetBlueprintService.ts");
    assert.match(service, /runStrategicBlueprintModelPhase/);
    assert.match(service, /normalizeStrategicBlueprintDeadlineError/);
    assert.equal(
      service.match(/return strategicBlueprintTimeoutFailure\(error\.timeoutMs\)/g)?.length,
      2,
    );
    const openrouter = read("lib/openrouter.ts");
    assert.match(openrouter, /if \(transport\?\.signal\)/);
    assert.match(openrouter, /init\.signal = transport\.signal/);
    assert.match(openrouter, /throw new OpenRouterRequestTimeoutError\(\)/);
  });
});
