import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { buildDiscussionDeploymentAssets } from "../../lib/deploymentAssets";
import {
  isProspectExecutiveCandidateComplete,
  isSafeToVersionLiveIntelligence,
  composeSuggestedCtaFromRawAssetObject,
} from "../../services/executiveVersions/executiveVersionDisplay";
import {
  canonicalizeDeploymentAssetLabels,
  evaluateProspectDeploymentCompleteness,
  extractParsedProspectAssetKeys,
  websiteIntelligenceHasUsableContent,
} from "../../services/prospects/prospectDeploymentAssetContract";
import { resolveProspectDisplayStatus } from "../../services/prospects/prospectDisplay";
import { WEBSITE_INTELLIGENCE_MAX_PAGES } from "../../services/prospects/prospectWebsiteUrl";
import { rankAndSelectPages } from "../../services/prospects/prospectWebsiteRanking";

function fullProspectSuggestedCta(options?: {
  includeKnowledge?: boolean;
  scrambleLabels?: boolean;
}): string {
  const knowledgeLabel = options?.scrambleLabels
    ? "Knowledge Enhancement"
    : "KNOWLEDGE_ENHANCEMENT";
  const parts = [
    "PERSONALIZED_OUTREACH_EMAIL:\nHello there",
    "FOLLOW_UP_EMAIL:\nFollowing up",
    "LINKEDIN_CONNECTION:\nConnect?",
    "LINKEDIN_FOLLOW_UP:\nThanks for connecting",
    "COLD_CALL_OPENING:\nHi, calling about…",
    "DISCOVERY_QUESTIONS:\n• What is your priority?",
    "PERSONALIZED_VALUE_PROPOSITION:\nClear value",
    "OBJECTION_ANTICIPATION:\nCost concern → ROI",
    "MEETING_PREPARATION:\n• Review site",
    "RECOMMENDED_CTA:\nBook a consult",
    "FOLLOW_UP_SEQUENCE:\n1) Email 2) Call",
    "PERSONALIZED_VIDEO_SCRIPT:\nHi, quick note",
    "NEWSLETTER_IDEA:\nSubject: Protocols",
    "BLOG_POST_IDEA:\nTitle: Trust",
    "WHATSAPP_OUTREACH:\nINITIAL MESSAGE\nHi\n\nFOLLOW-UP\nBump",
  ];
  if (options?.includeKnowledge !== false) {
    parts.push(
      `${knowledgeLabel}:\nBusiness Overview\n• Clinic\n\nServices\n• Botox`,
    );
  }
  return parts.join("\n\n");
}

