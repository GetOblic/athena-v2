/**
 * Identity Executive Intelligence — contract, lifecycle wiring, coverage safety.
 */

import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, it } from "node:test";
import {
  attachIdentityExecutiveIntelligence,
  buildIdentityWebsiteCoverageView,
  buildIdentityWebsiteSourcePages,
  normalizeIdentityExecutiveIntelligence,
  readIdentityExecutiveIntelligence,
} from "../../services/identity/identityExecutiveIntelligence";
import { DEEP_WEBSITE_INTELLIGENCE_PROVIDER } from "../../services/websiteLearning/deepScrape/deepWebsiteIntelligence";

const ROOT = join(process.cwd());

function read(relativePath: string): string {
  return readFileSync(join(ROOT, relativePath), "utf8");
}

const SAMPLE_EI = {
  executive_summary:
    "A boutique aesthetics clinic serving local clients with consultative care.",
  confidence_level: "developing",
  confidence_reasons: [
    "clear service positioning",
    "limited pricing information",
  ],
  voice_alignment: "strong",
  business_knowledge_coverage: "developing",
  website_evidence_coverage: "limited",
  business_model: {
    business_overview: "Medical aesthetics clinic",
    primary_audience: "Adult clients seeking skin treatments",
    products_and_services: "",
  },
  hidden_signals: [
    {
      finding: "Training curriculum is stronger than homepage emphasis suggests",
      why_it_matters: "Outreach may underplay education as a growth channel",
    },
  ],
  calibration_gaps: [
    {
      what_is_unclear: "Primary offer priority between training and treatments",
      why_it_matters: "Downstream assets may emphasize the wrong offer",
      update_location: "Your Business Knowledge",
    },
  ],
};

describe("Identity Executive Intelligence — contract", () => {
  it("normalizes a complete executive_intelligence payload", () => {
    const normalized = normalizeIdentityExecutiveIntelligence(SAMPLE_EI);
    assert.ok(normalized);
    assert.match(normalized!.executive_summary, /aesthetics clinic/i);
    assert.equal(normalized!.confidence_level, "developing");
    assert.equal(normalized!.hidden_signals.length, 1);
    assert.equal(
      normalized!.calibration_gaps[0]?.update_location,
      "Your Business Knowledge",
    );
    assert.equal(normalized!.business_model.products_and_services, undefined);
  });

  it("rejects incomplete intelligence without executive_summary", () => {
    assert.equal(
      normalizeIdentityExecutiveIntelligence({ confidence_level: "strong" }),
      null,
    );
  });

  it("preserves previous EI when the new payload is incomplete", () => {
    const previous = {
      executive_intelligence: SAMPLE_EI,
      voice: { summary: "old" },
    };
    const attached = attachIdentityExecutiveIntelligence({
      masterProfile: { voice: { summary: "new" }, executive_intelligence: {} },
      previousMasterProfile: previous,
    });
    assert.equal(attached.preservedPrevious, true);
    assert.ok(attached.executiveIntelligence);
    assert.match(
      attached.executiveIntelligence!.executive_summary,
      /aesthetics clinic/i,
    );
  });

  it("reads EI from master_profile safely when missing", () => {
    assert.equal(readIdentityExecutiveIntelligence(null), null);
    assert.equal(readIdentityExecutiveIntelligence({ voice: {} }), null);
  });
});

