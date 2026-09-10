import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, it } from "node:test";
import {
  hasUsableStoredHomepageLearning,
  readStoredHomepageLearning,
  resolveIdentityWebsiteHomepageText,
} from "../../services/identity/identityHomepageLearning";
import { buildMasterIdentityProfilePrompt } from "../../services/identity/prompts/masterIdentityProfilePrompt";
import {
  REQUIRED_PROSPECT_DEPLOYMENT_ASSET_KEYS,
  isCompleteProspectDeploymentAssetSet,
  unwrapProspectDeploymentAssetResponse,
} from "../../lib/prospectDeploymentAssetContract";
import { buildProspectAnalysisBody } from "../../services/prospects/prospectUtils";
import {
  resolveProspectWebsiteLearningDecision,
  websiteIntelligenceHasUsableContent,
} from "../../services/prospects/prospectWebsiteLearningPolicy";

const ROOT = process.cwd();

const usableIntel = {
  provider: "homepage_only",
  url: "https://acme.com",
  scraped_at: "2026-07-14T00:00:00.000Z",
  title: "Acme",
  headings: "Build faster",
  paragraphs: "We help operators.",
  positioning: "Operator infrastructure",
  products: "Platform",
  services: "Automation",
  about: "We help operators scale",
  target_audience: "Operators",
  messaging: "Scale without chaos",
  value_proposition: "Save time",
  cta: "Book a demo",
  differentiators: "Built for operators",
  trust_signals: "Trusted by 200 teams",
  contact_information: "hello@acme.com",
  brand_tone: "Concise / direct",
};

function labeledRequiredAssets(): string {
  return REQUIRED_PROSPECT_DEPLOYMENT_ASSET_KEYS.map(
    (key) => `${key}:\nSample content for ${key}.`,
  ).join("\n\n");
}

describe("Brain initial-only website scraping", () => {
  it("initial Brain generation scrapes when stored homepage_learning is empty", async () => {
    let fetchCalls = 0;
    const result = await resolveIdentityWebsiteHomepageText({
      masterProfile: null,
      website: "https://example.com",
      fetchHomepageText: async () => {
        fetchCalls += 1;
        return "Homepage text from live fetch";
      },
    });

    assert.equal(fetchCalls, 1);
    assert.equal(result.scraped, true);
    assert.equal(result.text, "Homepage text from live fetch");
    assert.equal(hasUsableStoredHomepageLearning(null), false);
    assert.equal(hasUsableStoredHomepageLearning({}), false);
  });

  it("Brain identity update does not scrape", async () => {
    let fetchCalls = 0;
    const stored = "Exact stored homepage learning";
    const result = await resolveIdentityWebsiteHomepageText({
      masterProfile: {
        homepage_learning: stored,
        persona: { summary: "Updated persona" },
      },
      website: "https://example.com",
      fetchHomepageText: async () => {
        fetchCalls += 1;
        return "SHOULD NOT FETCH";
      },
    });

    assert.equal(fetchCalls, 0);
    assert.equal(result.scraped, false);
    assert.equal(result.text, stored);
    assert.equal(
      readStoredHomepageLearning({ homepage_learning: stored }),
      stored,
    );
  });

  it("Brain website URL change does not scrape automatically", async () => {
    let fetchCalls = 0;
    const stored = "Prior homepage learning must be preserved";
    const result = await resolveIdentityWebsiteHomepageText({
      masterProfile: { homepage_learning: stored },
      website: "https://brand-new-domain.example",
      fetchHomepageText: async () => {
        fetchCalls += 1;
        return "SHOULD NOT FETCH ON URL CHANGE";
      },
    });

    assert.equal(fetchCalls, 0);
    assert.equal(result.scraped, false);
    assert.equal(result.text, stored);

    const identitySource = readFileSync(
      path.join(ROOT, "services/identity/identityService.ts"),
      "utf8",
    );
    assert.match(identitySource, /resolveIdentityWebsiteHomepageText/);
    assert.match(identitySource, /fetchHomepageText: fetchWebsiteHomepageText/);
    assert.match(
      identitySource,
      /Preserve exact stored homepage learning across identity updates/,
    );
  });
});

