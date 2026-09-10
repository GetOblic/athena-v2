/**
 * Identity Knowledge Score — deterministic completeness, header, and CTA contracts.
 */

import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, it } from "node:test";
import { IdentityKnowledgeScore } from "../../components/identity/IdentityKnowledgeScore";
import { IdentityPageHeader } from "../../components/identity/IdentityPageHeader";
import { IdentityWebsiteKnowledge } from "../../components/identity/IdentityWebsiteKnowledge";
import { de } from "../../lib/tenantI18n/messages/de";
import { en } from "../../lib/tenantI18n/messages/en";
import { es } from "../../lib/tenantI18n/messages/es";
import { fr } from "../../lib/tenantI18n/messages/fr";
import { it as itMessages } from "../../lib/tenantI18n/messages/it";
import { pt } from "../../lib/tenantI18n/messages/pt";
import type { TenantMessages } from "../../lib/tenantI18n/types";
import {
  computeIdentityKnowledgeScore,
  identityKnowledgeScoreBand,
  isMeaningfullyPopulated,
} from "../../services/identity/identityKnowledgeScore";
import type { AthenaIdentity } from "../../services/identity/identityService";
import { DEEP_WEBSITE_INTELLIGENCE_PROVIDER } from "../../services/websiteLearning/deepScrape/deepWebsiteIntelligence";
import { ORGANIZATION_LANGUAGES } from "../../services/organizationLanguage";

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

const SCORE_KEYS = [
  "knowledgeScore",
  "brainCompletion",
  "knowledgeScoreLow",
  "knowledgeScoreMedium",
  "knowledgeScoreStrong",
  "knowledgeScoreExcellent",
] as const;

function sampleIdentity(
  overrides: Partial<AthenaIdentity> = {},
): AthenaIdentity {
  return {
    id: "id-1",
    user_id: "user-1",
    organization_id: "org-1",
    greeting_name: "Laurent",
    about_you: "voice",
    expertise: "knowledge",
    website: "https://example.com",
    brain_status: "ready",
    brain_last_updated: "2026-08-31T12:00:00.000Z",
    master_profile: {
      homepage_learning: "Homepage copy Athena learned.",
      executive_intelligence: {
        executive_summary: "A clinic serving local clients.",
        confidence_level: "strong",
        confidence_reasons: ["clear voice"],
        voice_alignment: "strong",
        business_knowledge_coverage: "developing",
        website_evidence_coverage: "limited",
        business_model: {
          business_overview: "Medical aesthetics clinic",
          geographic_reach: "Local city",
        },
        hidden_signals: [],
        calibration_gaps: [
          {
            what_is_unclear: "Offer priority",
            why_it_matters: "Downstream assets may drift",
            update_location: "Your Voice",
          },
        ],
      },
    },
    master_profile_version: "1",
    master_profile_generated_at: "2026-08-31T12:00:00.000Z",
    created_at: "2026-08-01T00:00:00.000Z",
    updated_at: "2026-08-31T12:00:00.000Z",
    ...overrides,
  };
}

function completeIdentity(): AthenaIdentity {
  return sampleIdentity({
    about_you:
      "Warm consultative voice that teaches before selling and stays professional.",
    expertise:
      "Five-step clinic methodology covering consult, theory, practice, supervision, launch.",
    master_profile: {
      homepage_learning: "Homepage copy Athena learned during training.",
      executive_intelligence: {
        executive_summary: "A clinic serving local clients.",
        confidence_level: "strong",
        confidence_reasons: ["clear voice"],
        voice_alignment: "strong",
        business_knowledge_coverage: "strong",
        website_evidence_coverage: "strong",
        business_model: {
          business_overview: "Medical aesthetics clinic",
          primary_audience: "Adult clients seeking skin treatments",
          products_and_services: "Consults, treatments, and educator training",
          positioning: "Education-led clinical care",
          value_proposition: "Safer outcomes through taught technique",
          communication_style: "Warm, precise, and professional",
        },
        hidden_signals: [],
        calibration_gaps: [],
      },
    },
    website_intelligence: {
      provider: DEEP_WEBSITE_INTELLIGENCE_PROVIDER,
      url: "https://example.com",
      pages_analyzed: 8,
      business_knowledge: { about: "Clinic story and method." },
    },
  });
}

const COMPLETE_BRAND = {
  brand_logo_storage_path: "org/logo.png",
  brand_profile_picture_storage_path: "org/profile.png",
  brand_primary_color: "#FF6600",
  brand_font: "geist",
};

