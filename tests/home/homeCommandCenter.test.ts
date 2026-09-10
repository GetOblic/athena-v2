import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { buildHomePriorities } from "../../lib/home/homeAttention";
import type { HomePriorityInput } from "../../lib/home/homeAttention";
import { emptyHomePipelineData, type HomePipelineData } from "../../lib/home/homePipeline";
import type { HomeCapacityData } from "../../services/home/homeReadService";
import {
  deriveCapacityState,
  deriveConvertState,
  deriveDefineState,
  deriveTractionState,
  deriveVisibilityState,
} from "../../lib/home/homeDomainState";

function pipeline(partial: Partial<HomePipelineData> = {}): HomePipelineData {
  return { ...emptyHomePipelineData(), ...partial };
}

function configuredCapacity(
  partial: Partial<Extract<HomeCapacityData, { configured: true }>> = {},
): HomeCapacityData {
  return {
    configured: true,
    listingCapacity: 5,
    currentlyHeld: 2,
    available: 3,
    claiming: 0,
    linked: 2,
    remoteMissing: 0,
    ...partial,
  };
}

function readyWorkspace(
  partial: Partial<HomePriorityInput> = {},
): HomePriorityInput {
  return {
    define: {
      status: "ok",
      data: {
        brainStatus: "ready",
        hasVoice: true,
        hasKnowledge: true,
        hasWebsite: true,
      },
    },
    visibility: { status: "ok", data: { status: "Ready" } },
    traction: { status: "ok", data: { audienceCount: 2 } },
    pipeline: {
      status: "ok",
      data: pipeline({
        libraryCount: 3,
        workingCount: 3,
      }),
    },
    capacity: { status: "ok", data: configuredCapacity() },
    ...partial,
  };
}