describe("Prospect initial-only website scraping", () => {
  it("initial manual Prospect generation scrapes once", () => {
    const decision = resolveProspectWebsiteLearningDecision({
      triggerType: "discussion_import",
      hasWebsite: true,
      websiteIntelligence: null,
    });
    assert.equal(decision.shouldCrawl, true);
    assert.equal(decision.reason, "initial_import");

    const importer = readFileSync(
      path.join(ROOT, "services/prospects/prospectImporter.ts"),
      "utf8",
    );
    assert.match(importer, /discussion_import/);
    assert.match(
      importer,
      /options\?\.triggerType \?\? "discussion_import"/,
    );
  });

  it("initial CSV/batch Prospect generation scrapes once", () => {
    const decision = resolveProspectWebsiteLearningDecision({
      triggerType: "discussion_import",
      hasWebsite: true,
      websiteIntelligence: { scraped_at: "2026-07-14T00:00:00.000Z", error: "empty" },
    });
    // Empty/failed prior import may resume crawl; usable content is absent.
    assert.equal(decision.shouldCrawl, true);
    assert.equal(decision.reason, "import_retry_resume");
    assert.equal(
      websiteIntelligenceHasUsableContent({
        scraped_at: "2026-07-14T00:00:00.000Z",
        error: "empty",
        about: "",
        services: "",
      }),
      false,
    );

    const csvImport = readFileSync(
      path.join(ROOT, "services/prospects/prospectImporter.ts"),
      "utf8",
    );
    assert.match(csvImport, /importProspectsFromRows/);
    assert.match(csvImport, /ensureProspectGenerationQueued/);
  });

  it("Prospect refresh does not scrape", () => {
    const decision = resolveProspectWebsiteLearningDecision({
      triggerType: "manual_refresh",
      hasWebsite: true,
      websiteIntelligence: usableIntel,
    });
    assert.equal(decision.shouldCrawl, false);
    assert.equal(decision.reason, "intelligence_refresh");

    const refreshRoute = readFileSync(
      path.join(ROOT, "app/api/prospects/[id]/refresh/route.ts"),
      "utf8",
    );
    assert.match(refreshRoute, /triggerType:\s*"manual_refresh"/);
  });

  it("manual_refresh with a website and null Website Intelligence crawls once", () => {
    const decision = resolveProspectWebsiteLearningDecision({
      triggerType: "manual_refresh",
      hasWebsite: true,
      websiteIntelligence: null,
    });
    assert.equal(decision.shouldCrawl, true);
    assert.equal(decision.reason, "initial_generate_missing_stored");
    assert.equal(websiteIntelligenceHasUsableContent(null), false);
  });

  it("manual_refresh with usable homepage_only Website Intelligence does not crawl", () => {
    const decision = resolveProspectWebsiteLearningDecision({
      triggerType: "manual_refresh",
      hasWebsite: true,
      websiteIntelligence: usableIntel,
    });
    assert.equal(decision.shouldCrawl, false);
    assert.equal(decision.reason, "intelligence_refresh");
    assert.equal(websiteIntelligenceHasUsableContent(usableIntel), true);
  });

  it("manual_refresh with usable deep_v1 Website Intelligence does not crawl", () => {
    const deepIntel = {
      provider: "deep_v1",
      url: "https://acme.com",
      scraped_at: "2026-07-14T00:00:00.000Z",
      pages_analyzed: 4,
      about: "We help operators scale",
      services: "Automation",
      products: "Platform",
      positioning: "Operator infrastructure",
      business_knowledge: {
        about: "We help operators scale",
        services: "Automation",
      },
      pages: [
        {
          url: "https://acme.com",
          title: "Acme",
          page_type: "home",
          excerpt: "PAGES_EXCERPT_MUST_NOT_TRIGGER_RECRAWL",
        },
      ],
    };
    const decision = resolveProspectWebsiteLearningDecision({
      triggerType: "manual_refresh",
      hasWebsite: true,
      websiteIntelligence: deepIntel,
    });
    assert.equal(decision.shouldCrawl, false);
    assert.equal(decision.reason, "intelligence_refresh");
    assert.equal(websiteIntelligenceHasUsableContent(deepIntel), true);
  });

  it("manual_refresh without a website does not crawl", () => {
    const decision = resolveProspectWebsiteLearningDecision({
      triggerType: "manual_refresh",
      hasWebsite: false,
      websiteIntelligence: null,
    });
    assert.equal(decision.shouldCrawl, false);
    assert.equal(decision.reason, "no_website");
  });

  it("first Generate Intelligence prep invokes the existing homepage learning path when WI is missing", () => {
    const firstGenerate = resolveProspectWebsiteLearningDecision({
      triggerType: "manual_refresh",
      hasWebsite: true,
      websiteIntelligence: null,
    });
    assert.equal(firstGenerate.shouldCrawl, true);
    assert.equal(firstGenerate.reason, "initial_generate_missing_stored");

    const importer = readFileSync(
      path.join(ROOT, "services/prospects/prospectImporter.ts"),
      "utf8",
    );
    const prepFn = importer.slice(
      importer.indexOf(
        "export async function prepareProspectBridgeBeforeGeneration",
      ),
      importer.indexOf("export async function markProspectGenerationReady"),
    );
    const crawlBranch = prepFn.slice(
      prepFn.indexOf("if (decision.shouldCrawl && current.website)"),
      prepFn.indexOf("} else {"),
    );
    const reuseBranch = prepFn.slice(prepFn.indexOf("} else {"));

    assert.match(prepFn, /resolveProspectWebsiteLearningDecision/);
    assert.match(prepFn, /scrapeHomepageIntelligence\(current\.website\)/);
    assert.match(crawlBranch, /scrapeHomepageIntelligence\(current\.website\)/);
    assert.match(crawlBranch, /website_intelligence: intelligence/);
    assert.match(crawlBranch, /Learning from Website/);
    assert.doesNotMatch(reuseBranch, /scrapeHomepageIntelligence/);
    assert.match(
      reuseBranch,
      /Never mutate website_intelligence on refresh \/ non-import \/ reuse paths/,
    );
  });

  it("subsequent manual_refresh with stored usable WI does not invoke the scraper", () => {
    const subsequent = resolveProspectWebsiteLearningDecision({
      triggerType: "manual_refresh",
      hasWebsite: true,
      websiteIntelligence: usableIntel,
    });
    assert.equal(subsequent.shouldCrawl, false);
    assert.equal(subsequent.reason, "intelligence_refresh");
    assert.equal(websiteIntelligenceHasUsableContent(usableIntel), true);

    const importer = readFileSync(
      path.join(ROOT, "services/prospects/prospectImporter.ts"),
      "utf8",
    );
    const prepFn = importer.slice(
      importer.indexOf(
        "export async function prepareProspectBridgeBeforeGeneration",
      ),
      importer.indexOf("export async function markProspectGenerationReady"),
    );
    const reuseBranch = prepFn.slice(prepFn.indexOf("} else {"));
    assert.doesNotMatch(reuseBranch, /scrapeHomepageIntelligence/);
    assert.doesNotMatch(reuseBranch, /website_intelligence:/);
    assert.match(
      reuseBranch,
      /Never mutate website_intelligence on refresh \/ non-import \/ reuse paths/,
    );
  });

  it("Prospect append does not scrape", () => {
    const decision = resolveProspectWebsiteLearningDecision({
      triggerType: "discussion_update",
      hasWebsite: true,
      websiteIntelligence: usableIntel,
    });
    assert.equal(decision.shouldCrawl, false);
    assert.equal(decision.reason, "non_import_trigger");

    const updatesRoute = readFileSync(
      path.join(ROOT, "app/api/prospects/[id]/updates/route.ts"),
      "utf8",
    );
    assert.match(updatesRoute, /triggerType:\s*"discussion_update"/);
  });

  it("metadata-triggered regeneration does not scrape when stored intelligence exists", () => {
    // PATCH uses default discussion_import; policy still blocks crawl when usable.
    const decision = resolveProspectWebsiteLearningDecision({
      triggerType: "discussion_import",
      hasWebsite: true,
      websiteIntelligence: usableIntel,
    });
    assert.equal(decision.shouldCrawl, false);
    assert.equal(decision.reason, "import_retry_reuse_stored");
    assert.equal(websiteIntelligenceHasUsableContent(usableIntel), true);

    const patchRoute = readFileSync(
      path.join(ROOT, "app/api/prospects/[id]/route.ts"),
      "utf8",
    );
    assert.match(patchRoute, /ensureProspectGenerationQueued\(prospect/);
    assert.doesNotMatch(
      patchRoute,
      /triggerType:\s*"manual_refresh"|triggerType:\s*"discussion_update"/,
    );
  });

  it("stored Prospect intelligence is reused in generation context", () => {
    const body = buildProspectAnalysisBody({
      business_name: "Acme",
      website: "https://acme.com",
      linkedin: null,
      facebook: null,
      instagram: null,
      industry: null,
      category: null,
      country: null,
      state: null,
      city: null,
      address: null,
      company_size: null,
      revenue: null,
      employee_count: null,
      technologies: null,
      pain_points: null,
      decision_maker: "Jane",
      job_title: null,
      email: null,
      phone: null,
      google_business_url: null,
      notes: null,
      additional_context: null,
      source: "manual",
      website_intelligence: usableIntel,
    });

    assert.match(body, /NORMALIZED HOMEPAGE INTELLIGENCE/);
    assert.match(body, /Operator infrastructure/);
    assert.match(body, /We help operators scale/);

    const importer = readFileSync(
      path.join(ROOT, "services/prospects/prospectImporter.ts"),
      "utf8",
    );
    assert.match(
      importer,
      /Never mutate website_intelligence on refresh \/ non-import \/ reuse paths/,
    );
    assert.match(importer, /resolveProspectWebsiteLearningDecision/);
    assert.match(importer, /buildProspectAnalysisBody\(current\)/);

    const executor = readFileSync(
      path.join(ROOT, "services/generationJobs/generationJobExecutor.ts"),
      "utf8",
    );
    assert.match(executor, /triggerType: job\.trigger_type/);
    assert.match(executor, /prepareProspectBridgeBeforeGeneration/);
  });

  it("existing publication and Ready behavior remain unchanged", () => {
    assert.equal(REQUIRED_PROSPECT_DEPLOYMENT_ASSET_KEYS.length, 14);

    const cta = labeledRequiredAssets();
    const parsed = unwrapProspectDeploymentAssetResponse(cta);
    assert.equal(parsed.isComplete, true);
    assert.equal(parsed.missingKeys.length, 0);
    assert.equal(
      isCompleteProspectDeploymentAssetSet(parsed.parsedKeys),
      true,
    );

    // Optional/content assets must not affect the 14-key Ready gate.
    const withExtras = `${cta}\n\nWHATSAPP_OUTREACH:\nHi\n\nKNOWLEDGE_BASE_ENHANCEMENT:\nNote`;
    const extrasParsed = unwrapProspectDeploymentAssetResponse(withExtras);
    assert.equal(extrasParsed.isComplete, true);
    assert.equal(extrasParsed.missingKeys.length, 0);
  });
});

describe("Initial-only scraping does not suppress regeneration", () => {
  it("Brain update recompiles from current profile fields while reusing homepage_learning", async () => {
    const storedHomepage = "EXACT_STORED_HOMEPAGE_LEARNING_V1";
    let fetchCalls = 0;

    const resolved = await resolveIdentityWebsiteHomepageText({
      masterProfile: { homepage_learning: storedHomepage },
      website: "https://example.com",
      fetchHomepageText: async () => {
        fetchCalls += 1;
        return "MUST_NOT_FETCH";
      },
    });

    assert.equal(fetchCalls, 0);
    assert.equal(resolved.scraped, false);
    assert.equal(resolved.text, storedHomepage);

    const updatedAbout =
      "I now advise PE-backed operators on revenue systems.";
    const updatedExpertise =
      "Go-to-market diagnostics, pipeline design, offer packaging.";
    const prompt = buildMasterIdentityProfilePrompt({
      aboutYou: updatedAbout,
      expertise: updatedExpertise,
      website: "https://example.com",
      websiteHomepageText: resolved.text,
    });

    assert.match(prompt, /ABOUT YOU:\n[\s\S]*PE-backed operators/);
    assert.match(prompt, /TEACH ATHENA YOUR EXPERTISE:\n[\s\S]*pipeline design/);
    assert.match(
      prompt,
      new RegExp(
        `WEBSITE HOMEPAGE CONTENT:\\n${storedHomepage.replace(
          /[.*+?^${}()|[\]\\]/g,
          "\\$&",
        )}`,
      ),
    );
    assert.doesNotMatch(prompt, /MUST_NOT_FETCH/);

    // Compile path still regenerates Brain output from current non-website inputs.
    const identitySource = readFileSync(
      path.join(ROOT, "services/identity/identityService.ts"),
      "utf8",
    );
    const compileFn = identitySource.slice(
      identitySource.indexOf("export async function compileMasterIdentityProfile"),
      identitySource.indexOf("export async function upsertAthenaIdentity"),
    );
    assert.match(compileFn, /buildMasterIdentityProfilePrompt\(\{/);
    assert.match(compileFn, /aboutYou: identity\.about_you/);
    assert.match(compileFn, /expertise: identity\.expertise/);
    assert.match(compileFn, /websiteHomepageText/);
    assert.match(compileFn, /generateReview\(prompt/);
    assert.match(
      compileFn,
      /masterProfile\.homepage_learning = storedHomepageLearning/,
    );
    assert.doesNotMatch(
      compileFn,
      /fetchWebsiteHomepageText\(identity\.website\)/,
    );
    assert.match(compileFn, /fetchHomepageText: fetchWebsiteHomepageText/);
  });

  it("Prospect append regenerates fully from stored website intelligence without scraping", () => {
    const decision = resolveProspectWebsiteLearningDecision({
      triggerType: "discussion_update",
      hasWebsite: true,
      websiteIntelligence: usableIntel,
    });
    assert.equal(decision.shouldCrawl, false);

    const appendedNote =
      "Decision maker asked for a Q3 pilot proposal this week.";
    const body = buildProspectAnalysisBody({
      business_name: "Acme",
      website: "https://acme.com",
      linkedin: null,
      facebook: null,
      instagram: null,
      industry: "SaaS",
      category: null,
      country: "US",
      state: null,
      city: null,
      address: null,
      company_size: null,
      revenue: null,
      employee_count: null,
      technologies: null,
      pain_points: null,
      decision_maker: "Jane Doe",
      job_title: "CEO",
      email: null,
      phone: null,
      google_business_url: null,
      notes: appendedNote,
      additional_context: null,
      source: "manual",
      website_intelligence: usableIntel,
    });

    assert.match(body, /NORMALIZED HOMEPAGE INTELLIGENCE/);
    assert.match(body, /Operator infrastructure/);
    assert.match(body, /We help operators scale/);
    assert.match(body, /Notes:\nDecision maker asked for a Q3 pilot/);
    assert.match(body, /Jane Doe/);

    const updatesRoute = readFileSync(
      path.join(ROOT, "app/api/prospects/[id]/updates/route.ts"),
      "utf8",
    );
    assert.match(updatesRoute, /appendDiscussionUpdate/);
    assert.match(updatesRoute, /updateProspect/);
    assert.match(updatesRoute, /notes/);
    assert.match(updatesRoute, /enqueueDiscussionGenerationJob/);
    assert.match(updatesRoute, /triggerType:\s*"discussion_update"/);
    assert.doesNotMatch(updatesRoute, /scrapeHomepageIntelligence/);

    const importer = readFileSync(
      path.join(ROOT, "services/prospects/prospectImporter.ts"),
      "utf8",
    );
    const prepFn = importer.slice(
      importer.indexOf(
        "export async function prepareProspectBridgeBeforeGeneration",
      ),
      importer.indexOf("export async function markProspectGenerationReady"),
    );
    assert.match(prepFn, /resolveProspectWebsiteLearningDecision/);
    assert.match(prepFn, /decision\.shouldCrawl && current\.website/);
    assert.match(prepFn, /buildProspectAnalysisBody\(current\)/);
    assert.match(
      prepFn,
      /Never mutate website_intelligence on refresh \/ non-import \/ reuse paths/,
    );

    const executor = readFileSync(
      path.join(ROOT, "services/generationJobs/generationJobExecutor.ts"),
      "utf8",
    );
    // Full pipeline still runs after prep for every Prospect job, including append.
    assert.match(executor, /prepareProspectBridgeBeforeGeneration\(/);
    assert.match(executor, /processDiscussionEndToEnd\(/);
    assert.match(executor, /triggerType: job\.trigger_type/);

    const workflow = readFileSync(
      path.join(ROOT, "services/workflows/discussionWorkflow.ts"),
      "utf8",
    );
    // Successful Prospect generation still publishes a new Executive Version.
    assert.match(workflow, /publishExecutiveIntelligenceVersion\(/);
    assert.match(workflow, /requireProspectCompleteness: isProspect/);
    assert.match(
      workflow,
      /Executive Version publication failed for incomplete Prospect candidate/,
    );
  });
});
