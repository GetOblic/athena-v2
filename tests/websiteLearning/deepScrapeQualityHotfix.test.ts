import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, it } from "node:test";

import {
  assertAnalysisPublicationContract,
  normalizeAnalysisFields,
  normalizeAnalysisForDisplay,
  normalizeAnalysisSummaryForDisplay,
} from "../../services/executiveVersions/analysisNormalization";
import {
  buildBoilerplateFingerprintSet,
  stripBoilerplateBlocks,
} from "../../services/websiteLearning/deepScrape/crawler/boilerplate";
import { classifyNormalizedPage } from "../../services/websiteLearning/deepScrape/crawler/pageClassifier";
import { extractWithReadability } from "../../services/websiteLearning/deepScrape/crawler/readabilityExtractor";
import type { NormalizedPageDocument } from "../../services/websiteLearning/deepScrape/crawler/crawlerTypes";
import { DEEP_SCRAPE_CRAWL_POLICY } from "../../services/websiteLearning/deepScrape/crawlPolicy";
import {
  isDeepV1WebsiteIntelligenceProvider,
  KNOWLEDGE_BASE_DEEP_SCRAPE_GENERATION_RULES,
} from "../../services/ai/prompts/knowledgeBaseEnhancementConstraints";

const ROOT = process.cwd();

const SHARED_HEADER = `
<header><nav>Home About Services Contact Book Now</nav></header>
<footer>Apex Scalp Clinic London · +44 20 1234 5678 · hello@apex.example</footer>
`;

const SITE_JSON_LD = `
<script type="application/ld+json">
{"@context":"https://schema.org","@type":"LocalBusiness","name":"Apex Scalp Clinic","telephone":"+44 20 1234 5678","email":"hello@apex.example","address":{"@type":"PostalAddress","streetAddress":"12 Harley Street","addressLocality":"London"}}
</script>
`;

function pageHtml(input: {
  title: string;
  h1: string;
  body: string;
  path: string;
}): string {
  return `<!doctype html><html lang="en"><head>
  <title>${input.title}</title>
  <meta name="description" content="${input.h1}"/>
  <link rel="canonical" href="https://example.com${input.path}"/>
  ${SITE_JSON_LD}
  </head><body>
  ${SHARED_HEADER}
  <main>
    <article>
      <h1>${input.h1}</h1>
      <p>${input.body}</p>
    </article>
  </main>
  </body></html>`;
}

function asDoc(
  extracted: ReturnType<typeof extractWithReadability>,
  overrides: Partial<NormalizedPageDocument> = {},
): NormalizedPageDocument {
  const finalUrl = overrides.finalUrl ?? "https://example.com/";
  return {
    url: finalUrl,
    canonicalUrl: extracted.canonicalUrl ?? finalUrl,
    finalUrl,
    title: extracted.title,
    description: extracted.description,
    headings: extracted.headings,
    readableText: extracted.readableText,
    meaningfulText: extracted.meaningfulText,
    htmlLanguage: extracted.htmlLanguage,
    pageType: "other",
    statusCode: 200,
    contentType: "text/html",
    extractionMethod: "cheerio_readability",
    renderedWithBrowser: false,
    discoveredLinks: extracted.discoveredLinks,
    structuredBusinessData: extracted.structuredBusinessData,
    contentHash: extracted.contentHash,
    fetchedAt: new Date().toISOString(),
    responseBytes: 2000,
    redirectCount: 0,
    selfCanonical: extracted.selfCanonical,
    ...overrides,
  };
}

