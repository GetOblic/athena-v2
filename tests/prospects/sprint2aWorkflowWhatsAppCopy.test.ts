import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, it } from "node:test";
import { buildDiscussionDeploymentAssets } from "../../lib/deploymentAssets";
import { buildDiscussionWorkflowSteps } from "../../lib/discussionWorkflow";
import {
  BLUEPRINT_ASSET_TYPES,
  canonicalDeploymentAssetType,
  isSupportedAssetInteractionType,
  LIVE_EXECUTIVE_VERSION_SENTINEL,
  resolveExecutiveVersionScopeId,
} from "../../services/assetInteractions/assetInteractionKeys";
import { parseProspectCsv } from "../../services/prospects/prospectCsv";
import {
  formatNormalizedProspectInputForPipeline,
  normalizeProspectExecutiveInput,
} from "../../services/prospects/prospectNormalization";
import { buildWhatsAppMeUrl } from "../../services/prospects/prospectWhatsApp";
import { WHATSAPP_OUTREACH_GENERATION_RULES } from "../../services/ai/prompts/whatsappOutreachConstraints";

const ROOT = join(process.cwd());

function stubAnalysis(partial?: Record<string, unknown>) {
  return {
    id: "analysis-1",
    organization_id: "org-1",
    discussion_id: "disc-1",
    community_id: null,
    created_at: "2026-07-13T00:00:00.000Z",
    updated_at: "2026-07-13T00:00:00.000Z",
    suggested_cta: null,
    raw_json: null,
    status: "completed",
    ...partial,
  } as never;
}

describe("Sprint 2A — Workflow Progress Current Status", () => {
  it("Discussion final node uses Discussion client status, not readiness", () => {
    const steps = buildDiscussionWorkflowSteps({
      analysis: stubAnalysis(),
      opportunity: { id: "opp-1" } as never,
      briefing: { id: "brief-1" } as never,
      assetBlueprint: { id: "bp-1" } as never,
      clientStatusLabel: "Reviewing",
    });

    const final = steps[steps.length - 1];
    assert.equal(final.key, "outcome");
    assert.equal(final.label, "Current Status: Reviewing");
    assert.equal(final.complete, false);
    assert.ok(!steps.some((step) => step.label === "Outcome"));
  });

  it("Prospect final node uses lifecycle_status, not intelligence readiness", () => {
    const steps = buildDiscussionWorkflowSteps({
      analysis: stubAnalysis(),
      opportunity: null,
      briefing: null,
      assetBlueprint: null,
      clientStatusLabel: "Meeting Scheduled",
    });

    assert.equal(
      steps[steps.length - 1].label,
      "Current Status: Meeting Scheduled",
    );
    assert.ok(
      !steps.some((step) =>
        ["Queued", "Processing", "Ready", "Processing Failed"].includes(
          step.label,
        ),
      ),
    );
  });

  it("status label updates when clientStatusLabel changes", () => {
    const first = buildDiscussionWorkflowSteps({
      analysis: null,
      opportunity: null,
      briefing: null,
      assetBlueprint: null,
      clientStatusLabel: "New",
    });
    const second = buildDiscussionWorkflowSteps({
      analysis: null,
      opportunity: null,
      briefing: null,
      assetBlueprint: null,
      clientStatusLabel: "Qualified",
    });

    assert.equal(first[first.length - 1].label, "Current Status: New");
    assert.equal(second[second.length - 1].label, "Current Status: Qualified");
  });

  it("Discussion and Prospect pages pass client-controlled status into workflow", () => {
    const discussionPage = readFileSync(
      join(ROOT, "app/discussions/[id]/page.tsx"),
      "utf8",
    );
    const prospectPage = readFileSync(
      join(ROOT, "app/prospects/[id]/page.tsx"),
      "utf8",
    );

    assert.match(discussionPage, /clientStatusLabel:\s*discussion\.status/);
    assert.match(prospectPage, /clientStatusLabel:\s*lifecycleStatus/);
    assert.doesNotMatch(
      prospectPage,
      /clientStatusLabel:\s*(?:prospect\.status|intelligenceReadiness)/,
    );
  });
});