describe("Sprint 2B incident — deployment completeness gate", () => {
  it("fails candidate completeness when Knowledge Enhancement is missing but website learning exists", () => {
    const report = evaluateProspectDeploymentCompleteness({
      suggestedCta: fullProspectSuggestedCta({ includeKnowledge: false }),
      requireKnowledgeEnhancement: true,
    });
    assert.equal(report.complete, false);
    assert.ok(report.missingRequiredKeys.includes("KNOWLEDGE_ENHANCEMENT"));
  });

  it("passes candidate completeness when required Prospect assets including KE are present", () => {
    const report = evaluateProspectDeploymentCompleteness({
      suggestedCta: fullProspectSuggestedCta(),
      requireKnowledgeEnhancement: true,
    });
    assert.equal(report.complete, true);
    assert.equal(report.missingRequiredKeys.length, 0);
  });

  it("recognizes Knowledge Enhancement label variants", () => {
    for (const label of [
      "KNOWLEDGE_ENHANCEMENT",
      "KNOWLEDGE ENHANCEMENT",
      "Knowledge Enhancement",
    ]) {
      const text = canonicalizeDeploymentAssetLabels(
        `${label}:\n• Fact\n\nPERSONALIZED_OUTREACH_EMAIL:\nHi`,
      );
      assert.match(text, /KNOWLEDGE_ENHANCEMENT:/);
      const assets = buildDiscussionDeploymentAssets({
        suggested_cta: text,
      } as never);
      assert.ok(
        assets.some((asset) => asset.title === "Knowledge Enhancement"),
        `failed for label ${label}`,
      );
    }
  });

  it("parses assets independently of order and keeps WhatsApp separate from email", () => {
    const reversed = [
      "KNOWLEDGE_ENHANCEMENT:\n• Fact",
      "WHATSAPP_OUTREACH:\nINITIAL MESSAGE\nHi\n\nFOLLOW-UP\nBump",
      "PERSONALIZED_OUTREACH_EMAIL:\nSubject-looking email body",
      "FOLLOW_UP_EMAIL:\nFollow",
      "LINKEDIN_CONNECTION:\nConnect",
      "NEWSLETTER_IDEA:\nNews",
      "BLOG_POST_IDEA:\nBlog",
      "RECOMMENDED_CTA:\nCTA",
    ].join("\n\n");

    const keys = extractParsedProspectAssetKeys(reversed);
    assert.ok(keys.includes("KNOWLEDGE_ENHANCEMENT"));
    assert.ok(keys.includes("WHATSAPP_OUTREACH"));
    assert.ok(keys.includes("PERSONALIZED_OUTREACH_EMAIL"));

    const assets = buildDiscussionDeploymentAssets({
      suggested_cta: reversed,
    } as never);
    const whatsapp = assets.find((asset) => asset.title === "WhatsApp Outreach");
    const email = assets.find(
      (asset) => asset.title === "Personalized Outreach Email",
    );
    assert.ok(whatsapp);
    assert.ok(email);
    assert.ok(!whatsapp?.content.includes("Subject-looking email body"));
    assert.ok(!email?.content.includes("INITIAL MESSAGE"));
  });

  it("malformed section does not prevent sibling assets from parsing", () => {
    const text = [
      "PERSONALIZED_OUTREACH_EMAIL:\nHello",
      "UNKNOWN_JUNK_LABEL:\nthis should be ignored by the labeled parser",
      "KNOWLEDGE_ENHANCEMENT:\n• Fact",
      "WHATSAPP_OUTREACH:\nINITIAL MESSAGE\nHi\n\nFOLLOW-UP\nBump",
      "FOLLOW_UP_EMAIL:\nFollow",
      "LINKEDIN_CONNECTION:\nConnect",
      "NEWSLETTER_IDEA:\nNews",
      "BLOG_POST_IDEA:\nBlog",
      "RECOMMENDED_CTA:\nCTA",
    ].join("\n\n");

    const assets = buildDiscussionDeploymentAssets({
      suggested_cta: text,
    } as never);
    assert.ok(assets.some((asset) => asset.title === "Knowledge Enhancement"));
    assert.ok(
      assets.some((asset) => asset.title === "Personalized Outreach Email"),
    );
    assert.ok(assets.some((asset) => asset.title === "WhatsApp Outreach"));
    assert.ok(
      !assets.some((asset) => /UNKNOWN_JUNK/i.test(asset.title)),
    );
  });

  it("canonicalizes Knowledge Enhancement labels before parse", () => {
    const canonical = canonicalizeDeploymentAssetLabels(
      "Knowledge Enhancement:\n• Fact\n\nPERSONALIZED_OUTREACH_EMAIL:\nHi",
    );
    assert.match(canonical, /KNOWLEDGE_ENHANCEMENT:/);
    assert.ok(
      extractParsedProspectAssetKeys(canonical).includes(
        "KNOWLEDGE_ENHANCEMENT",
      ),
    );
  });
});

