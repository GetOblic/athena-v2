import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, it } from "node:test";
import { buildDiscussionDeploymentAssets } from "../../lib/deploymentAssets";
import { KNOWLEDGE_ENHANCEMENT_GENERATION_RULES } from "../../services/ai/prompts/knowledgeEnhancementConstraints";
import { canonicalDeploymentAssetType } from "../../services/assetInteractions/assetInteractionKeys";
import { discoverCandidatePages } from "../../services/prospects/prospectWebsiteDiscovery";
import { extractPageContent } from "../../services/prospects/prospectWebsiteExtraction";
import {
  formatBusinessKnowledgeForPipeline,
  mergeWebsiteKnowledge,
} from "../../services/prospects/prospectWebsiteKnowledgeMerge";
import {
  pageDisplayLabel,
  rankAndSelectPages,
} from "../../services/prospects/prospectWebsiteRanking";
import {
  isIgnoredCrawlPath,
  isNonHtmlResource,
  normalizeCrawlUrl,
  WEBSITE_INTELLIGENCE_MAX_PAGES,
} from "../../services/prospects/prospectWebsiteUrl";
import {
  formatNormalizedProspectInputForPipeline,
  normalizeProspectExecutiveInput,
} from "../../services/prospects/prospectNormalization";

const ROOT = join(process.cwd());

function sampleHomepageHtml(links: string[]): string {
  const nav = links
    .map((href) => `<a href="${href}">${href.replace(/^\//, "") || "Home"}</a>`)
    .join("\n");
  return `
<!doctype html>
<html>
<head><title>Elevate Aesthetics</title>
<meta name="description" content="Medical aesthetics clinic in Chicago" />
</head>
<body>
<nav>${nav}
<a href="https://external.example.com/about">External</a>
<a href="mailto:hello@example.com">Email</a>
<a href="/privacy">Privacy</a>
<a href="/blog/post-1">Blog</a>
<a href="/pricing.pdf">PDF</a>
</nav>
<main>
<h1>Elevate Aesthetics</h1>
<p>We provide Botox, fillers, and laser treatments for patients seeking natural results.</p>
<p>Book a consultation to discuss your goals with our medical team.</p>
<ul><li>Botox</li><li>Dermal fillers</li><li>Laser resurfacing</li></ul>
<a href="/services">Our Services</a>
<a href="/faq">FAQ</a>
<a href="/about-us">About Us</a>
<a href="/pricing">Pricing</a>
<a href="/contact">Contact</a>
<a href="/team">Team</a>
<a href="https://instagram.com/example">Instagram</a>
</main>
<footer>Cookie notice and newsletter form</footer>
</body>
</html>`;
}

describe("Sprint 2B — URL normalization and crawl guards", () => {
  it("normalizes URLs, strips query/hash, and rejects off-domain and media", () => {
    const base = "https://www.clinic.example/home";
    assert.equal(
      normalizeCrawlUrl("/about?utm=1#team", base),
      "https://www.clinic.example/about",
    );
    assert.equal(normalizeCrawlUrl("mailto:a@b.com", base), null);
    assert.equal(normalizeCrawlUrl("tel:+15551212", base), null);
    assert.equal(normalizeCrawlUrl("javascript:void(0)", base), null);
    assert.equal(
      normalizeCrawlUrl("https://other.example/about", base),
      null,
    );
    assert.equal(normalizeCrawlUrl("/pricing.pdf", base), null);
    assert.equal(normalizeCrawlUrl("/video.mp4", base), null);
    assert.equal(isNonHtmlResource("/docs/guide.pdf"), true);
    assert.equal(isIgnoredCrawlPath("/blog/hello"), true);
    assert.equal(isIgnoredCrawlPath("/privacy"), true);
    assert.equal(isIgnoredCrawlPath("/services"), false);
  });
});