describe("Sprint 2A — WhatsApp number field", () => {
  it("migration adds nullable whatsapp_number and asset interactions table", () => {
    const migration = readFileSync(
      join(
        ROOT,
        "supabase/migrations/20260717000001_prospect_whatsapp_and_asset_interactions.sql",
      ),
      "utf8",
    );
    assert.match(migration, /whatsapp_number text/);
    assert.match(migration, /athena_asset_interactions/);
    assert.match(migration, /Optional WhatsApp contact number/);
  });

  it("CSV aliases map to whatsapp_number without treating it as a duplicate key", () => {
    const rows = parseProspectCsv(
      "business_name,phone,whatsapp_phone\nAcme,+1-312-555-0100,+1 (312) 555-0199\n",
    );
    assert.equal(rows.length, 1);
    assert.equal(rows[0].phone, "+1-312-555-0100");
    assert.equal(rows[0].whatsapp_number, "+1 (312) 555-0199");

    const aliasRows = parseProspectCsv(
      "company_name,wa_number\nBeta,+15551234567\n",
    );
    assert.equal(aliasRows[0].whatsapp_number, "+15551234567");
  });

  it("template includes WhatsApp Number near Phone", () => {
    const template = readFileSync(
      join(ROOT, "public/templates/athena-prospect-import-template.csv"),
      "utf8",
    );
    assert.match(template, /Phone,WhatsApp Number/);
  });

  it("Manual Import and Details UI include WhatsApp Number", () => {
    const importForms = readFileSync(
      join(ROOT, "components/prospects/ProspectImportForms.tsx"),
      "utf8",
    );
    const details = readFileSync(
      join(ROOT, "components/prospects/ProspectMetadataEditor.tsx"),
      "utf8",
    );
    assert.match(importForms, /whatsapp_number/);
    assert.match(importForms, /WhatsApp Number/);
    assert.match(details, /whatsapp_number/);
    assert.match(details, /Open WhatsApp/);
  });

  it("wa.me normalization keeps stored value independent and rejects unusable values", () => {
    assert.equal(
      buildWhatsAppMeUrl("+1 (312) 555-0199"),
      "https://wa.me/13125550199",
    );
    assert.equal(buildWhatsAppMeUrl("   "), null);
    assert.equal(buildWhatsAppMeUrl("abc"), null);
    assert.equal(buildWhatsAppMeUrl("123"), null);
  });

  it("normalized executive input includes WhatsApp when present and keeps phone separate", () => {
    const normalized = normalizeProspectExecutiveInput({
      business_name: "Acme",
      website: "https://acme.com",
      phone: "+1-312-555-0100",
      whatsapp_number: "+1 (312) 555-0199",
    } as never);
    const factual = formatNormalizedProspectInputForPipeline(normalized);
    assert.match(factual, /Phone: \+1-312-555-0100/);
    assert.match(factual, /WhatsApp: \+1 \(312\) 555-0199/);
  });
});

describe("Sprint 2A — WhatsApp Outreach deployment asset", () => {
  it("parses WHATSAPP_OUTREACH with INITIAL MESSAGE and FOLLOW-UP content", () => {
    const assets = buildDiscussionDeploymentAssets({
      id: "a1",
      organization_id: "o1",
      discussion_id: "d1",
      community_id: null,
      created_at: "2026-07-13T00:00:00.000Z",
      updated_at: "2026-07-13T00:00:00.000Z",
      suggested_cta: [
        "PERSONALIZED_OUTREACH_EMAIL:",
        "Subject: Hello",
        "",
        "WHATSAPP_OUTREACH:",
        "INITIAL MESSAGE",
        "Hi Jordan — noticed your spring consult offer.",
        "",
        "FOLLOW-UP",
        "Quick bump in case this got buried.",
        "",
        "RECOMMENDED_CTA:",
        "Book a call",
      ].join("\n"),
      raw_json: null,
    } as never);

    const whatsapp = assets.find((asset) => asset.title === "WhatsApp Outreach");
    assert.ok(whatsapp);
    assert.equal(whatsapp?.assetKey, "whatsapp_outreach");
    assert.match(whatsapp?.content ?? "", /INITIAL MESSAGE/);
    assert.match(whatsapp?.content ?? "", /FOLLOW-UP/);
    assert.match(whatsapp?.content ?? "", /Hi Jordan/);
    assert.ok(
      assets.some((asset) => asset.title === "Personalized Outreach Email"),
    );
    assert.ok(assets.some((asset) => asset.title === "Recommended CTA"));
  });

  it("missing WhatsApp Outreach does not hide other assets", () => {
    const assets = buildDiscussionDeploymentAssets({
      id: "a1",
      organization_id: "o1",
      discussion_id: "d1",
      community_id: null,
      created_at: "2026-07-13T00:00:00.000Z",
      updated_at: "2026-07-13T00:00:00.000Z",
      suggested_cta:
        "PERSONALIZED_OUTREACH_EMAIL:\nHello\n\nRECOMMENDED_CTA:\nBook a call",
      raw_json: null,
    } as never);

    assert.equal(assets.length, 2);
    assert.ok(!assets.some((asset) => asset.title === "WhatsApp Outreach"));
  });

  it("Discussion assets remain unaffected by WhatsApp Outreach label", () => {
    const assets = buildDiscussionDeploymentAssets({
      id: "a1",
      organization_id: "o1",
      discussion_id: "d1",
      community_id: null,
      created_at: "2026-07-13T00:00:00.000Z",
      updated_at: "2026-07-13T00:00:00.000Z",
      suggested_cta:
        "COMMUNITY_REPLY:\nHi\n\nFOLLOW_UP:\nFollowing up\n\nCALL_TO_ACTION:\nCTA",
      raw_json: null,
    } as never);

    assert.equal(assets.length, 3);
    assert.ok(!assets.some((asset) => asset.title === "WhatsApp Outreach"));
  });

  it("Prospect Gemini deployment contract requires WhatsApp Outreach without email formatting leaks", () => {
    const assembly = readFileSync(
      join(
        ROOT,
        "services/brain/generationContracts/deploymentAssetsPromptAssembly.ts",
      ),
      "utf8",
    );
    const constraints = readFileSync(
      join(ROOT, "services/ai/prompts/prospectDeploymentAssetsConstraints.ts"),
      "utf8",
    );

    assert.match(assembly, /WHATSAPP_OUTREACH_GENERATION_RULES/);
    assert.match(assembly, /WHATSAPP_OUTREACH:/);
    assert.match(assembly, /PROSPECT_INTELLIGENCE_PLATFORM/);
    assert.match(constraints, /"WHATSAPP_OUTREACH"/);
    assert.match(WHATSAPP_OUTREACH_GENERATION_RULES, /Feel native to WhatsApp, not email/);
    assert.match(WHATSAPP_OUTREACH_GENERATION_RULES, /No subject line/);
    assert.match(WHATSAPP_OUTREACH_GENERATION_RULES, /No formal email salutation/);
    assert.match(WHATSAPP_OUTREACH_GENERATION_RULES, /INITIAL MESSAGE/);
    assert.match(WHATSAPP_OUTREACH_GENERATION_RULES, /FOLLOW-UP/);
  });

  it("Current and Historical Versions keep independent WhatsApp content via parsing snapshots", () => {
    const current = buildDiscussionDeploymentAssets({
      suggested_cta:
        "WHATSAPP_OUTREACH:\nINITIAL MESSAGE\nCurrent version message\n\nFOLLOW-UP\nCurrent follow-up",
    } as never);
    const historical = buildDiscussionDeploymentAssets({
      suggested_cta:
        "WHATSAPP_OUTREACH:\nINITIAL MESSAGE\nHistorical version message\n\nFOLLOW-UP\nHistorical follow-up",
    } as never);

    assert.match(current[0].content, /Current version message/);
    assert.match(historical[0].content, /Historical version message/);
    assert.ok(!current[0].content.includes("Historical version message"));
    assert.ok(!historical[0].content.includes("Current version message"));
  });
});

