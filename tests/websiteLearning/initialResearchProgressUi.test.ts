/**
 * Gate 3A — initial Deep Scrape progress presentation.
 * Deterministic UI mapping, reload/stale observations, and catalog parity.
 */

import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, it } from "node:test";
import { IdentityInitialResearchStatusView } from "../../components/identity/IdentityInitialResearchStatusView";
import { ProspectInitialResearchStatusView } from "../../components/prospects/ProspectInitialResearchStatusView";
import { de } from "../../lib/tenantI18n/messages/de";
import { en } from "../../lib/tenantI18n/messages/en";
import { es } from "../../lib/tenantI18n/messages/es";
import { fr } from "../../lib/tenantI18n/messages/fr";
import { it as itMessages } from "../../lib/tenantI18n/messages/it";
import { pt } from "../../lib/tenantI18n/messages/pt";
import type { TenantMessages } from "../../lib/tenantI18n/types";
import {
  describeIdentityInitialResearch,
  describeProspectInitialResearch,
  emptyInitialResearchStatus,
  presentIdentityInitialResearch,
  presentProspectInitialResearch,
  readInitialResearchStatusPayload,
  reconcileResearchSnapshot,
  reduceIdentityObservation,
  reduceProspectObservation,
  serializeInitialResearchStatus,
  shouldAcceptResearchObservation,
  shouldReadProspectGeneration,
  type InitialResearchStatusPayload,
} from "../../lib/websiteLearning/initialResearchProgress";
import { buildInitialResearchProgress } from "../../services/websiteLearning/deepScrape/initialResearchPolicy";

const ROOT = process.cwd();

function read(relativePath: string): string {
  return readFileSync(join(ROOT, relativePath), "utf8");
}

const DICTIONARIES: Record<string, TenantMessages> = {
  en,
  fr,
  es,
  it: itMessages,
  de,
  pt,
};

const LABELS = en.identity.brainStatusValues;

function research(
  patch: Partial<InitialResearchStatusPayload> = {},
): InitialResearchStatusPayload {
  return {
    ...emptyInitialResearchStatus(),
    applies: true,
    jobId: "job-1",
    status: "queued",
    stage: "discovering",
    fallback: "idle",
    updatedAt: "2026-10-18T10:00:00.000Z",
    ...patch,
  };
}

function identityCopy() {
  return en.identity.initialResearch;
}

function prospectCopy() {
  return en.prospects.initialResearch;
}