describe("Identity Executive Intelligence — generation lifecycle wiring", () => {
  it("1) initial Brain creation compiles via compileMasterIdentityProfile", () => {
    const service = read("services/identity/identityService.ts");
    assert.match(service, /upsertAthenaIdentity/);
    assert.match(service, /return compileMasterIdentityProfile\(data/);
    assert.match(service, /attachIdentityExecutiveIntelligence/);
    assert.match(service, /generationKind:\s*["']identity_profile["']/);
  });

  it("2) Update/Train Athena refreshes through the same compile path", () => {
    const page = read("app/identity/page.tsx");
    assert.match(page, /upsertAthenaIdentity/);
    assert.match(page, /TrainAthenaSubmitButton/);
    assert.doesNotMatch(page, /generateReview\(/);
  });

  it("3) successful Deep Scrape retraining uses compileMasterIdentityProfile", () => {
    const executor = read(
      "services/websiteLearning/deepScrape/deepScrapeExecutor.ts",
    );
    assert.match(executor, /compileMasterIdentityProfile/);
    assert.match(executor, /runBrainPhaseB|retraining/);
  });

  it("4) page navigation/reload does not trigger generation", () => {
    const page = read("app/identity/page.tsx");
    assert.match(page, /IdentityExecutiveIntelligence/);
    assert.doesNotMatch(page, /compileMasterIdentityProfile/);
    assert.doesNotMatch(page, /generateReview\(/);
  });

  it("12) failed compile preserves last successful intelligence", () => {
    const service = read("services/identity/identityService.ts");
    assert.match(service, /Error compiling master identity profile/);
    assert.match(service, /return identity;/);
    assert.match(service, /previousMasterProfile/);
    assert.match(service, /attachIdentityExecutiveIntelligence/);
  });
});

describe("Identity Executive Intelligence — prompt and routing", () => {
  it("prompt requests executive_intelligence and grounding rules", () => {
    const prompt = read(
      "services/identity/prompts/masterIdentityProfilePrompt.ts",
    );
    assert.match(prompt, /"executive_intelligence"/);
    assert.match(prompt, /executive_summary/);
    assert.match(prompt, /hidden_signals/);
    assert.match(prompt, /calibration_gaps/);
    assert.match(prompt, /Do not invent facts/);
    assert.match(prompt, /Do not merely copy Voice or Business Knowledge verbatim/);
    assert.match(prompt, /Your Voice/);
    assert.match(prompt, /Your Business Knowledge/);
  });

  it("Gemini Flash identity_profile route remains unchanged", () => {
    const routing = read("lib/llm/modelRouting.ts");
    assert.match(routing, /identity_profile:\s*"analysis"/);
    assert.match(routing, /case "identity_profile":\s*return "identity_profile"/);
    assert.match(routing, /DEFAULT_ANALYSIS_MODEL = "google\/gemini-2.5-flash"/);
    assert.doesNotMatch(routing, /identity_executive_intelligence/);
  });
});

describe("Identity Executive Intelligence — website coverage", () => {
  it("5+6) homepage-only vs deep mode coverage", () => {
    const homepage = buildIdentityWebsiteCoverageView({
      website: "https://example.com",
      websiteIntelligence: null,
      masterProfileGeneratedAt: "2026-07-01T00:00:00.000Z",
      lastDeepScrapeAt: null,
      lastDeepScrapePages: null,
    });
    assert.equal(homepage.learningMode, "homepage");
    assert.equal(homepage.pagesAnalyzed, 1);
    assert.equal(homepage.sourcePages.length, 0);

    const deep = buildIdentityWebsiteCoverageView({
      website: "https://example.com",
      websiteIntelligence: {
        provider: DEEP_WEBSITE_INTELLIGENCE_PROVIDER,
        url: "https://example.com",
        scraped_at: "2026-07-02T00:00:00.000Z",
        pages_analyzed: 3,
        pages: [
          {
            url: "https://example.com/",
            title: "Home",
            page_type: "homepage",
            excerpt: "x",
          },
          {
            url: "https://example.com/services",
            title: "Services",
            page_type: "services",
            excerpt: "y",
          },
          {
            url: "https://example.com/services/",
            title: "Services Dup",
            page_type: "services",
            excerpt: "z",
          },
        ],
        business_knowledge: {
          positioning: "p",
          about: "",
          products: "",
          services: "s",
          solutions: "",
          pricing: "",
          training: "",
          faq: "",
          team: "",
          testimonials: "",
          case_studies: "",
          target_audience: "",
          messaging: "",
          value_proposition: "",
          differentiators: "",
          trust_signals: "",
          contact_information: "",
          brand_tone: "",
          cta: "",
        },
        crawl_summary: {
          pages_analyzed: 3,
          services_discovered: 1,
          faqs_discovered: 0,
          testimonials_discovered: 0,
          team_pages_discovered: 0,
          commercial_pages_discovered: 1,
        },
        positioning: "p",
        products: "",
        services: "s",
        about: "",
        target_audience: "",
        messaging: "",
        value_proposition: "",
        cta: "",
        differentiators: "",
        trust_signals: "",
        contact_information: "",
        brand_tone: "",
        headings: "",
        paragraphs: "",
      },
      masterProfileGeneratedAt: "2026-07-03T00:00:00.000Z",
      lastDeepScrapeAt: "2026-07-02T00:00:00.000Z",
      lastDeepScrapePages: 3,
    });
    assert.equal(deep.learningMode, "deep");
    assert.equal(deep.pagesAnalyzed, 3);
    assert.equal(deep.sourcePages.length, 2);
  });

  it("Brain page inventory UI reuses shared WebsiteAnalyzedPagesList without SEO crawl", () => {
    const identityUi = read(
      "components/identity/IdentityExecutiveIntelligence.tsx",
    );
    const shared = read(
      "components/websiteLearning/WebsiteAnalyzedPagesList.tsx",
    );
    assert.match(identityUi, /WebsiteAnalyzedPagesList/);
    assert.match(identityUi, /messages\.analyzedSourcePages/);
    assert.match(identityUi, /buildIdentityWebsiteCoverageView/);
    assert.doesNotMatch(identityUi, /services\/seo/);
    assert.match(shared, /target="_blank"/);
    assert.match(shared, /rel="noopener noreferrer"/);
    assert.match(shared, /Untitled page/);
    assert.match(
      read("lib/tenantI18n/messages/en.ts"),
      /analyzedSourcePages: "Analyzed source pages"/,
    );
  });

  it("7+9+10) source URLs from persisted pages; dedupe; missing titles safe", () => {
    const pages = buildIdentityWebsiteSourcePages({
      provider: DEEP_WEBSITE_INTELLIGENCE_PROVIDER,
      url: "https://example.com",
      scraped_at: "2026-07-02T00:00:00.000Z",
      pages_analyzed: 2,
      pages: [
        {
          url: "https://example.com/about",
          title: null,
          page_type: "about",
          excerpt: "a",
        },
        {
          url: "https://example.com/about/",
          title: "About Us",
          page_type: "about",
          excerpt: "b",
        },
      ],
      business_knowledge: {
        positioning: "x",
        about: "a",
        products: "",
        services: "",
        solutions: "",
        pricing: "",
        training: "",
        faq: "",
        team: "",
        testimonials: "",
        case_studies: "",
        target_audience: "",
        messaging: "",
        value_proposition: "",
        differentiators: "",
        trust_signals: "",
        contact_information: "",
        brand_tone: "",
        cta: "",
      },
      crawl_summary: {
        pages_analyzed: 2,
        services_discovered: 0,
        faqs_discovered: 0,
        testimonials_discovered: 0,
        team_pages_discovered: 0,
        commercial_pages_discovered: 0,
      },
      positioning: "x",
      products: "",
      services: "",
      about: "a",
      target_audience: "",
      messaging: "",
      value_proposition: "",
      cta: "",
      differentiators: "",
      trust_signals: "",
      contact_information: "",
      brand_tone: "",
      headings: "",
      paragraphs: "",
    });
    assert.equal(pages.length, 1);
    assert.equal(pages[0]?.title, null);
    assert.equal(pages[0]?.group, "About");
  });

  it("8) coverage builders do not invent cross-tenant data paths", () => {
    const ui = read("components/identity/IdentityExecutiveIntelligence.tsx");
    assert.match(ui, /buildIdentityWebsiteCoverageView/);
    assert.match(ui, /identity\.website_intelligence/);
    assert.doesNotMatch(ui, /supabaseAdmin|from\("athena_website/);
  });
});

describe("Identity Executive Intelligence — UI and safety", () => {
  it("11) legacy Brain without EI renders a safe Update Athena message", () => {
    const ui = read("components/identity/IdentityExecutiveIntelligence.tsx");
    assert.match(ui, /copy\.legacyBody/);
    assert.match(ui, /messages\.executive/);
    const dictionary = read("lib/tenantI18n/messages/en.ts");
    assert.match(
      dictionary,
      /trained before Executive Intelligence was available/,
    );
    assert.match(dictionary, /Train Athena to generate this section/);
  });

  it("13+14+15+16) confidence, signals, calibration, and non-verbatim rules", () => {
    const prompt = read(
      "services/identity/prompts/masterIdentityProfilePrompt.ts",
    );
    assert.match(prompt, /confidence_reasons/);
    assert.match(prompt, /evidence-grounded/);
    assert.match(prompt, /Prefer quality over quantity/);
    assert.match(prompt, /update_location must be one of/);
    assert.match(prompt, /Do not merely copy Voice or Business Knowledge verbatim/);
  });

  it("17) Prospect and Discussion intelligence files are not modified by this feature", () => {
    // Contract: this sprint only touches Identity paths for EI generation.
    const prompt = read(
      "services/identity/prompts/masterIdentityProfilePrompt.ts",
    );
    assert.doesNotMatch(prompt, /prospect_intelligence|discussion_analysis/i);
  });

  it("18) Identity Deep Scrape button sync remains intact", () => {
    const button = read("components/identity/DeepScrapeWebsiteButton.tsx");
    assert.match(button, /syncedInitiallyAvailable/);
    assert.match(button, /setAvailable\(true\)/);
  });

  it("places Executive Intelligence below Client Brand Identity", () => {
    const page = read("app/identity/page.tsx");
    const brandIdx = page.indexOf("<BrandIdentitySection");
    const eiIdx = page.indexOf("<IdentityExecutiveIntelligence");
    assert.ok(brandIdx >= 0);
    assert.ok(eiIdx > brandIdx);
  });
});