describe("Identity Knowledge Score", () => {
  it("is deterministic, bounded, and never hardcodes 68%", () => {
    const first = computeIdentityKnowledgeScore({
      identity: sampleIdentity(),
    });
    const second = computeIdentityKnowledgeScore({
      identity: sampleIdentity(),
    });
    assert.equal(first.score, second.score);
    assert.equal(
      computeIdentityKnowledgeScore({ identity: sampleIdentity() }).score,
      first.score,
    );
    assert.ok(first.score >= 0 && first.score <= 100);
    assert.notEqual(first.score, 68);

    const scoreSource = read("services/identity/identityKnowledgeScore.ts");
    const card = read("components/identity/IdentityKnowledgeScore.tsx");
    const header = read("components/identity/IdentityPageHeader.tsx");
    for (const source of [scoreSource, card, header]) {
      assert.doesNotMatch(source, /\b68\b/);
      assert.doesNotMatch(source, /openai|anthropic|generateReview|fetch\(/i);
      assert.doesNotMatch(source, /computeBrainCompletenessScore/);
    }
  });

  it("scores empty brains lower than partial and complete brains", () => {
    const empty = computeIdentityKnowledgeScore({ identity: null });
    const minimal = computeIdentityKnowledgeScore({
      identity: sampleIdentity({
        about_you: "",
        expertise: "",
        website: "",
        brain_status: "pending",
        brain_last_updated: null,
        master_profile: null,
        master_profile_generated_at: null,
        website_intelligence: null,
      }),
    });
    const partial = computeIdentityKnowledgeScore({
      identity: sampleIdentity(),
    });
    const complete = computeIdentityKnowledgeScore({
      identity: completeIdentity(),
      brand: COMPLETE_BRAND,
    });

    assert.equal(empty.score, 0);
    assert.equal(minimal.score, 0);
    assert.ok(partial.score > minimal.score);
    assert.ok(complete.score > partial.score);
    assert.equal(complete.score, 100);
    assert.equal(identityKnowledgeScoreBand(empty.score), "knowledgeScoreLow");
    assert.equal(
      identityKnowledgeScoreBand(complete.score),
      "knowledgeScoreExcellent",
    );
  });

  it("does not award points for whitespace or trivial placeholders", () => {
    assert.equal(isMeaningfullyPopulated("  "), false);
    assert.equal(isMeaningfullyPopulated("n/a"), false);
    assert.equal(isMeaningfullyPopulated("-"), false);
    assert.equal(isMeaningfullyPopulated("todo"), false);
    assert.equal(isMeaningfullyPopulated("Medical aesthetics clinic"), true);

    const placeholders = computeIdentityKnowledgeScore({
      identity: sampleIdentity({
        about_you: "n/a",
        expertise: " TBD ",
        website: "",
        master_profile: null,
      }),
    });
    assert.equal(placeholders.score, 0);
  });

  it("does not require Deep Scrape when homepage learning already exists", () => {
    const homepageOnly = computeIdentityKnowledgeScore({
      identity: sampleIdentity({
        website_intelligence: null,
        last_deep_scrape_at: null,
        last_deep_scrape_pages: null,
      }),
    });
    const withDeep = computeIdentityKnowledgeScore({
      identity: sampleIdentity({
        website_intelligence: {
          provider: DEEP_WEBSITE_INTELLIGENCE_PROVIDER,
          url: "https://example.com",
          pages_analyzed: 6,
          business_knowledge: { about: "Clinic" },
        },
      }),
    });
    assert.ok(homepageOnly.breakdown.website > 0);
    assert.ok(withDeep.score > homepageOnly.score);
    assert.equal(homepageOnly.breakdown.website, 0.8);
    assert.equal(withDeep.breakdown.website, 1);
  });

  it("treats calibration as boolean coverage and ignores LLM confidence labels", () => {
    const withGaps = computeIdentityKnowledgeScore({
      identity: sampleIdentity(),
    });
    const noGaps = computeIdentityKnowledgeScore({
      identity: sampleIdentity({
        master_profile: {
          homepage_learning: "Homepage copy Athena learned.",
          executive_intelligence: {
            executive_summary: "A clinic serving local clients.",
            confidence_level: "limited",
            confidence_reasons: ["weak"],
            voice_alignment: "limited",
            business_knowledge_coverage: "limited",
            website_evidence_coverage: "limited",
            business_model: {
              business_overview: "Medical aesthetics clinic",
            },
            hidden_signals: [],
            calibration_gaps: [],
          },
        },
      }),
    });
    assert.equal(withGaps.breakdown.calibration, 0);
    assert.equal(noGaps.breakdown.calibration, 1);
    assert.ok(noGaps.score > withGaps.score);
  });

  it("renders Knowledge Score in the /identity header", () => {
    const scored = computeIdentityKnowledgeScore({
      identity: sampleIdentity(),
    });
    const html = renderToStaticMarkup(
      createElement(IdentityPageHeader, {
        eyebrow: en.identity.eyebrow,
        title: en.identity.title,
        subtitle: en.identity.subtitle,
        statusLabel: en.identity.status,
        statusValue: "Ready",
        lastTrainedLabel: en.identity.lastTrained,
        lastTrainedValue: "Aug 31",
        knowledgeScore: createElement(IdentityKnowledgeScore, {
          score: scored.score,
          messages: en.identity,
        }),
      }),
    );
    assert.match(html, /Knowledge Score/);
    assert.match(html, new RegExp(`${scored.score}%`));
    assert.match(html, /conic-gradient/);
    assert.doesNotMatch(html, />68%</);
    assert.match(
      html,
      /Your business brain is /,
    );

    const page = read("app/identity/page.tsx");
    assert.match(page, /<IdentityKnowledgeScore/);
    assert.match(page, /computeIdentityKnowledgeScore/);
    assert.doesNotMatch(page, /computeBrainCompletenessScore/);
    assert.doesNotMatch(page, /\b68\b/);
  });

  it("exposes Website Knowledge CTAs on the collapsed header without a second mutation", () => {
    const html = renderToStaticMarkup(
      createElement(IdentityWebsiteKnowledge, {
        identity: sampleIdentity(),
        messages: en.identity,
        language: "en",
        trained: true,
        deepScrape: createElement(
          "button",
          { type: "button" },
          "Deep Scrape Website",
        ),
      }),
    );
    assert.match(html, /id="identity-website-knowledge"/);
    assert.match(html, /aria-expanded="false"/);
    assert.match(html, /Deep Scrape Website/);
    assert.match(html, /href="#identity-teach"/);
    assert.match(html, /href="#identity-teach"[^>]*>[\s\S]*?Retrain Athena/);
    assert.equal((html.match(/Deep Scrape Website/g) ?? []).length, 1);
    assert.equal((html.match(/href="#identity-teach"/g) ?? []).length, 1);

    const website = read("components/identity/IdentityWebsiteKnowledge.tsx");
    const page = read("app/identity/page.tsx");
    const deep = read("components/identity/DeepScrapeWebsiteButton.tsx");
    const collapsible = read("components/ui/AthenaCollapsibleSection.tsx");
    assert.match(website, /headerActions/);
    assert.match(website, /\{deepScrape\}/);
    assert.match(website, /IDENTITY_FIELD_ANCHORS\.teach/);
    assert.doesNotMatch(website, /upsertAthenaIdentity|saveIdentity|fetch\(/);
    assert.equal((page.match(/<DeepScrapeWebsiteButton/g) ?? []).length, 1);
    assert.match(page, /variant="compact"/);
    assert.match(deep, /\/api\/identity\/deep-scrape/);
    assert.match(collapsible, /headerActions\?: ReactNode/);
    assert.match(collapsible, /event\.stopPropagation\(\)/);
    assert.match(collapsible, /hasHeaderActions \? null : chevron/);
    assert.doesNotMatch(collapsible, /websiteKnowledge|DeepScrape|retrainAthena/);
  });

  it("keeps required Knowledge Score strings in all six locales", () => {
    for (const language of ORGANIZATION_LANGUAGES) {
      const copy = DICTIONARIES[language].identity;
      for (const key of SCORE_KEYS) {
        assert.equal(typeof copy[key], "string", `${language}.${key}`);
        assert.ok(copy[key].trim(), `${language}.${key} empty`);
      }
      assert.match(copy.brainCompletion, /\{percent\}/);
    }
    for (const language of ORGANIZATION_LANGUAGES.filter((code) => code !== "en")) {
      const copy = DICTIONARIES[language].identity;
      for (const key of SCORE_KEYS) {
        assert.notEqual(copy[key], en.identity[key], `${language}.${key}`);
      }
    }
  });
});