describe("initial research progress — Identity", () => {
  it("shows Researching your website when initial Train starts Deep Scrape", () => {
    for (const status of ["queued", "processing", "retryable"] as const) {
      const described = describeIdentityInitialResearch({
        brainStatus: "processing",
        research: research({ status, stage: "crawling" }),
        labels: LABELS,
        copy: identityCopy(),
      });
      assert.equal(described.view.kind, "researching");
      assert.equal(described.label, "Researching your website");
      assert.equal(described.notice, null);
      assert.equal(described.retryLabel, null);
    }
  });

  it("shows Training Athena when the worker advances to Brain compilation", () => {
    const described = describeIdentityInitialResearch({
      brainStatus: "processing",
      research: research({
        status: "processing",
        stage: "retraining",
        phase: "brain_deep_scrape",
        promoted: true,
        updatedAt: "2026-10-18T10:05:00.000Z",
      }),
      labels: LABELS,
      copy: identityCopy(),
    });
    assert.equal(described.view.kind, "training");
    assert.equal(described.label, "Training Athena");
    assert.equal(described.notice, null);
  });

  it("reuses the existing Ready label when Brain compilation succeeds", () => {
    const described = describeIdentityInitialResearch({
      brainStatus: "ready",
      research: research({
        status: "completed",
        stage: "completed",
        promoted: true,
      }),
      labels: LABELS,
      copy: identityCopy(),
    });
    assert.equal(described.view.kind, "ready");
    assert.equal(described.view.researchFailed, false);
    assert.equal(described.label, en.identity.brainStatusValues.ready);
    assert.equal(described.notice, null);
  });

  it("distinguishes website-research failure from Brain compilation failure", () => {
    const evidenceFree = describeIdentityInitialResearch({
      brainStatus: "ready",
      research: research({
        status: "failed",
        stage: "failed",
        promoted: false,
        fallback: "settled",
        researchFailed: true,
      }),
      labels: LABELS,
      copy: identityCopy(),
    });
    const compiling = describeIdentityInitialResearch({
      brainStatus: "processing",
      research: research({
        status: "retryable",
        fallback: "pending",
        researchFailed: true,
        promoted: false,
      }),
      labels: LABELS,
      copy: identityCopy(),
    });
    const compilationFailed = describeIdentityInitialResearch({
      brainStatus: "processing",
      research: research({
        status: "failed",
        stage: "retraining",
        promoted: true,
        researchFailed: false,
      }),
      labels: LABELS,
      copy: identityCopy(),
    });

    assert.equal(evidenceFree.label, "Ready");
    assert.match(evidenceFree.notice ?? "", /business information you provided/);
    assert.equal(evidenceFree.retryLabel, null);
    assert.equal(compiling.view.kind, "research_failed_continuing");
    assert.equal(compiling.label, "Training Athena");
    assert.match(compiling.notice ?? "", /could not be completed/);
    assert.equal(compilationFailed.view.kind, "compilation_failed");
    assert.equal(compilationFailed.label, "Athena could not finish training.");
    assert.notEqual(compilationFailed.label, evidenceFree.notice);
    assert.notEqual(compilationFailed.label, compiling.notice);
  });

  it("presents a terminal research failure with an explicit retry", () => {
    const described = describeIdentityInitialResearch({
      brainStatus: "pending",
      research: research({
        status: "failed",
        stage: "failed",
        fallback: "settled",
        researchFailed: true,
        promoted: false,
      }),
      labels: LABELS,
      copy: identityCopy(),
    });
    assert.equal(described.view.kind, "terminal_failed");
    assert.equal(described.label, "Website research could not be completed.");
    assert.equal(described.retryLabel, "Train again");
    const html = renderToStaticMarkup(
      createElement(IdentityInitialResearchStatusView, {
        label: described.label,
        notice: described.notice,
        retryLabel: described.retryLabel,
      }),
    );
    assert.match(html, /Website research could not be completed/);
    assert.match(html, /href="#identity-teach"/);
    assert.match(html, /Train again/);
    assert.doesNotMatch(html, /method="post"|fetch\(/);
  });

  it("leaves manual Deep Scrape and ordinary Brain status on the existing label", () => {
    const manual = describeIdentityInitialResearch({
      brainStatus: "ready",
      research: research({ applies: false, status: "processing", stage: "crawling" }),
      labels: LABELS,
      copy: identityCopy(),
    });
    const pending = describeIdentityInitialResearch({
      brainStatus: "pending",
      research: emptyInitialResearchStatus(),
      labels: LABELS,
      copy: identityCopy(),
    });
    assert.equal(manual.view.kind, "brain_status");
    assert.equal(manual.label, "Ready");
    assert.equal(pending.label, "Pending");
    assert.equal(
      presentIdentityInitialResearch({
        brainStatus: "processing",
        research: null,
      }).kind,
      "brain_status",
    );
  });
});

describe("initial research progress — Prospect", () => {
  it("shows Researching website instead of the generic Queued label", () => {
    const described = describeProspectInitialResearch({
      displayStatus: "Queued",
      hasCurrentVersion: false,
      research: research({ status: "processing", stage: "crawling" }),
      generation: null,
      existingLabel: en.prospects.convert.athenaStarting,
      failedLabel: en.prospects.convert.intelligenceFailed,
      copy: prospectCopy(),
    });
    assert.equal(described.view.kind, "researching");
    assert.equal(described.label, "Researching website");
    assert.notEqual(described.label, "Athena is starting");
    assert.notEqual(described.label, "Queued");
    assert.equal(described.statusToken, "Researching Website");
  });

  it("shows Generating Intelligence when the follow-on generation begins", () => {
    const parked = describeProspectInitialResearch({
      displayStatus: "Queued",
      hasCurrentVersion: false,
      research: research({
        status: "awaiting_follow_on",
        stage: "regenerating",
        promoted: true,
      }),
      generation: { status: "queued", inFlight: true, evidenceFree: false },
      existingLabel: en.prospects.convert.athenaStarting,
      failedLabel: en.prospects.convert.intelligenceFailed,
      copy: prospectCopy(),
    });
    assert.equal(parked.view.kind, "generating");
    assert.equal(parked.label, "Generating Intelligence");
    assert.equal(parked.statusToken, "Generating Executive Intelligence");
    assert.equal(parked.notice, null);
  });

  it("says Athena is using available business information after research failure", () => {
    const described = describeProspectInitialResearch({
      displayStatus: "Queued",
      hasCurrentVersion: false,
      research: research({
        status: "failed",
        researchFailed: true,
        fallback: "settled",
        followOnJobId: "gen-1",
      }),
      generation: { status: "processing", inFlight: true, evidenceFree: true },
      existingLabel: en.prospects.convert.athenaStarting,
      failedLabel: en.prospects.convert.intelligenceFailed,
      copy: prospectCopy(),
    });
    assert.equal(described.view.kind, "evidence_free_generating");
    assert.equal(described.label, "Generating Intelligence");
    assert.equal(
      described.notice,
      "Athena is using the available business information.",
    );
    assert.notEqual(described.label, en.prospects.convert.intelligenceFailed);
  });

  it("preserves Ready, Processing Failed, and does not restyle a manual scrape", () => {
    const ready = describeProspectInitialResearch({
      displayStatus: "Ready",
      hasCurrentVersion: true,
      research: research({ status: "completed", promoted: true }),
      generation: null,
      existingLabel: en.prospects.convert.intelligenceReady,
      failedLabel: en.prospects.convert.intelligenceFailed,
      copy: prospectCopy(),
    });
    const failed = describeProspectInitialResearch({
      displayStatus: "Processing Failed",
      hasCurrentVersion: false,
      research: research({ status: "failed", fallback: "settled", researchFailed: true }),
      generation: { status: "failed", inFlight: false, evidenceFree: true },
      existingLabel: en.prospects.convert.athenaStarting,
      failedLabel: en.prospects.convert.intelligenceFailed,
      copy: prospectCopy(),
    });
    const manual = describeProspectInitialResearch({
      displayStatus: "Queued",
      hasCurrentVersion: false,
      research: research({ applies: false, status: "queued" }),
      generation: null,
      existingLabel: en.prospects.convert.athenaStarting,
      failedLabel: en.prospects.convert.intelligenceFailed,
      copy: prospectCopy(),
    });
    assert.equal(ready.view.kind, "ready");
    assert.equal(ready.label, "Intelligence ready");
    assert.equal(failed.view.kind, "failed");
    assert.equal(failed.label, "Intelligence failed");
    assert.equal(failed.statusToken, "Processing Failed");
    assert.equal(manual.view.kind, "existing");
    assert.equal(manual.label, "Athena is starting");
    assert.equal(
      presentProspectInitialResearch({
        displayStatus: "Ready",
        hasCurrentVersion: true,
        research: research({ status: "processing" }),
        generation: { status: "completed", inFlight: false, evidenceFree: false },
      }).kind,
      "ready",
    );
  });
});

describe("initial research progress — reload and stale responses", () => {
  it("accepts a reload snapshot and ignores an older poll", () => {
    const loaded = research({
      status: "processing",
      stage: "retraining",
      promoted: true,
      updatedAt: "2026-10-18T10:05:00.000Z",
    });
    const stale = research({
      status: "queued",
      stage: "discovering",
      updatedAt: "2026-10-18T10:00:00.000Z",
    });
    assert.equal(
      shouldAcceptResearchObservation({
        previousUpdatedAt: null,
        nextUpdatedAt: loaded.updatedAt,
      }),
      true,
    );
    assert.equal(
      shouldAcceptResearchObservation({
        previousUpdatedAt: loaded.updatedAt,
        nextUpdatedAt: stale.updatedAt,
      }),
      false,
    );
    assert.equal(
      shouldAcceptResearchObservation({
        previousUpdatedAt: loaded.updatedAt,
        nextUpdatedAt: null,
      }),
      false,
    );

    const current = { brainStatus: "processing", research: loaded };
    const reduced = reduceIdentityObservation({
      previous: current,
      brainStatus: "processing",
      research: stale,
    });
    assert.equal(reduced.research.status, "processing");
    assert.equal(reduced.research.stage, "retraining");

    const refreshed = reconcileResearchSnapshot(current, {
      brainStatus: "ready",
      research: research({
        status: "completed",
        promoted: true,
        updatedAt: "2026-10-18T10:06:00.000Z",
      }),
    });
    assert.equal(refreshed.brainStatus, "ready");
    assert.equal(
      reconcileResearchSnapshot(refreshed, {
        brainStatus: "processing",
        research: stale,
      }).brainStatus,
      "ready",
    );
  });

  it("does not let a stale prospect poll replace generation with Queued research", () => {
    const current = {
      research: research({
        status: "awaiting_follow_on",
        promoted: true,
        updatedAt: "2026-10-18T10:05:00.000Z",
      }),
      generation: { status: "processing", inFlight: true, evidenceFree: false },
    };
    const reduced = reduceProspectObservation({
      previous: current,
      research: research({ status: "queued", updatedAt: "2026-10-18T10:00:00.000Z" }),
      generation: null,
      generationRead: false,
    });
    assert.equal(reduced, current);
    assert.equal(
      describeProspectInitialResearch({
        displayStatus: "Queued",
        hasCurrentVersion: false,
        research: reduced.research,
        generation: reduced.generation,
        existingLabel: "Athena is starting",
        failedLabel: "Intelligence failed",
        copy: prospectCopy(),
      }).label,
      "Generating Intelligence",
    );
  });

  it("rejects a malformed status payload instead of inventing progress", () => {
    assert.equal(readInitialResearchStatusPayload(null), null);
    assert.equal(readInitialResearchStatusPayload({ applies: "yes" }), null);
    assert.equal(
      readInitialResearchStatusPayload({ applies: true, fallback: "done" }),
      null,
    );
    const serialized = serializeInitialResearchStatus({
      id: "job-1",
      status: "queued",
      current_stage: "discovering",
      progress: buildInitialResearchProgress(),
      promoted_at: null,
      follow_on_generation_job_id: null,
      error_metadata: null,
      updated_at: "2026-10-18T10:00:00.000Z",
    });
    assert.equal(serialized.applies, true);
    assert.equal(serialized.fallback, "idle");
    assert.equal(serialized.researchFailed, false);
    assert.equal(serialized.promoted, false);
    const manual = serializeInitialResearchStatus({
      id: "job-2",
      status: "processing",
      current_stage: "crawling",
      progress: { pagesCrawled: 4, pagesTarget: 12 },
      promoted_at: null,
      follow_on_generation_job_id: null,
      error_metadata: null,
      updated_at: "2026-10-18T10:00:00.000Z",
    });
    assert.equal(manual.applies, false);
    assert.equal(
      shouldReadProspectGeneration({
        discussionId: "disc-1",
        research: research({ status: "queued" }),
        currentKind: "researching",
      }),
      false,
    );
  });
});

describe("initial research progress — UI wiring", () => {
  it("renders the Identity and Prospect states without counts or percentages", () => {
    const researching = renderToStaticMarkup(
      createElement(IdentityInitialResearchStatusView, {
        label: "Researching your website",
        notice: null,
        retryLabel: null,
      }),
    );
    const training = renderToStaticMarkup(
      createElement(IdentityInitialResearchStatusView, {
        label: "Training Athena",
        notice: "Website research could not be completed. Athena is training from the business information you provided.",
        retryLabel: null,
      }),
    );
    const ready = renderToStaticMarkup(
      createElement(IdentityInitialResearchStatusView, {
        label: "Ready",
        notice: "Website research could not be completed. Athena used the business information you provided.",
        retryLabel: null,
      }),
    );
    const prospect = renderToStaticMarkup(
      createElement(ProspectInitialResearchStatusView, {
        label: "Researching website",
        notice: null,
        statusToken: "Researching Website",
      }),
    );
    const generating = renderToStaticMarkup(
      createElement(ProspectInitialResearchStatusView, {
        label: "Generating Intelligence",
        notice: "Athena is using the available business information.",
        statusToken: "Generating Executive Intelligence",
      }),
    );
    assert.match(researching, /Researching your website/);
    assert.match(training, /Training Athena/);
    assert.match(training, /business information you provided/);
    assert.match(ready, /Ready/);
    assert.match(prospect, /Researching website/);
    assert.match(generating, /Generating Intelligence/);
    assert.match(generating, /available business information/);
    for (const html of [researching, training, ready, prospect, generating]) {
      assert.doesNotMatch(html, /%|pages|of \d/i);
    }
  });

  it("polls the existing status APIs and does not enqueue from the client", () => {
    const identity = read("components/identity/IdentityInitialResearchStatus.tsx");
    const prospect = read("components/prospects/ProspectInitialResearchStatus.tsx");
    const identityPage = read("app/identity/page.tsx");
    const prospectPage = read("app/prospects/[id]/page.tsx");
    const identityStatus = read("app/api/identity/deep-scrape/status/route.ts");
    const prospectStatus = read("app/api/prospects/[id]/deep-scrape/status/route.ts");
    assert.match(identity, /method: "GET"/);
    assert.match(identity, /\/api\/identity\/deep-scrape\/status/);
    assert.match(prospect, /method: "GET"/);
    assert.match(prospect, /\/deep-scrape\/status/);
    assert.match(prospect, /\/api\/discussions\//);
    assert.doesNotMatch(identity, /method:\s*"POST"/);
    assert.doesNotMatch(prospect, /method:\s*"POST"/);
    assert.doesNotMatch(identity, /enqueue|startDeepScrape/);
    assert.doesNotMatch(prospect, /enqueue|startDeepScrape/);
    assert.match(identityPage, /getActiveDeepScrapeJobForBrain/);
    assert.match(identityPage, /organizationId/);
    assert.match(prospectPage, /getActiveDeepScrapeJobForProspect/);
    assert.match(identityStatus, /requireCurrentOrganizationContext/);
    assert.match(identityStatus, /serializeInitialResearchStatus\(latest\)/);
    assert.match(prospectStatus, /getProspectById\(id, organizationId\)/);
    assert.match(prospectStatus, /serializeInitialResearchStatus\(latest\)/);
    assert.doesNotMatch(identityStatus, /searchParams|request\.json/);
    assert.doesNotMatch(prospectStatus, /request\.json/);
  });

  it("keeps Teach fields, manual Deep Scrape, and the generation controls", () => {
    const teach = read("components/identity/IdentityTeachAthenaSection.tsx");
    const identityPage = read("app/identity/page.tsx");
    const prospectPage = read("app/prospects/[id]/page.tsx");
    const identityButton = read("components/identity/DeepScrapeWebsiteButton.tsx");
    const prospectButton = read("components/prospects/ProspectDeepScrapeWebsiteButton.tsx");
    assert.match(teach, /name="greeting_name"/);
    assert.match(teach, /name="about_you"/);
    assert.match(teach, /name="expertise"/);
    assert.match(teach, /name="website"/);
    assert.match(identityPage, /DeepScrapeWebsiteButton/);
    assert.match(identityPage, /initiallyAvailable=\{identity\?\.brain_status === "ready" && hasWebsite\}/);
    assert.match(prospectPage, /ProspectDeepScrapeWebsiteButton/);
    assert.match(prospectPage, /initiallyAvailable=\{hasCurrentVersion && Boolean\(prospect\.website\)\}/);
    assert.match(prospectPage, /ProspectRefreshIntelligenceButton/);
    assert.match(prospectPage, /intelligenceStatus=\{intelligenceReadiness\}/);
    assert.match(identityButton, /method: "POST"/);
    assert.match(prospectButton, /method: "POST"/);
    assert.match(identityButton, /if \(!available\) return/);
    assert.match(prospectButton, /if \(!available\) return/);
  });
});

describe("initial research progress — six-language catalog parity", () => {
  const identityKeys = Object.keys(en.identity.initialResearch).sort();
  const prospectKeys = Object.keys(en.prospects.initialResearch).sort();

  it("uses the same initial-research keys in every catalog", () => {
    assert.deepEqual(identityKeys, [
      "compilationFailed",
      "researchContinuing",
      "researchFailedReady",
      "researching",
      "retry",
      "terminalFailed",
      "training",
    ]);
    assert.deepEqual(prospectKeys, [
      "generating",
      "researching",
      "usingAvailableInformation",
    ]);
    for (const messages of Object.values(DICTIONARIES)) {
      assert.deepEqual(
        Object.keys(messages.identity.initialResearch).sort(),
        identityKeys,
      );
      assert.deepEqual(
        Object.keys(messages.prospects.initialResearch).sort(),
        prospectKeys,
      );
      for (const key of identityKeys) {
        const text =
          messages.identity.initialResearch[
            key as keyof typeof en.identity.initialResearch
          ];
        assert.equal(typeof text, "string");
        assert.ok(text.trim().length > 0);
      }
      for (const key of prospectKeys) {
        const text =
          messages.prospects.initialResearch[
            key as keyof typeof en.prospects.initialResearch
          ];
        assert.equal(typeof text, "string");
        assert.ok(text.trim().length > 0);
      }
    }
  });

  it("does not leave the other languages as the English strings", () => {
    for (const [language, messages] of Object.entries(DICTIONARIES)) {
      if (language === "en") continue;
      assert.notEqual(
        messages.identity.initialResearch.researching,
        en.identity.initialResearch.researching,
      );
      assert.notEqual(
        messages.identity.initialResearch.training,
        en.identity.initialResearch.training,
      );
      assert.notEqual(
        messages.prospects.initialResearch.researching,
        en.prospects.initialResearch.researching,
      );
      assert.notEqual(
        messages.prospects.initialResearch.generating,
        en.prospects.initialResearch.generating,
      );
      assert.notEqual(
        messages.prospects.initialResearch.usingAvailableInformation,
        en.prospects.initialResearch.usingAvailableInformation,
      );
    }
  });
});