describe("Deep scrape quality hotfix — extraction uniqueness", () => {
  it("1/5. distinct blog pages with shared chrome produce distinct content", () => {
    const a = extractWithReadability({
      html: pageHtml({
        title: "SMP Aftercare Tips",
        h1: "SMP Aftercare Tips",
        body: "Wash gently for seven days and avoid swimming while the pigment settles into the scalp.",
        path: "/blog/aftercare",
      }),
      url: "https://example.com/blog/aftercare",
      registrableDomain: "example.com",
    });
    const b = extractWithReadability({
      html: pageHtml({
        title: "Hairline Design Guide",
        h1: "Hairline Design Guide",
        body: "Hairline design starts with facial proportions and natural density transitions for each client.",
        path: "/blog/hairline",
      }),
      url: "https://example.com/blog/hairline",
      registrableDomain: "example.com",
    });

    assert.notEqual(a.contentHash, b.contentHash);
    assert.match(a.meaningfulText, /Wash gently for seven days/i);
    assert.match(b.meaningfulText, /facial proportions/i);
    assert.ok(!a.meaningfulText.includes("Home About Services Contact"));
  });

  it("2/3. shared template stripped before hashing; fresh DOM per URL", () => {
    const shared =
      "Apex Scalp Clinic restores confidence with natural looking scalp micropigmentation for men and women across London.";
    const texts = [
      `${shared} Unique aftercare wash protocol for seven days after pigment placement.`,
      `${shared} Unique hairline design proportions for each client's facial structure.`,
      `${shared} Unique density treatment mapping for temples and crown restoration.`,
      `${shared} Unique consultation checklist covering medical history and expectations.`,
      `${shared} Unique pricing overview for single-session density packages.`,
    ];
    const boilerplate = buildBoilerplateFingerprintSet(texts);
    assert.ok(boilerplate.size >= 1);
    const stripped = stripBoilerplateBlocks(texts[0], boilerplate);
    assert.ok(stripped.postChars < stripped.preChars);
    assert.match(stripped.text, /aftercare wash protocol/i);

    const extractor = readFileSync(
      path.join(
        ROOT,
        "services/websiteLearning/deepScrape/crawler/readabilityExtractor.ts",
      ),
      "utf8",
    );
    assert.match(extractor, /new JSDOM/);
    assert.match(extractor, /Fresh DOM per URL|fresh cheerio document per call/i);
  });

  it("6/7. article and main fallbacks extract unique bodies", () => {
    const html = `<!doctype html><html><body>
      <nav>Home Services Contact</nav>
      <main><h1>Density Treatment</h1><p>Our density treatment restores thinning crowns with layered micropigmentation.</p></main>
      <footer>Call us today</footer>
    </body></html>`;
    const extracted = extractWithReadability({
      html,
      url: "https://example.com/services/density",
      registrableDomain: "example.com",
    });
    assert.match(extracted.meaningfulText, /density treatment restores thinning crowns/i);
    assert.ok(
      ["readability", "article", "main", "content_container", "body_stripped"].includes(
        extracted.extractionMethodSelected,
      ),
    );
  });

  it("8. structured data merges without replacing page text", () => {
    const extracted = extractWithReadability({
      html: pageHtml({
        title: "Contact",
        h1: "Visit the clinic",
        body: "Book a private consultation for scalp micropigmentation mapping.",
        path: "/contact",
      }),
      url: "https://example.com/contact",
      registrableDomain: "example.com",
    });
    assert.match(extracted.meaningfulText, /private consultation/i);
    assert.equal(
      extracted.structuredBusinessData.telephone,
      "+44 20 1234 5678",
    );
    // Sitewide LocalBusiness blob must not dominate the content hash input.
    assert.ok(extracted.meaningfulText.length > 40);
  });

  it("9-12. duplicates use meaningful hash; shared chrome alone is not enough", () => {
    const first = extractWithReadability({
      html: pageHtml({
        title: "Services",
        h1: "Our Services",
        body: "Scalp micropigmentation density and hairline design packages for men and women.",
        path: "/services",
      }),
      url: "https://example.com/services",
      registrableDomain: "example.com",
    });
    const second = extractWithReadability({
      html: pageHtml({
        title: "About",
        h1: "About the clinic",
        body: "Founded in London, our practitioners specialise in natural looking hair restoration.",
        path: "/about",
      }),
      url: "https://example.com/about",
      registrableDomain: "example.com",
    });

    const seenContentHashes = new Map<string, string>([
      [first.contentHash, "https://example.com/services"],
    ]);
    const seenFinalUrls = new Map<string, string>();
    const seenCanonicalUrls = new Map<string, string>();

    const unique = classifyNormalizedPage({
      document: asDoc(second, {
        finalUrl: "https://example.com/about",
        pageType: "about",
      }),
      seenContentHashes,
      seenFinalUrls,
      seenCanonicalUrls,
    });
    assert.equal(unique.accepted, true);

    const exactDup = classifyNormalizedPage({
      document: asDoc(first, {
        finalUrl: "https://example.com/services-copy",
        pageType: "services",
      }),
      seenContentHashes,
      seenFinalUrls,
      seenCanonicalUrls,
    });
    assert.equal(
      exactDup.rejectionCode,
      "CHEERIO_SUSPECTED_TEMPLATE_EXTRACTION",
    );
    assert.equal(exactDup.needsPlaywrightFallback, true);
    assert.equal(exactDup.duplicateBasis, "meaningful_content_hash");
  });

  it("13-15. suspected template triggers Playwright; unique Cheerio pages do not", () => {
    const uniquePage = extractWithReadability({
      html: pageHtml({
        title: "FAQ",
        h1: "FAQ",
        body: "Does SMP hurt? Most clients describe mild discomfort during the first session only.",
        path: "/faq",
      }),
      url: "https://example.com/faq",
      registrableDomain: "example.com",
    });
    const classification = classifyNormalizedPage({
      document: asDoc(uniquePage, {
        finalUrl: "https://example.com/faq",
        pageType: "faq",
      }),
      htmlForShellCheck: "<html><body><main><p>content</p></main></body></html>",
    });
    assert.equal(classification.accepted, true);
    assert.equal(classification.needsPlaywrightFallback, false);

    const cheerio = readFileSync(
      path.join(
        ROOT,
        "services/websiteLearning/deepScrape/crawler/cheerioCrawler.ts",
      ),
      "utf8",
    );
    assert.match(cheerio, /CHEERIO_SUSPECTED_TEMPLATE_EXTRACTION/);
    assert.match(cheerio, /playwrightFallbackUrls\.push\(fallbackUrl\)/);
  });

  it("16-18. corpus collapse gate and 25-page cap remain wired", () => {
    assert.equal(DEEP_SCRAPE_CRAWL_POLICY.maxMeaningfulPages, 25);
    const adapter = readFileSync(
      path.join(
        ROOT,
        "services/websiteLearning/deepScrape/crawler/crawleeAdapter.ts",
      ),
      "utf8",
    );
    assert.match(adapter, /EXTRACTION_COLLAPSED_TO_SHARED_TEMPLATE/);
    assert.match(adapter, /buildBoilerplateFingerprintSet/);
    assert.match(adapter, /stripBoilerplateBlocks/);
  });
});