describe("Home priorities", () => {
  it("lets the Brain blocker lead when Identity is missing", () => {
    const items = buildHomePriorities(
      readyWorkspace({
        define: { status: "ok", data: null },
        pipeline: {
          status: "ok",
          data: pipeline({
            libraryCount: 1,
            workingCount: 1,
            readyCount: 1,
            readyIds: ["p1"],
          }),
        },
      }),
    );
    assert.equal(items[0]?.id, "trainAthena");
    assert.equal(items[0]?.href, "/identity");
    assert.equal(items[1]?.id, "reviewReadyOpportunities");
  });

  it("lets the Brain blocker lead when brain_status is not ready or processing", () => {
    const items = buildHomePriorities(
      readyWorkspace({
        define: {
          status: "ok",
          data: {
            brainStatus: "pending",
            hasVoice: true,
            hasKnowledge: false,
            hasWebsite: false,
          },
        },
      }),
    );
    assert.equal(items[0]?.id, "trainAthena");
  });

  it("does not nag Train Athena while Brain is processing", () => {
    const items = buildHomePriorities(
      readyWorkspace({
        define: {
          status: "ok",
          data: {
            brainStatus: "processing",
            hasVoice: false,
            hasKnowledge: false,
            hasWebsite: false,
          },
        },
      }),
    );
    assert.equal(
      items.some((item) => item.id === "trainAthena"),
      false,
    );
  });

  it("emits ready work and routes a single ready prospect to detail", () => {
    const items = buildHomePriorities(
      readyWorkspace({
        pipeline: {
          status: "ok",
          data: pipeline({
            libraryCount: 1,
            workingCount: 1,
            readyCount: 1,
            readyIds: ["ready-1"],
          }),
        },
      }),
    );
    assert.equal(items[0]?.id, "reviewReadyOpportunities");
    assert.equal(items[0]?.href, "/prospects/ready-1");
    assert.equal(items[0]?.count, 1);
  });

  it("routes multiple ready prospects to /prospects", () => {
    const items = buildHomePriorities(
      readyWorkspace({
        pipeline: {
          status: "ok",
          data: pipeline({
            libraryCount: 2,
            workingCount: 2,
            readyCount: 2,
            readyIds: ["a", "b"],
          }),
        },
      }),
    );
    assert.equal(items[0]?.id, "reviewReadyOpportunities");
    assert.equal(items[0]?.href, "/prospects");
  });

  it("emits strong not progressing when that is the entire ready set", () => {
    const items = buildHomePriorities(
      readyWorkspace({
        pipeline: {
          status: "ok",
          data: pipeline({
            libraryCount: 2,
            workingCount: 2,
            readyCount: 2,
            readyIds: ["s1", "s2"],
            strongCount: 2,
            strongNotProgressingCount: 2,
            strongNotProgressingIds: ["s1", "s2"],
            workingAttentionCount: 2,
            workingAttentionIds: ["s1", "s2"],
          }),
        },
      }),
    );
    assert.deepEqual(
      items.map((item) => item.id),
      ["advanceStrongProspects"],
    );
    assert.equal(items[0]?.href, "/prospects");
  });

  it("deduplicates ready work from a strong subset of the same people", () => {
    const items = buildHomePriorities(
      readyWorkspace({
        pipeline: {
          status: "ok",
          data: pipeline({
            libraryCount: 7,
            workingCount: 7,
            readyCount: 7,
            readyIds: ["r1", "r2", "r3", "r4", "r5", "r6", "r7"],
            strongCount: 5,
            strongNotProgressingCount: 5,
            strongNotProgressingIds: ["r1", "r2", "r3", "r4", "r5"],
            workingAttentionCount: 5,
            workingAttentionIds: ["r1", "r2", "r3", "r4", "r5"],
          }),
        },
      }),
    );
    assert.equal(items[0]?.id, "reviewReadyOpportunities");
    assert.equal(
      items.some((item) => item.id === "advanceStrongProspects"),
      false,
    );
    assert.equal(
      items.some((item) => item.id === "workingItemsNeedingAttention"),
      false,
    );
  });

  it("emits failed intelligence and routes a single failure to detail", () => {
    const items = buildHomePriorities(
      readyWorkspace({
        pipeline: {
          status: "ok",
          data: pipeline({
            libraryCount: 1,
            workingCount: 1,
            failedCount: 1,
            failedIds: ["fail-1"],
          }),
        },
      }),
    );
    assert.equal(items[0]?.id, "failedIntelligence");
    assert.equal(items[0]?.href, "/prospects/fail-1");
  });

  it("emits missing intelligence when no ready-work recommendation dominates", () => {
    const items = buildHomePriorities(
      readyWorkspace({
        pipeline: {
          status: "ok",
          data: pipeline({
            libraryCount: 3,
            workingCount: 3,
            missingCount: 3,
            missingIds: ["m1", "m2", "m3"],
          }),
        },
      }),
    );
    assert.equal(items[0]?.id, "missingIntelligence");
    assert.equal(items[0]?.href, "/prospects");
  });

  it("does not emit missing intelligence when ready work already dominates", () => {
    const items = buildHomePriorities(
      readyWorkspace({
        pipeline: {
          status: "ok",
          data: pipeline({
            libraryCount: 4,
            workingCount: 4,
            readyCount: 2,
            readyIds: ["r1", "r2"],
            missingCount: 2,
            missingIds: ["m1", "m2"],
          }),
        },
      }),
    );
    assert.equal(items[0]?.id, "reviewReadyOpportunities");
    assert.equal(
      items.some((item) => item.id === "missingIntelligence"),
      false,
    );
  });

  it("emits empty pipeline plus available capacity to /prospects/find", () => {
    const items = buildHomePriorities(
      readyWorkspace({
        pipeline: { status: "ok", data: pipeline({ workingCount: 0 }) },
        capacity: {
          status: "ok",
          data: configuredCapacity({
            listingCapacity: 4,
            currentlyHeld: 1,
            available: 3,
          }),
        },
      }),
    );
    assert.equal(items[0]?.id, "emptyPipelineAvailableCapacity");
    assert.equal(items[0]?.href, "/prospects/find");
    assert.equal(items[0]?.count, 3);
  });

  it("emits full capacity to /prospects and never to Find", () => {
    const items = buildHomePriorities(
      readyWorkspace({
        pipeline: {
          status: "ok",
          data: pipeline({
            libraryCount: 2,
            workingCount: 2,
            readyCount: 1,
            readyIds: ["r1"],
          }),
        },
        capacity: {
          status: "ok",
          data: configuredCapacity({
            listingCapacity: 2,
            currentlyHeld: 2,
            available: 0,
          }),
        },
      }),
    );
    const full = items.find((item) => item.id === "capacityFull");
    assert.ok(full);
    assert.equal(full?.href, "/prospects");
    assert.equal(
      items.some((item) => item.href === "/prospects/find"),
      false,
    );
  });

  it("treats capacity 0 as a valid configured full state", () => {
    const items = buildHomePriorities(
      readyWorkspace({
        pipeline: { status: "ok", data: pipeline({ workingCount: 0 }) },
        capacity: {
          status: "ok",
          data: configuredCapacity({
            listingCapacity: 0,
            currentlyHeld: 0,
            available: 0,
          }),
        },
      }),
    );
    assert.equal(
      items.some((item) => item.id === "capacityFull"),
      true,
    );
    assert.equal(
      items.some((item) => item.id === "emptyPipelineAvailableCapacity"),
      false,
    );
  });

  it("emits held listings without ready intelligence", () => {
    const items = buildHomePriorities(
      readyWorkspace({
        pipeline: {
          status: "ok",
          data: pipeline({
            libraryCount: 1,
            workingCount: 1,
            inProgressCount: 1,
            heldWithoutReadyCount: 1,
            heldWithoutReadyIds: ["held-1"],
          }),
        },
      }),
    );
    assert.equal(items[0]?.id, "heldWithoutReadyIntelligence");
    assert.equal(items[0]?.href, "/prospects/held-1");
  });

  it("emits residual visibility only when no operational priority dominates", () => {
    const residual = buildHomePriorities(
      readyWorkspace({
        visibility: { status: "ok", data: null },
        pipeline: { status: "ok", data: pipeline({ workingCount: 1 }) },
        capacity: { status: "ok", data: { configured: false } },
      }),
    );
    assert.deepEqual(
      residual.map((item) => item.id),
      ["establishVisibility"],
    );

    const dominated = buildHomePriorities(
      readyWorkspace({
        visibility: { status: "ok", data: null },
        pipeline: {
          status: "ok",
          data: pipeline({
            libraryCount: 1,
            workingCount: 1,
            readyCount: 1,
            readyIds: ["r1"],
          }),
        },
      }),
    );
    assert.equal(
      dominated.some((item) => item.id === "establishVisibility"),
      false,
    );
  });

  it("emits residual first Audience only when no operational priority dominates", () => {
    const residual = buildHomePriorities(
      readyWorkspace({
        traction: { status: "ok", data: { audienceCount: 0 } },
        pipeline: { status: "ok", data: pipeline({ workingCount: 1 }) },
        capacity: { status: "ok", data: { configured: false } },
      }),
    );
    assert.deepEqual(
      residual.map((item) => item.id),
      ["defineFirstAudience"],
    );
    assert.equal(residual[0]?.href, "/personas");
  });

  it("does not pad the list with irrelevant residual actions", () => {
    const items = buildHomePriorities(
      readyWorkspace({
        visibility: { status: "ok", data: null },
        traction: { status: "ok", data: { audienceCount: 0 } },
        pipeline: {
          status: "ok",
          data: pipeline({
            libraryCount: 1,
            workingCount: 1,
            readyCount: 1,
            readyIds: ["r1"],
          }),
        },
      }),
    );
    assert.deepEqual(
      items.map((item) => item.id),
      ["reviewReadyOpportunities"],
    );
  });

  it("never emits more than 5 priorities", () => {
    const items = buildHomePriorities({
      define: { status: "ok", data: null },
      visibility: { status: "ok", data: { status: "Processing Failed" } },
      traction: { status: "ok", data: { audienceCount: 0 } },
      pipeline: {
        status: "ok",
        data: pipeline({
          libraryCount: 8,
          workingCount: 8,
          readyCount: 2,
          readyIds: ["r1", "r2"],
          failedCount: 1,
          failedIds: ["f1"],
          missingCount: 1,
          missingIds: ["m1"],
          workingAttentionCount: 2,
          workingAttentionIds: ["w1", "w2"],
          heldWithoutReadyCount: 1,
          heldWithoutReadyIds: ["h1"],
        }),
      },
      capacity: {
        status: "ok",
        data: configuredCapacity({
          listingCapacity: 1,
          currentlyHeld: 1,
          available: 0,
        }),
      },
    });
    assert.ok(items.length <= 5);
    assert.equal(items[0]?.id, "trainAthena");
  });

  it("does not create a remote_missing release action", () => {
    const items = buildHomePriorities(
      readyWorkspace({
        pipeline: { status: "ok", data: pipeline({ workingCount: 1 }) },
        capacity: {
          status: "ok",
          data: configuredCapacity({
            listingCapacity: 3,
            currentlyHeld: 3,
            available: 0,
            remoteMissing: 2,
          }),
        },
      }),
    );
    assert.equal(
      items.some((item) => /remote|release|missing listing/i.test(item.id)),
      false,
    );
    assert.equal(
      items.some((item) => item.id === "capacityFull"),
      true,
    );
  });

  it("does not create a claiming-stuck action", () => {
    const items = buildHomePriorities(
      readyWorkspace({
        capacity: {
          status: "ok",
          data: configuredCapacity({ claiming: 4, linked: 0 }),
        },
      }),
    );
    assert.equal(
      items.some((item) => /claim/i.test(item.id)),
      false,
    );
  });

  it("does not create a time-based stale action", () => {
    const items = buildHomePriorities(readyWorkspace());
    assert.equal(
      items.some((item) => /stale|days|aging/i.test(item.id)),
      false,
    );
  });

  it("skips failed domains and never treats error as zero", () => {
    const items = buildHomePriorities({
      define: { status: "error" },
      visibility: { status: "error" },
      traction: { status: "error" },
      pipeline: { status: "error" },
      capacity: { status: "error" },
    });
    assert.deepEqual(items, []);
  });

  it("does not generate dependent priorities from a failed domain", () => {
    const items = buildHomePriorities(
      readyWorkspace({
        pipeline: { status: "error" },
        capacity: { status: "error" },
        traction: { status: "error" },
        visibility: { status: "error" },
      }),
    );
    assert.equal(
      items.some((item) =>
        [
          "reviewReadyOpportunities",
          "emptyPipelineAvailableCapacity",
          "capacityFull",
          "defineFirstAudience",
          "establishVisibility",
        ].includes(item.id),
      ),
      false,
    );
  });
});

