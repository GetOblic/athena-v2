import "./personaTestEnv";
import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, it } from "node:test";
import {
  formatPersonaReferenceWebsiteResearchEvidence,
  formatNormalizedPersonaInputForPipeline,
} from "../../services/personas/personaPipelineBody";
import { resolvePersonaDeepScrapeTargetUrl } from "../../services/personas/personaDeepScrape";
import { DEEP_SCRAPE_SOURCE_TYPES } from "../../services/websiteLearning/deepScrape/deepScrapeJobTypes";
import { ATHENA_GENERATION_TRIGGER_TYPES } from "../../services/generationJobs/generationJobTypes";

const ROOT = process.cwd();

function read(relativePath: string): string {
  return readFileSync(join(ROOT, relativePath), "utf8");
}

describe("persona stage-5 deep scrape source support", () => {
  it("accepts persona source kind without removing brain/prospect", () => {
    assert.deepEqual([...DEEP_SCRAPE_SOURCE_TYPES], [
      "brain",
      "prospect",
      "persona",
    ]);

    const migration = read(
      "supabase/migrations/20260731000001_persona_deep_scrape_source.sql",
    );
    assert.match(migration, /source_type in \('brain', 'prospect', 'persona'\)/);
    assert.match(migration, /persona_id uuid references personas/);
    assert.match(
      migration,
      /athena_website_deep_scrape_jobs_one_active_persona/,
    );
    assert.match(migration, /source_type in \('prospect', 'persona'\)/);
  });

  it("does not introduce persona_deep_scrape generation trigger", () => {
    assert.ok(ATHENA_GENERATION_TRIGGER_TYPES.includes("prospect_deep_scrape"));
    assert.equal(
      ATHENA_GENERATION_TRIGGER_TYPES.includes(
        "persona_deep_scrape" as never,
      ),
      false,
    );
    const importer = read("services/personas/personaImporter.ts");
    assert.match(importer, /prospect_deep_scrape/);
    assert.doesNotMatch(importer, /["']persona_deep_scrape["']/);
  });

  it("adds Persona enqueue helpers without changing Prospect enqueue entry points", () => {
    const jobService = read(
      "services/websiteLearning/deepScrape/deepScrapeJobService.ts",
    );
    assert.match(jobService, /enqueuePersonaDeepScrapeJob/);
    assert.match(jobService, /getActiveDeepScrapeJobForPersona/);
    assert.match(jobService, /enqueueProspectDeepScrapeJob/);
    assert.match(jobService, /source_type: "persona"/);
    assert.match(jobService, /source_type: "prospect"/);

    const executor = read(
      "services/websiteLearning/deepScrape/deepScrapeExecutor.ts",
    );
    assert.match(executor, /promotePersonaIntelligence/);
    assert.match(executor, /parkPersonaPhaseB/);
    assert.match(executor, /reference_website_intelligence/);
    assert.match(executor, /ensurePersonaGenerationQueued/);
    assert.match(executor, /source_type === "prospect"/);
  });
});

describe("persona stage-5 deep scrape eligibility", () => {
  it("accepts valid Reference Website and rejects missing/invalid", () => {
    const resolved = resolvePersonaDeepScrapeTargetUrl({
      reference_website: "https://example.com/path",
    });
    assert.ok(resolved);
    assert.match(resolved!, /^https:\/\/example\.com/);
    assert.equal(
      resolvePersonaDeepScrapeTargetUrl({ reference_website: null }),
      null,
    );
    assert.equal(
      resolvePersonaDeepScrapeTargetUrl({ reference_website: "not-a-url" }),
      null,
    );
  });

  it("API routes use persisted Persona URL and ignore client URL body", () => {
    const route = read("app/api/personas/[id]/deep-scrape/route.ts");
    assert.match(route, /requireCurrentOrganizationContext/);
    assert.match(route, /enqueuePersonaReferenceWebsiteDeepScrape/);
    assert.match(route, /202/);
    assert.doesNotMatch(route, /request\.json|body\.url|websiteUrl/);
    assert.match(route, /PersonaDeepScrapeEligibilityError/);

    const status = read("app/api/personas/[id]/deep-scrape/status/route.ts");
    assert.match(status, /getPersonaDeepScrapeStatus/);
    assert.match(status, /Not Researched|Research Complete|Research Failed/);
  });
});

describe("persona stage-5 scraped evidence in pipeline body", () => {
  it("includes external research section only with successful content", () => {
    const without = formatNormalizedPersonaInputForPipeline({
      persona_name: "Urban Millennials",
      reference_website: "https://example.com",
      additional_context: "User understanding",
      notes: "Operator notes",
      ads_content: "Ad copy",
    });
    assert.match(without, /=== ADDITIONAL CONTEXT/);
    assert.match(without, /=== NOTES/);
    assert.match(without, /=== ADS CONTENT/);
    assert.match(without, /=== REFERENCE WEBSITE ===/);
    assert.doesNotMatch(
      without,
      /REFERENCE WEBSITE RESEARCH — EXTERNAL CONTEXTUAL EVIDENCE/,
    );

    const intelligence = {
      provider: "deep_v1",
      url: "https://example.com",
      scraped_at: "2026-07-30T00:00:00.000Z",
      pages_analyzed: 3,
      pages: [],
      business_knowledge: {
        positioning: "Premium local services",
        about: "",
        products: "",
        services: "Consulting",
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
      positioning: "Premium local services",
      products: "",
      services: "Consulting",
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
      diagnostics: "secret worker metadata",
    };

    const evidence = formatPersonaReferenceWebsiteResearchEvidence(
      "https://example.com",
      intelligence,
    );
    assert.ok(evidence);
    assert.match(
      evidence!,
      /=== REFERENCE WEBSITE RESEARCH — EXTERNAL CONTEXTUAL EVIDENCE ===/,
    );
    assert.match(evidence!, /Source URL: https:\/\/example\.com/);
    assert.match(evidence!, /EVIDENCE LIMIT:/);
    assert.match(evidence!, /not automatically owned by the Persona/);
    assert.match(evidence!, /Premium local services/);
    assert.doesNotMatch(evidence!, /secret worker metadata/);

    const withResearch = formatNormalizedPersonaInputForPipeline({
      persona_name: "Urban Millennials",
      reference_website: "https://example.com",
      additional_context: "User understanding",
      notes: "Operator notes",
      ads_content: "Ad copy",
      reference_website_intelligence: intelligence,
    });
    assert.match(
      withResearch,
      /REFERENCE WEBSITE RESEARCH — EXTERNAL CONTEXTUAL EVIDENCE/,
    );
    assert.match(withResearch, /=== ADDITIONAL CONTEXT/);
    assert.match(withResearch, /=== NOTES — OPERATOR CONTEXT ===/);
    assert.match(withResearch, /=== ADS CONTENT/);
    assert.ok(
      withResearch.indexOf("=== ADDITIONAL CONTEXT") <
        withResearch.indexOf("REFERENCE WEBSITE RESEARCH"),
    );
  });
});

describe("persona stage-5 deep scrape UI", () => {
  it("exposes Persona-specific Deep Scrape controls without arbitrary URL field", () => {
    const button = read(
      "components/personas/PersonaDeepScrapeWebsiteButton.tsx",
    );
    assert.match(button, /Deep Scrape Reference Website/);
    assert.match(
      button,
      /Research the saved Reference Website and add relevant external context/,
    );
    assert.match(button, /researchState/);
    assert.doesNotMatch(button, /<input[^>]+url|type="url"/i);

    const page = read("app/personas/[id]/page.tsx");
    assert.match(page, /PersonaDeepScrapeWebsiteButton/);
    assert.match(page, /initiallyAvailable=\{deepScrapeAvailable\}/);
  });

  it("creates dedicated Persona deep-scrape routes", () => {
    assert.equal(
      existsSync(join(ROOT, "app/api/personas/[id]/deep-scrape/route.ts")),
      true,
    );
    assert.equal(
      existsSync(
        join(ROOT, "app/api/personas/[id]/deep-scrape/status/route.ts"),
      ),
      true,
    );
  });
});