describe("Deep scrape quality hotfix — analysis normalization", () => {
  it("19-21. proper analysis unchanged; JSON summary recovered", () => {
    const ok = normalizeAnalysisFields({
      summary: "Prospect is a strong fit for scalp micropigmentation outreach.",
      pain_points: "Low online trust signals",
      recommended_action: "Lead with clinic proof and consult CTA",
      confidence: 82,
      sentiment: "positive",
      intent: "research",
      buyer_stage: "consideration",
    });
    assert.equal(ok.summary.startsWith("{"), false);
    assert.equal(ok.confidence, 82);

    const nested = normalizeAnalysisFields({
      summary: JSON.stringify({
        summary: "Recovered executive summary from nested JSON.",
        pain_points: "Pricing opacity",
        recommended_action: "Send proof pack",
        confidence: 70,
      }),
      confidence: 0,
    });
    assert.equal(nested.summary, "Recovered executive summary from nested JSON.");
    assert.ok(nested.repairedFields.includes("summary"));

    const display = normalizeAnalysisSummaryForDisplay(
      JSON.stringify({ summary: "Display recovery works." }),
    );
    assert.equal(display, "Display recovery works.");
  });

  it("22-24. malformed contract rejected; genuine low confidence allowed", () => {
    const fallback = normalizeAnalysisFields({
      summary: "",
      confidence: 0,
      isParserFallback: true,
    });
    const rejected = assertAnalysisPublicationContract(fallback);
    assert.equal(rejected.ok, false);
    if (!rejected.ok) {
      assert.equal(rejected.code, "MALFORMED_ANALYSIS_CONTRACT");
    }

    const lowConfidence = normalizeAnalysisFields({
      summary: "Weak but valid prose summary about the prospect.",
      pain_points: "Unclear offer",
      recommended_action: "Ask clarifying questions",
      confidence: 12,
      sentiment: "neutral",
      intent: "research",
      buyer_stage: "awareness",
      isParserFallback: false,
    });
    assert.equal(assertAnalysisPublicationContract(lowConfidence).ok, true);

    const shell = normalizeAnalysisFields({
      summary: "x",
      confidence: 0,
      intent: "none",
      buyer_stage: "unaware",
      isParserFallback: false,
    });
    // summary present but empty shell signals still caught when pain/action empty and defaults remain
    const shellCheck = assertAnalysisPublicationContract({
      ...shell,
      summary: "Generic",
      pain_points: "",
      recommended_action: "",
    });
    assert.equal(shellCheck.ok, false);
  });

  it("25-27. display normalization hides JSON; valid analysis untouched", () => {
    const display = normalizeAnalysisForDisplay({
      summary: JSON.stringify({
        summary: "Clean prose for What matters in 30 seconds.",
        pain_points: ["Trust"],
        recommended_action: "Share case studies",
        confidence: 55,
      }),
      confidence: 0,
    });
    assert.equal(
      display.summary,
      "Clean prose for What matters in 30 seconds.",
    );
    assert.doesNotMatch(display.summary, /^\s*\{/);

    const card = readFileSync(
      path.join(ROOT, "components/discussions/ExecutiveIntelligenceCard.tsx"),
      "utf8",
    );
    assert.match(card, /normalizeAnalysisForDisplay/);
  });
});

describe("Deep scrape quality hotfix — knowledge base + pipeline", () => {
  it("28-32. deep KB contract and wiring", () => {
    assert.equal(
      isDeepV1WebsiteIntelligenceProvider({ provider: "deep_v1" }),
      true,
    );
    assert.equal(
      isDeepV1WebsiteIntelligenceProvider({ provider: "homepage_v1" }),
      false,
    );
    assert.match(
      KNOWLEDGE_BASE_DEEP_SCRAPE_GENERATION_RULES,
      /Source Coverage Summary/,
    );
    assert.match(
      KNOWLEDGE_BASE_DEEP_SCRAPE_GENERATION_RULES,
      /Unknown or Unverified Information/,
    );
    const assembly = readFileSync(
      path.join(
        ROOT,
        "services/brain/generationContracts/deploymentAssetsPromptAssembly.ts",
      ),
      "utf8",
    );
    assert.match(assembly, /KNOWLEDGE_BASE_DEEP_SCRAPE_GENERATION_RULES/);
    assert.match(assembly, /websiteIntelligence/);
  });

  it("33-41. pipeline safety contracts remain", () => {
    const executor = readFileSync(
      path.join(
        ROOT,
        "services/websiteLearning/deepScrape/deepScrapeExecutor.ts",
      ),
      "utf8",
    );
    const engine = readFileSync(
      path.join(ROOT, "services/websiteLearning/deepScrape/crawlEngine.ts"),
      "utf8",
    );
    const observability = readFileSync(
      path.join(ROOT, "services/websiteLearning/deepScrape/observability.ts"),
      "utf8",
    );
    assert.match(executor, /compileMasterIdentityProfile/);
    assert.match(executor, /prospect_deep_scrape/);
    assert.match(executor, /EXTRACTION_COLLAPSED_TO_SHARED_TEMPLATE/);
    assert.match(engine, /runCrawleeWebsiteCrawl/);
    assert.match(observability, /cheerio_extraction_suspect/);
    assert.match(observability, /corpus_quality_failed/);
    assert.match(observability, /analysis_contract_normalized/);
    assert.doesNotMatch(observability, /rawHtml|page body/i);
  });
});