describe("Sprint 2B — discovery, ranking, and max pages", () => {
  it("discovers high-value pages from nav and homepage without recursion", () => {
    const html = sampleHomepageHtml([
      "/",
      "/about-us",
      "/services",
      "/pricing",
      "/faq",
      "/contact",
      "/team",
      "/blog",
      "/login",
    ]);
    const discovered = discoverCandidatePages(
      html,
      "https://clinic.example/",
    );

    const urls = discovered.map((page) => page.url);
    assert.ok(
      urls.some(
        (url) =>
          url === "https://clinic.example" ||
          url === "https://clinic.example/",
      ),
    );
    assert.ok(urls.some((url) => url.includes("/about-us")));
    assert.ok(urls.some((url) => url.includes("/services")));
    assert.ok(!urls.some((url) => url.includes("/blog")));
    assert.ok(!urls.some((url) => url.includes("/login")));
    assert.ok(!urls.some((url) => url.includes("external.example.com")));
    assert.ok(!urls.some((url) => url.includes("instagram.com")));
  });

  it("ranks deterministically and never exceeds 10 pages", () => {
    const many = Array.from({ length: 40 }, (_, index) => ({
      url: `https://clinic.example/page-${index}`,
      source: index < 5 ? ("nav" as const) : ("content" as const),
      anchorText:
        index === 1
          ? "Services"
          : index === 2
            ? "FAQ"
            : index === 3
              ? "About"
              : index === 4
                ? "Pricing"
                : `Page ${index}`,
    }));
    many.unshift({
      url: "https://clinic.example",
      source: "homepage",
      anchorText: "Home",
    });

    const selected = rankAndSelectPages(many, WEBSITE_INTELLIGENCE_MAX_PAGES);
    assert.ok(selected.length <= WEBSITE_INTELLIGENCE_MAX_PAGES);
    assert.equal(selected[0].source, "homepage");
    assert.equal(WEBSITE_INTELLIGENCE_MAX_PAGES, 10);

    const again = rankAndSelectPages(many, WEBSITE_INTELLIGENCE_MAX_PAGES);
    assert.deepEqual(
      selected.map((page) => page.url),
      again.map((page) => page.url),
    );
  });

  it("labels prioritized pages for UI display", () => {
    assert.equal(
      pageDisplayLabel({
        url: "https://clinic.example/faq",
        source: "keyword",
        anchorText: "Frequently Asked Questions",
      }),
      "FAQ",
    );
  });
});

describe("Sprint 2B — rich extraction and knowledge merge", () => {
  it("extracts headings, lists, tables, and FAQ while limiting testimonials", () => {
    const html = `
      <nav><a href="/">Home</a></nav>
      <h1>Services</h1>
      <h2>Botox</h2>
      <p>We provide Botox with physician oversight for natural-looking results.</p>
      <ul><li>Botox starts at $12/unit</li><li>Complimentary consultation</li></ul>
      <table><tr><th>Service</th><th>Price</th></tr><tr><td>Botox</td><td>$12/unit</td></tr></table>
      <div class="faq"><h3>How should I prepare?</h3><p>Avoid alcohol 24 hours before treatment.</p></div>
      <div class="testimonials"><p>Amazing clinic ★★★★★ review from Sarah</p></div>
      <footer>Newsletter signup</footer>
    `;
    const extract = extractPageContent(
      html,
      "https://clinic.example/services",
      "Services",
    );
    assert.ok(extract.headings.some((value) => /Services/i.test(value)));
    assert.ok(extract.lists.some((value) => /\$12\/unit/.test(value)));
    assert.ok(extract.tables.some((value) => /Botox/.test(value)));
    assert.ok(!extract.paragraphs.some((value) => /Amazing clinic/.test(value)));
  });

  it("merges homepage and pricing facts into one consolidated business brain", () => {
    const homepage = extractPageContent(
      `<h1>Elevate</h1><p>We provide Botox for patients seeking refreshed results at our Chicago clinic.</p>`,
      "https://clinic.example/",
      "Home",
    );
    const pricing = extractPageContent(
      `<h1>Pricing</h1><p>Botox starts at $12/unit with package options available.</p><ul><li>Botox starts at $12/unit</li></ul>`,
      "https://clinic.example/pricing",
      "Pricing",
    );

    const merged = mergeWebsiteKnowledge([homepage, pricing]);
    assert.match(merged.business_knowledge.services + merged.business_knowledge.products + merged.business_knowledge.pricing, /Botox/i);
    assert.match(merged.business_knowledge.pricing, /\$12/);
    const pipeline = formatBusinessKnowledgeForPipeline(
      merged.business_knowledge,
    );
    assert.match(pipeline, /Pricing:/);
    assert.ok(!pipeline.includes("Amazing"));
  });

  it("includes merged business knowledge in normalized executive input", () => {
    const factual = formatNormalizedProspectInputForPipeline(
      normalizeProspectExecutiveInput({
        business_name: "Elevate",
        website: "https://clinic.example",
        website_intelligence: {
          provider: "multi_page_discovery",
          pages_analyzed: 3,
          pages_limit: 10,
          pages: [
            { url: "https://clinic.example", label: "Home", title: "Elevate" },
            {
              url: "https://clinic.example/services",
              label: "Services",
              title: "Services",
            },
          ],
          business_knowledge: {
            overview: "• Medical aesthetics clinic",
            products: "",
            services: "• Botox\n• Fillers",
            pricing: "• Botox starts at $12/unit",
            consultations: "",
            policies: "",
            technology: "",
            equipment: "",
            brands: "",
            team: "",
            faq: "",
            customer_information: "",
            appointment_process: "",
            preparation: "",
            aftercare: "",
            restrictions: "",
            opening_hours: "",
            contact: "",
          },
          positioning: "Medical aesthetics",
          products: "",
          services: "Botox",
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
          title: "Elevate",
          url: "https://clinic.example",
          scraped_at: "2026-07-13T00:00:00.000Z",
        },
      } as never),
    );

    assert.match(factual, /Pages analyzed: 3 \/ 10/);
    assert.match(factual, /NORMALIZED BUSINESS KNOWLEDGE/);
    assert.match(factual, /Botox starts at \$12\/unit/);
  });
});

