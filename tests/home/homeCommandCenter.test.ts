import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { buildHomeAttention } from "../../lib/home/homeAttention";
import type { HomeAttentionInput } from "../../lib/home/homeAttention";
import {
  deriveConvertState,
  deriveDefineState,
  deriveTractionState,
  deriveVisibilityState,
} from "../../lib/home/homeDomainState";

function attentionInput(
  partial: Partial<HomeAttentionInput> = {},
): HomeAttentionInput {
  return {
    define: { status: "ok", data: null },
    visibility: { status: "ok", data: { status: "Ready" } },
    traction: { status: "ok", data: { audienceCount: 2 } },
    convert: {
      status: "ok",
      data: { total: 3, newCount: 0, followUpCount: 0 },
    },
    ...partial,
  };
}

describe("V2-UI-2C Home attention rules", () => {
  it("emits trainAthena when there is no identity", () => {
    const items = buildHomeAttention(attentionInput());
    assert.deepEqual(
      items.map((item) => item.id),
      ["trainAthena"],
    );
    assert.equal(items[0]?.href, "/identity");
  });

  it("emits trainAthena when Brain is not ready and not processing", () => {
    const items = buildHomeAttention(
      attentionInput({
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
    assert.deepEqual(
      items.map((item) => item.id),
      ["trainAthena"],
    );
  });

  it("produces no Train Athena item while Brain is processing", () => {
    const items = buildHomeAttention(
      attentionInput({
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

  it("emits completeDefinition when Brain is ready and a core field is missing", () => {
    const items = buildHomeAttention(
      attentionInput({
        define: {
          status: "ok",
          data: {
            brainStatus: "ready",
            hasVoice: true,
            hasKnowledge: true,
            hasWebsite: false,
          },
        },
      }),
    );
    assert.deepEqual(
      items.map((item) => item.id),
      ["completeDefinition"],
    );
  });

  it("emits establishVisibility when there is no SEO row", () => {
    const items = buildHomeAttention(
      attentionInput({
        define: {
          status: "ok",
          data: {
            brainStatus: "ready",
            hasVoice: true,
            hasKnowledge: true,
            hasWebsite: true,
          },
        },
        visibility: { status: "ok", data: null },
      }),
    );
    assert.deepEqual(
      items.map((item) => item.id),
      ["establishVisibility"],
    );
    assert.equal(items[0]?.href, "/seo");
  });

  it("emits reviewFailedVisibility when the latest SEO status failed", () => {
    const items = buildHomeAttention(
      attentionInput({
        define: {
          status: "ok",
          data: {
            brainStatus: "ready",
            hasVoice: true,
            hasKnowledge: true,
            hasWebsite: true,
          },
        },
        visibility: { status: "ok", data: { status: "Processing Failed" } },
      }),
    );
    assert.deepEqual(
      items.map((item) => item.id),
      ["reviewFailedVisibility"],
    );
  });

  it("does not emit visibility attention for Ready or Processing reports", () => {
    for (const status of ["Ready", "Processing", "Queued"]) {
      const items = buildHomeAttention(
        attentionInput({
          define: {
            status: "ok",
            data: {
              brainStatus: "ready",
              hasVoice: true,
              hasKnowledge: true,
              hasWebsite: true,
            },
          },
          visibility: { status: "ok", data: { status } },
        }),
      );
      assert.equal(
        items.some((item) => item.domain === "visibility"),
        false,
        status,
      );
    }
  });

  it("emits defineFirstAudience when audience count is zero", () => {
    const items = buildHomeAttention(
      attentionInput({
        define: {
          status: "ok",
          data: {
            brainStatus: "ready",
            hasVoice: true,
            hasKnowledge: true,
            hasWebsite: true,
          },
        },
        traction: { status: "ok", data: { audienceCount: 0 } },
      }),
    );
    assert.deepEqual(
      items.map((item) => item.id),
      ["defineFirstAudience"],
    );
    assert.equal(items[0]?.href, "/personas");
  });

  it("emits findProspects when prospect total is zero", () => {
    const items = buildHomeAttention(
      attentionInput({
        define: {
          status: "ok",
          data: {
            brainStatus: "ready",
            hasVoice: true,
            hasKnowledge: true,
            hasWebsite: true,
          },
        },
        convert: {
          status: "ok",
          data: { total: 0, newCount: 0, followUpCount: 0 },
        },
      }),
    );
    assert.deepEqual(
      items.map((item) => item.id),
      ["findProspects"],
    );
  });

  it("emits reviewNewProspects when only New is greater than zero", () => {
    const items = buildHomeAttention(
      attentionInput({
        define: {
          status: "ok",
          data: {
            brainStatus: "ready",
            hasVoice: true,
            hasKnowledge: true,
            hasWebsite: true,
          },
        },
        convert: {
          status: "ok",
          data: { total: 4, newCount: 2, followUpCount: 0 },
        },
      }),
    );
    assert.deepEqual(
      items.map((item) => item.id),
      ["reviewNewProspects"],
    );
  });

  it("emits followUpProspects when only Follow-up is greater than zero", () => {
    const items = buildHomeAttention(
      attentionInput({
        define: {
          status: "ok",
          data: {
            brainStatus: "ready",
            hasVoice: true,
            hasKnowledge: true,
            hasWebsite: true,
          },
        },
        convert: {
          status: "ok",
          data: { total: 4, newCount: 0, followUpCount: 3 },
        },
      }),
    );
    assert.deepEqual(
      items.map((item) => item.id),
      ["followUpProspects"],
    );
  });

  it("emits a combined Convert item when New and Follow-up are both greater than zero", () => {
    const items = buildHomeAttention(
      attentionInput({
        define: {
          status: "ok",
          data: {
            brainStatus: "ready",
            hasVoice: true,
            hasKnowledge: true,
            hasWebsite: true,
          },
        },
        convert: {
          status: "ok",
          data: { total: 8, newCount: 1, followUpCount: 2 },
        },
      }),
    );
    assert.deepEqual(
      items.map((item) => item.id),
      ["reviewNewAndFollowUp"],
    );
  });

  it("keeps fixed domain order and at most one item per domain", () => {
    const items = buildHomeAttention({
      define: { status: "ok", data: null },
      visibility: { status: "ok", data: null },
      traction: { status: "ok", data: { audienceCount: 0 } },
      convert: {
        status: "ok",
        data: { total: 5, newCount: 1, followUpCount: 1 },
      },
    });
    assert.deepEqual(
      items.map((item) => item.domain),
      ["define", "visibility", "traction", "convert"],
    );
    assert.deepEqual(
      items.map((item) => item.id),
      [
        "trainAthena",
        "establishVisibility",
        "defineFirstAudience",
        "reviewNewAndFollowUp",
      ],
    );
    assert.equal(items.length <= 4, true);
    assert.equal(new Set(items.map((item) => item.domain)).size, items.length);
  });

  it("skips error domains and never treats error as empty", () => {
    const items = buildHomeAttention({
      define: { status: "error" },
      visibility: { status: "error" },
      traction: { status: "error" },
      convert: { status: "error" },
    });
    assert.deepEqual(items, []);
  });

  it("does not emit zero-state attention from an error domain", () => {
    const items = buildHomeAttention(
      attentionInput({
        define: {
          status: "ok",
          data: {
            brainStatus: "ready",
            hasVoice: true,
            hasKnowledge: true,
            hasWebsite: true,
          },
        },
        traction: { status: "error" },
        convert: { status: "error" },
      }),
    );
    assert.equal(
      items.some(
        (item) =>
          item.id === "defineFirstAudience" || item.id === "findProspects",
      ),
      false,
    );
  });
});

describe("V2-UI-2C Home domain state", () => {
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

  it("maps traction zero / one / many without treating error as zero", () => {
    assert.equal(
      deriveTractionState({ status: "ok", data: { audienceCount: 0 } }).kind,
      "none",
    );
    assert.equal(
      deriveTractionState({ status: "ok", data: { audienceCount: 1 } }).kind,
      "one",
    );
    assert.equal(
      deriveTractionState({ status: "ok", data: { audienceCount: 4 } }).kind,
      "many",
    );
  });

  it("maps convert query failure to unknown, not zero prospects", () => {
    const state = deriveConvertState({ status: "error" });
    assert.equal(state.kind, "unknown");
    assert.equal(state.total, null);
    assert.equal(state.cta, "unavailable");
  });

  it("maps convert CTA variants from stored counts", () => {
    assert.equal(
      deriveConvertState({
        status: "ok",
        data: { total: 0, newCount: 0, followUpCount: 0 },
      }).cta,
      "find",
    );
    assert.equal(
      deriveConvertState({
        status: "ok",
        data: { total: 2, newCount: 0, followUpCount: 0 },
      }).cta,
      "open",
    );
    assert.equal(
      deriveConvertState({
        status: "ok",
        data: { total: 2, newCount: 1, followUpCount: 0 },
      }).cta,
      "reviewNew",
    );
    assert.equal(
      deriveConvertState({
        status: "ok",
        data: { total: 2, newCount: 0, followUpCount: 1 },
      }).cta,
      "followUp",
    );
    assert.equal(
      deriveConvertState({
        status: "ok",
        data: { total: 2, newCount: 1, followUpCount: 1 },
      }).cta,
      "reviewBoth",
    );
  });
});
