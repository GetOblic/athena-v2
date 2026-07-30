import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, it } from "node:test";
import {
  excludePersonaIntelligenceBridges,
  isPersonaIntelligenceBridge,
  isTrustedPersonaBridgeFor,
  PERSONA_INTELLIGENCE_PLATFORM,
} from "../../services/personas/personaBridgeMarker";
import {
  isProspectIntelligenceBridge,
  PROSPECT_INTELLIGENCE_PLATFORM,
} from "../../services/prospects/prospectBridgeMarker";
import {
  buildPersonaAnalysisBody,
  formatNormalizedPersonaInputForPipeline,
} from "../../services/personas/personaPipelineBody";

const ROOT = join(process.cwd());

function read(relativePath: string): string {
  return readFileSync(join(ROOT, relativePath), "utf8");
}

describe("persona stage-3 bridge marker", () => {
  it("identifies persona_intelligence platform and trusted markers", () => {
    const bridge = {
      platform: PERSONA_INTELLIGENCE_PLATFORM,
      organization_id: "org-a",
      raw_json: {
        intelligence_source: "persona",
        persona_id: "persona-1",
      },
    };
    const viaRaw = {
      platform: "reddit",
      raw_json: { intelligence_source: "persona" },
    };
    const prospect = {
      platform: PROSPECT_INTELLIGENCE_PLATFORM,
      raw_json: {
        intelligence_source: "prospect",
        prospect_id: "prospect-1",
      },
    };
    const real = { platform: "reddit", raw_json: {} };

    assert.equal(isPersonaIntelligenceBridge(bridge), true);
    assert.equal(isPersonaIntelligenceBridge(viaRaw), true);
    assert.equal(isPersonaIntelligenceBridge(prospect), false);
    assert.equal(isPersonaIntelligenceBridge(real), false);
    assert.equal(isProspectIntelligenceBridge(bridge), false);
    assert.equal(isProspectIntelligenceBridge(prospect), true);

    assert.equal(
      isTrustedPersonaBridgeFor(bridge, "persona-1", "org-a"),
      true,
    );
    assert.equal(
      isTrustedPersonaBridgeFor(bridge, "persona-2", "org-a"),
      false,
    );
    assert.equal(
      isTrustedPersonaBridgeFor(bridge, "persona-1", "org-b"),
      false,
    );
    assert.equal(isTrustedPersonaBridgeFor(prospect, "persona-1", "org-a"), false);

    const filtered = excludePersonaIntelligenceBridges([
      bridge,
      real,
      viaRaw,
      prospect,
    ]);
    assert.equal(filtered.length, 2);
    assert.equal(filtered[0].platform, "reddit");
    assert.equal(filtered[1].platform, PROSPECT_INTELLIGENCE_PLATFORM);
  });
});

describe("persona stage-3 normalized pipeline body", () => {
  it("serializes populated fields deterministically with evidence discipline", () => {
    const body = formatNormalizedPersonaInputForPipeline({
      persona_name: "Urban Seeker",
      age_range: "30-45",
      city: "Paris",
      additional_context: "Line one\nLine two",
      notes: "Operator note",
      ads_content: "Ad copy",
      reference_website: "https://example.com",
      pain_points: "Time scarcity",
    });

    assert.match(body, /EXECUTIVE INTELLIGENCE SOURCE: PERSONA/);
    assert.match(body, /EVIDENCE DISCIPLINE:/);
    assert.match(body, /clientele archetype or audience segment/);
    assert.match(body, /PERSONA:\nUrban Seeker/);
    assert.match(body, /=== STRUCTURED PERSONA PROFILE — USER-PROVIDED ===/);
    assert.match(body, /Age Range: 30-45/);
    assert.match(body, /City: Paris/);
    assert.match(body, /Pain Points: Time scarcity/);
    assert.match(
      body,
      /=== ADDITIONAL CONTEXT — PRIMARY USER UNDERSTANDING ===/,
    );
    assert.match(body, /Line one\nLine two/);
    assert.match(body, /=== NOTES — OPERATOR CONTEXT ===/);
    assert.match(body, /Operator note/);
    assert.match(body, /=== ADS CONTENT — OBSERVED OR PROPOSED CREATIVE ===/);
    assert.match(body, /Ad copy/);
    assert.match(body, /=== REFERENCE WEBSITE ===/);
    assert.match(body, /URL: https:\/\/example\.com/);
    assert.match(body, /contextual reference source/);
    assert.match(body, /=== MISSING OR UNKNOWN AREAS ===/);
    assert.doesNotMatch(body, /linked_discussion_id/);
    assert.doesNotMatch(body, /organization_id/);
    assert.doesNotMatch(body, /Gender Identity:/);
    assert.doesNotMatch(body, /Birth Year/);

    const again = buildPersonaAnalysisBody({
      persona_name: "Urban Seeker",
      age_range: "30-45",
      city: "Paris",
      additional_context: "Line one\nLine two",
      notes: "Operator note",
      ads_content: "Ad copy",
      reference_website: "https://example.com",
      pain_points: "Time scarcity",
    });
    assert.equal(body, again);
  });

  it("omits blank fields and does not fabricate missing demographics", () => {
    const body = formatNormalizedPersonaInputForPipeline({
      additional_context: "Only context",
    });
    assert.match(body, /Persona: Only context|PERSONA:\nPersona: Only context/);
    assert.doesNotMatch(body, /Age Range:/);
    assert.doesNotMatch(body, /Gender Identity:/);
    assert.match(body, /Identity and demographics/);
  });
});

describe("persona stage-3 bridge lifecycle source contracts", () => {
  it("implements ensure/prepare/queue helpers with tenant-safe relinking", () => {
    const importer = read("services/personas/personaImporter.ts");
    assert.match(importer, /export async function ensurePersonaBridgeDiscussion/);
    assert.match(
      importer,
      /export async function preparePersonaBridgeBeforeGeneration/,
    );
    assert.match(importer, /export async function ensurePersonaGenerationQueued/);
    assert.match(importer, /isTrustedPersonaBridgeFor/);
    assert.match(importer, /PERSONA_INTELLIGENCE_PLATFORM/);
    assert.match(importer, /enqueueDiscussionGenerationJob/);
    assert.match(importer, /resolvePersonaDisplayLabel/);
    assert.match(importer, /buildPersonaAnalysisBody/);
    assert.match(importer, /manual_refresh/);
    assert.match(
      read("app/api/personas/[id]/refresh/route.ts"),
      /triggerType: "manual_refresh"/,
    );
    assert.doesNotMatch(importer, /persona_deep_scrape/);
    assert.doesNotMatch(importer, /prospect_intelligence/);
    assert.doesNotMatch(importer, /scrapeHomepageIntelligence/);
  });
});
