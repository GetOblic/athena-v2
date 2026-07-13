import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import {
  formatProspectOpportunityScoreWithRecommendation,
  resolveProspectOpportunityRecommendation,
  resolveProspectOpportunityScore,
} from "../../services/prospects/prospectDisplay";
import {
  hasMeaningfulProspectEdit,
  normalizeWebsiteUrl,
} from "../../services/prospects/prospectUtils";
import { getAthenaVerdict } from "../../lib/discussionExecutiveIntel";

const ROOT = join(process.cwd());

describe("prospect clickable URL normalization", () => {
  it("normalizes website and social URLs for external links", () => {
    assert.equal(
      normalizeWebsiteUrl("elevateaesthetics.com"),
      "https://elevateaesthetics.com",
    );
    assert.equal(
      normalizeWebsiteUrl("https://linkedin.com/in/jane"),
      "https://linkedin.com/in/jane",
    );
    assert.equal(normalizeWebsiteUrl(""), null);
    assert.equal(normalizeWebsiteUrl("not a website"), null);
  });
});

describe("prospect opportunity score recommendation pairing", () => {
  it("pairs numeric score with existing Athena recommendation label", () => {
    const analysis = {
      opportunity_detected: true,
      confidence: 71,
    } as never;
    const recommendation = resolveProspectOpportunityRecommendation(analysis);
    const presented = formatProspectOpportunityScoreWithRecommendation({
      score: resolveProspectOpportunityScore({ canonicalScore: 71 }),
      recommendation,
    });

    assert.equal(presented.scoreLabel, "71");
    assert.equal(presented.recommendation, getAthenaVerdict(analysis));
    assert.equal(presented.recommendation, "Worth pursuing");
  });

  it("does not invent a recommendation without analysis", () => {
    const presented = formatProspectOpportunityScoreWithRecommendation({
      score: 55,
      recommendation: resolveProspectOpportunityRecommendation(null),
    });
    assert.equal(presented.scoreLabel, "55");
    assert.equal(presented.recommendation, null);
  });
});

describe("prospect edit meaningfulness", () => {
  it("unchanged values are not meaningful edits", () => {
    const row = {
      business_name: "Acme",
      website: "https://acme.com",
      notes: "n",
    };
    assert.equal(hasMeaningfulProspectEdit(row, { ...row }), false);
  });

  it("website change is a meaningful edit", () => {
    assert.equal(
      hasMeaningfulProspectEdit(
        { business_name: "Acme", website: "https://acme.com" },
        { business_name: "Acme", website: "https://acme.io" },
      ),
      true,
    );
  });
});

describe("prospect refresh and delete route contracts", () => {
  it("refresh route uses manual_refresh trigger type", () => {
    const source = readFileSync(
      join(ROOT, "app/api/prospects/[id]/refresh/route.ts"),
      "utf8",
    );
    assert.match(source, /triggerType:\s*"manual_refresh"/);
    assert.doesNotMatch(source, /scrape|fetch\(|processDiscussionEndToEnd/);
  });

  it("meaningful prospect PATCH uses discussion_update (no website re-crawl)", () => {
    const route = readFileSync(
      join(ROOT, "app/api/prospects/[id]/route.ts"),
      "utf8",
    );
    assert.match(route, /triggerType:\s*"discussion_update"/);
  });

  it("importer supports explicit manual_refresh while defaulting import", () => {
    const source = readFileSync(
      join(ROOT, "services/prospects/prospectImporter.ts"),
      "utf8",
    );
    assert.match(source, /triggerType:\s*options\?\.triggerType \?\? "discussion_import"/);
    assert.match(source, /manual_refresh/);
  });

  it("prospect DELETE route enforces auth and ownership helpers", () => {
    const route = readFileSync(
      join(ROOT, "app/api/prospects/[id]/route.ts"),
      "utf8",
    );
    assert.match(route, /export async function DELETE/);
    assert.match(route, /requireCurrentOrganizationContext/);
    assert.match(route, /getProspectById/);
    assert.match(route, /deleteProspect/);
  });

  it("deleteProspect removes bridge through deleteDiscussion", () => {
    const service = readFileSync(
      join(ROOT, "services/prospects/prospectService.ts"),
      "utf8",
    );
    assert.match(service, /export async function deleteProspect/);
    assert.match(service, /deleteDiscussion/);
    assert.match(service, /\.eq\("organization_id", organizationId\)/);
  });
});

describe("prospect details read-only / edit UX contracts", () => {
  it("ProspectMetadataEditor defaults to read-only with Edit/Save/Cancel/Delete", () => {
    const source = readFileSync(
      join(ROOT, "components/prospects/ProspectMetadataEditor.tsx"),
      "utf8",
    );
    assert.match(source, /useState\(false\)/);
    assert.match(source, />\s*Edit\s*</);
    assert.match(source, /Saving…|"Save"/);
    assert.match(source, />\s*Cancel\s*</);
    assert.match(source, />\s*Delete\s*</);
    assert.match(source, /Confirm Delete/);
    assert.match(source, /trackQueuedGeneration/);
    assert.match(source, /\/api\/prospects\/\$\{prospect\.id\}\/refresh/);
    assert.match(source, /noopener noreferrer/);
    assert.match(source, /normalizeWebsiteUrl/);
    assert.match(source, /isEditing/);
  });

  it("homepage intelligence uses collapsible sections", () => {
    const source = readFileSync(
      join(ROOT, "components/prospects/ProspectHomepageIntelligence.tsx"),
      "utf8",
    );
    assert.match(source, /aria-expanded/);
    assert.match(source, /Positioning/);
    assert.match(source, /Brand Tone/);
  });
});