describe("Sprint 2A — Copy Done traceability", () => {
  it("defines stable canonical asset keys for deployment and blueprint assets", () => {
    assert.equal(
      canonicalDeploymentAssetType("WHATSAPP_OUTREACH"),
      "whatsapp_outreach",
    );
    assert.equal(
      canonicalDeploymentAssetType("PERSONALIZED_OUTREACH_EMAIL"),
      "email_outreach",
    );
    assert.equal(
      canonicalDeploymentAssetType("COMMUNITY_REPLY"),
      "community_reply",
    );
    assert.ok(isSupportedAssetInteractionType("whatsapp_outreach"));
    assert.ok(
      isSupportedAssetInteractionType(BLUEPRINT_ASSET_TYPES.image_prompt),
    );
    assert.equal(isSupportedAssetInteractionType("not_a_real_asset"), false);
  });

  it("scopes live/legacy assets with a deterministic sentinel version id", () => {
    assert.equal(
      resolveExecutiveVersionScopeId(null),
      LIVE_EXECUTIVE_VERSION_SENTINEL,
    );
    assert.equal(
      resolveExecutiveVersionScopeId("version-123"),
      "version-123",
    );
  });

  it("CopyButton records Done only after clipboard success and API persistence", () => {
    const source = readFileSync(
      join(ROOT, "components/deployment/CopyButton.tsx"),
      "utf8",
    );
    assert.match(source, /navigator\.clipboard\.writeText/);
    assert.match(source, /\/api\/asset-interactions/);
    assert.match(source, /setDone\(true\)/);
    assert.match(source, /Copied/);
    assert.match(source, /\bDone\b/);
    assert.match(source, /persistence_failed|persistence_error/);
  });

  it("workspace loads Done state per source and selected Executive Version", () => {
    const workspace = readFileSync(
      join(ROOT, "components/discussions/ExecutiveIntelligenceWorkspace.tsx"),
      "utf8",
    );
    const prospectPage = readFileSync(
      join(ROOT, "app/prospects/[id]/page.tsx"),
      "utf8",
    );

    assert.match(workspace, /prospectId/);
    assert.match(workspace, /\/api\/asset-interactions/);
    assert.match(workspace, /doneByAssetType/);
    assert.match(workspace, /copyContext/);
    assert.match(prospectPage, /prospectId=\{prospect\.id\}/);
  });

  it("Deployment Assets and Strategic Blueprint both receive copy tracking", () => {
    const deployment = readFileSync(
      join(ROOT, "components/deployment/DeploymentAssets.tsx"),
      "utf8",
    );
    const blueprint = readFileSync(
      join(ROOT, "components/assetBlueprints/StrategicAssetBlueprint.tsx"),
      "utf8",
    );
    assert.match(deployment, /copyContext/);
    assert.match(deployment, /doneByAssetType/);
    assert.match(blueprint, /blueprint_image_prompt|BLUEPRINT_ASSET_TYPES/);
    assert.match(blueprint, /copyContext/);
  });
});