describe("Sprint 2B — Knowledge Enhancement deployment asset", () => {
  it("parses Knowledge Enhancement without breaking WhatsApp or email assets", () => {
    const assets = buildDiscussionDeploymentAssets({
      suggested_cta: [
        "PERSONALIZED_OUTREACH_EMAIL:",
        "Hello",
        "",
        "WHATSAPP_OUTREACH:",
        "INITIAL MESSAGE",
        "Hi there",
        "",
        "FOLLOW-UP",
        "Quick bump",
        "",
        "KNOWLEDGE_ENHANCEMENT:",
        "Business Overview",
        "• Medical aesthetics clinic",
        "",
        "Services",
        "• Botox",
        "• Fillers",
        "",
        "Pricing",
        "• Botox starts at $12/unit",
      ].join("\n"),
    } as never);

    const knowledge = assets.find(
      (asset) => asset.title === "Knowledge Enhancement",
    );
    assert.ok(knowledge);
    assert.equal(knowledge?.assetKey, "knowledge_enhancement");
    assert.match(knowledge?.content ?? "", /Business Overview/);
    assert.match(knowledge?.content ?? "", /\$12\/unit/);
    assert.ok(assets.some((asset) => asset.title === "WhatsApp Outreach"));
    assert.ok(
      assets.some((asset) => asset.title === "Personalized Outreach Email"),
    );
    assert.equal(
      canonicalDeploymentAssetType("KNOWLEDGE_ENHANCEMENT"),
      "knowledge_enhancement",
    );
  });

  it("Gemini contract requires factual Knowledge Enhancement rules", () => {
    const assembly = readFileSync(
      join(
        ROOT,
        "services/brain/generationContracts/deploymentAssetsPromptAssembly.ts",
      ),
      "utf8",
    );
    assert.match(assembly, /KNOWLEDGE_ENHANCEMENT_GENERATION_RULES/);
    assert.match(assembly, /KNOWLEDGE_ENHANCEMENT:/);
    assert.match(
      KNOWLEDGE_ENHANCEMENT_GENERATION_RULES,
      /GetOblic AI Receptionists/,
    );
    assert.match(KNOWLEDGE_ENHANCEMENT_GENERATION_RULES, /Never invent facts/);
    assert.match(KNOWLEDGE_ENHANCEMENT_GENERATION_RULES, /Not marketing/);
  });
});

describe("Sprint 2B — multi-page provider timeout resilience", () => {
  it("default scrape entrypoint uses multi-page discovery provider", () => {
    const source = readFileSync(
      join(ROOT, "services/prospects/prospectWebsiteIntelligence.ts"),
      "utf8",
    );
    assert.match(source, /multiPageWebsiteIntelligenceProvider/);
    assert.match(source, /OVERALL_CRAWL_TIMEOUT_MS/);
    assert.match(source, /WEBSITE_INTELLIGENCE_MAX_PAGES/);
    assert.match(source, /crawl_partial/);
    assert.match(
      source,
      /provider: WebsiteIntelligenceProvider = multiPageWebsiteIntelligenceProvider/,
    );
  });

  it("Website Analysis UI shows Pages analyzed X / 10", () => {
    const ui = readFileSync(
      join(ROOT, "components/prospects/ProspectHomepageIntelligence.tsx"),
      "utf8",
    );
    const page = readFileSync(join(ROOT, "app/prospects/[id]/page.tsx"), "utf8");
    assert.match(ui, /Pages analyzed/);
    assert.match(ui, /pagesAnalyzed/);
    assert.match(ui, /Website Analysis/);
    assert.match(page, /Website Learning/);
    assert.doesNotMatch(page, /Homepage Learning/);
  });

  it("preserves Sprint 2A surfaces unchanged", () => {
    const constraints = readFileSync(
      join(ROOT, "services/ai/prompts/prospectDeploymentAssetsConstraints.ts"),
      "utf8",
    );
    const workflow = readFileSync(
      join(ROOT, "lib/discussionWorkflow.ts"),
      "utf8",
    );
    assert.match(constraints, /WHATSAPP_OUTREACH/);
    assert.match(constraints, /KNOWLEDGE_ENHANCEMENT/);
    assert.match(workflow, /Current Status:/);
  });
});