describe("Home domain state", () => {
  it("maps identity query failure to unknown, not needs setup", () => {
    const state = deriveDefineState({ status: "error" });
    assert.equal(state.kind, "unknown");
  });

  it("maps a missing identity row to needs setup", () => {
    const state = deriveDefineState({ status: "ok", data: null });
    assert.equal(state.kind, "needs_setup");
  });

  it("maps processing Brain to in progress", () => {
    const state = deriveDefineState({
      status: "ok",
      data: {
        greetingName: "Laurent",
        aboutYou: null,
        expertise: null,
        website: null,
        brainStatus: "processing",
        brainLastUpdated: null,
        lastDeepScrapeAt: null,
      },
    });
    assert.equal(state.kind, "in_progress");
    assert.equal(state.isTraining, true);
    assert.equal(state.greetingName, "Laurent");
  });

  it("maps ready Brain to ready without a completeness percentage", () => {
    const state = deriveDefineState({
      status: "ok",
      data: {
        greetingName: "Laurent",
        aboutYou: "voice",
        expertise: "knowledge",
        website: "https://example.com",
        brainStatus: "ready",
        brainLastUpdated: "2026-09-01T00:00:00.000Z",
        lastDeepScrapeAt: "2026-09-02T00:00:00.000Z",
      },
    });
    assert.equal(state.kind, "ready");
    assert.equal(state.lastTrained, "2026-09-01T00:00:00.000Z");
  });

  it("maps visibility query failure to unknown, not no analysis", () => {
    const state = deriveVisibilityState({ status: "error" });
    assert.equal(state.kind, "unknown");
  });

  it("maps no SEO row to none and failed latest to needs attention", () => {
    assert.equal(
      deriveVisibilityState({ status: "ok", data: null }).kind,
      "none",
    );
    assert.equal(
      deriveVisibilityState({
        status: "ok",
        data: {
          id: "r1",
          name: "Acme expansion in Lyon",
          status: "Processing Failed",
          generationType: "intelligence",
          createdAt: "2026-09-01T00:00:00.000Z",
          updatedAt: "2026-09-01T00:00:00.000Z",
        },
      }).kind,
      "needs_attention",
    );
  });

  it("maps traction query failure to unknown with a null count", () => {
    const state = deriveTractionState({ status: "error" });
    assert.equal(state.kind, "unknown");
    assert.equal(state.audienceCount, null);
  });

  it("maps convert query failure to unknown, not zero prospects", () => {
    const state = deriveConvertState({ status: "error" });
    assert.equal(state.kind, "unknown");
    assert.equal(state.workingCount, null);
    assert.equal(state.cta, "unavailable");
  });

  it("maps convert working / empty from pipeline data", () => {
    assert.equal(
      deriveConvertState({
        status: "ok",
        data: pipeline({ workingCount: 0 }),
      }).kind,
      "none",
    );
    assert.equal(
      deriveConvertState({
        status: "ok",
        data: pipeline({
          workingCount: 4,
          readyCount: 2,
          newCount: 1,
          followUpCount: 1,
        }),
      }).kind,
      "active",
    );
  });

  it("maps capacity failure to unknown, not unconfigured zeros", () => {
    const state = deriveCapacityState({ status: "error" });
    assert.equal(state.kind, "unknown");
  });

  it("maps unconfigured capacity without fake zeros", () => {
    const state = deriveCapacityState({
      status: "ok",
      data: { configured: false },
    });
    assert.equal(state.kind, "unconfigured");
    assert.equal("listingCapacity" in state, false);
  });

  it("maps configured capacity including a zero allowance", () => {
    const state = deriveCapacityState({
      status: "ok",
      data: configuredCapacity({
        listingCapacity: 0,
        currentlyHeld: 0,
        available: 0,
      }),
    });
    assert.equal(state.kind, "configured");
    if (state.kind === "configured") {
      assert.equal(state.listingCapacity, 0);
      assert.equal(state.available, 0);
    }
  });
});