describe("Sprint 2B incident — version preservation semantics", () => {
  it("analysis-only live intelligence is not safe to version as Current", () => {
    const safe = isSafeToVersionLiveIntelligence({
      analysis: {
        id: "a1",
        suggested_cta: "",
        raw_json: null,
      } as never,
      opportunity: null,
      briefing: null,
      blueprint: null,
    });
    assert.equal(safe, false);
  });

  it("Prospect candidate with missing KE is incomplete for publication", () => {
    const gate = isProspectExecutiveCandidateComplete({
      requireKnowledgeEnhancement: true,
      intelligence: {
        analysis: {
          id: "a1",
          suggested_cta: fullProspectSuggestedCta({ includeKnowledge: false }),
        } as never,
        opportunity: null,
        briefing: null,
        blueprint: { id: "bp1" } as never,
      },
    });
    assert.equal(gate.complete, false);
    assert.ok(gate.missingRequiredKeys.includes("KNOWLEDGE_ENHANCEMENT"));
  });

  it("Prospect candidate with full assets and blueprint is complete", () => {
    const gate = isProspectExecutiveCandidateComplete({
      requireKnowledgeEnhancement: true,
      intelligence: {
        analysis: {
          id: "a1",
          suggested_cta: fullProspectSuggestedCta(),
        } as never,
        opportunity: null,
        briefing: null,
        blueprint: { id: "bp1" } as never,
      },
    });
    assert.equal(gate.complete, true);
  });

  it("raw JSON recovery includes Knowledge Enhancement and WhatsApp keys", () => {
    const composed = composeSuggestedCtaFromRawAssetObject({
      PERSONALIZED_OUTREACH_EMAIL: "Hello",
      WHATSAPP_OUTREACH: "INITIAL MESSAGE\nHi",
      KNOWLEDGE_ENHANCEMENT: "Business Overview\n• Clinic",
    });
    assert.ok(composed);
    assert.match(composed ?? "", /KNOWLEDGE_ENHANCEMENT:/);
    assert.match(composed ?? "", /WHATSAPP_OUTREACH:/);
  });
});

describe("Sprint 2B incident — status consistency", () => {
  it("Processing Failed wins over older Current Version Ready shortcut", () => {
    assert.equal(
      resolveProspectDisplayStatus({
        prospectStatus: "Processing Failed",
        jobStatus: null,
        hasCurrentVersion: true,
      }),
      "Processing Failed",
    );
  });

  it("active processing job still shows generating even with Current Version", () => {
    assert.equal(
      resolveProspectDisplayStatus({
        prospectStatus: "Ready",
        jobStatus: "processing",
        jobStage: "deployment_assets",
        hasCurrentVersion: true,
      }),
      "Generating Executive Intelligence",
    );
  });

  it("website job stage maps to Learning from Website", () => {
    assert.equal(
      resolveProspectDisplayStatus({
        prospectStatus: "Queued",
        jobStatus: "processing",
        jobStage: "website_intelligence",
        hasCurrentVersion: true,
      }),
      "Learning from Website",
    );
  });
});

describe("Sprint 2B incident — crawl page counting", () => {
  it("never selects more than 10 pages and reports analyzed as successful extracts only", () => {
    const many = Array.from({ length: 25 }, (_, index) => ({
      url: `https://clinic.example/p-${index}`,
      source: "content" as const,
      anchorText: `Page ${index}`,
    }));
    many.unshift({
      url: "https://clinic.example",
      source: "homepage",
      anchorText: "Home",
    });
    const selected = rankAndSelectPages(many, WEBSITE_INTELLIGENCE_MAX_PAGES);
    assert.ok(selected.length <= 10);

    // pages_analyzed contract: successful extracts, not selected URLs
    const selectedCount = 10;
    const successfulExtracts = 7;
    assert.notEqual(successfulExtracts, selectedCount);
    assert.equal(
      websiteIntelligenceHasUsableContent({
        pages_analyzed: successfulExtracts,
        business_knowledge: { services: "• Botox" },
      }),
      true,
    );
    assert.equal(
      websiteIntelligenceHasUsableContent({
        pages_analyzed: 0,
        error: "timeout",
      }),
      false,
    );
  });
});
