import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { toSynthesisPages } from "../../services/websiteLearning/deepScrape/crawler/crawleeAdapter";
import type { NormalizedPageDocument } from "../../services/websiteLearning/deepScrape/crawler/crawlerTypes";
import { extractWithReadability } from "../../services/websiteLearning/deepScrape/crawler/readabilityExtractor";
import { mapSynthesisPagesToDeepCrawledPages } from "../../services/websiteLearning/deepScrape/synthesize";

function fixtureDoc(
  overrides: Partial<NormalizedPageDocument> = {},
): NormalizedPageDocument {
  return {
    url: "https://example.com/",
    canonicalUrl: "https://example.com/",
    finalUrl: "https://example.com/",
    title: "Example Clinic",
    description: "Hair restoration clinic",
    headings: ["Services"],
    headingEntries: [{ level: 1, text: "Services" }],
    readableText:
      "We offer scalp micropigmentation and hairline design consultations in London.",
    meaningfulText:
      "We offer scalp micropigmentation and hairline design consultations in London.",
    htmlLanguage: "en",
    pageType: "homepage",
    statusCode: 200,
    contentType: "text/html",
    extractionMethod: "cheerio_readability",
    renderedWithBrowser: false,
    discoveredLinks: ["https://example.com/about"],
    structuredBusinessData: {
      types: ["Organization"],
      organizationName: "Example",
      businessName: "Example",
      description: null,
      telephone: null,
      email: null,
      address: null,
      openingHours: [],
      socialLinks: [],
      services: [],
      products: [],
      people: [],
      faqs: [],
      reviews: [],
      rawJsonLdCount: 1,
    },
    contentHash: "hash1",
    fetchedAt: new Date().toISOString(),
    responseBytes: 1200,
    redirectCount: 0,
    selfCanonical: true,
    declaredCanonicalUrl: "https://example.com/",
    robotsMeta: "index,follow",
    imageAltCoverage: { total: 2, withAlt: 1, missingAlt: 1 },
    hreflangAlternates: [{ hreflang: "en", href: "https://example.com/" }],
    internalLinksSample: [
      {
        url: "https://example.com/about",
        anchor: "About",
        provenance: "nav",
      },
    ],
    ...overrides,
  };
}

describe("additive WI technical persistence", () => {
  it("extracts robots meta, image alt coverage, heading levels, and hreflang cheaply", () => {
    const html = `
      <html lang="en">
        <head>
          <title>Clinic</title>
          <meta name="description" content="Clinic description" />
          <meta name="robots" content="noindex,nofollow" />
          <link rel="canonical" href="https://example.com/" />
          <link rel="alternate" hreflang="en" href="https://example.com/" />
          <link rel="alternate" hreflang="fr" href="https://example.com/fr/" />
        </head>
        <body>
          <h1>Welcome</h1>
          <h2>Services</h2>
          <img src="/hero.jpg" alt="Hero" />
          <img src="/product.jpg" />
          <p>Useful content about scalp micropigmentation consultations in London for clients seeking density treatments.</p>
        </body>
      </html>
    `;
    const extracted = extractWithReadability({
      html,
      url: "https://example.com/",
      registrableDomain: "example.com",
    });
    assert.equal(extracted.robotsMeta, "noindex,nofollow");
    assert.equal(extracted.imageAltCoverage.total, 2);
    assert.equal(extracted.imageAltCoverage.withAlt, 1);
    assert.equal(extracted.imageAltCoverage.missingAlt, 1);
    assert.deepEqual(extracted.headingEntries.slice(0, 2), [
      { level: 1, text: "Welcome" },
      { level: 2, text: "Services" },
    ]);
    assert.equal(extracted.headings[0], "Welcome");
    assert.ok(extracted.hreflangAlternates.length >= 2);
    assert.equal(extracted.declaredCanonicalUrl, "https://example.com/");
  });

  it("toSynthesisPages passes technical fields additively without dropping core fields", () => {
    const pages = toSynthesisPages([
      fixtureDoc({
        finalUrl: "https://example.com/services",
        title: "Services",
        pageType: "services",
        readableText: "Density treatments",
        meaningfulText: "Density treatments",
      }),
    ]);
    assert.equal(pages[0]?.url, "https://example.com/services");
    assert.equal(pages[0]?.title, "Services");
    assert.equal(pages[0]?.pageType, "services");
    assert.equal(pages[0]?.text, "Density treatments");
    assert.equal(pages[0]?.metaDescription, "Hair restoration clinic");
    assert.equal(pages[0]?.httpStatus, 200);
    assert.equal(pages[0]?.selfCanonical, true);
    assert.equal(pages[0]?.robotsMeta, "index,follow");
    assert.equal(pages[0]?.imageAltCoverage?.missingAlt, 1);
    assert.ok((pages[0]?.headingEntries?.length ?? 0) > 0);
  });

  it("synthesize persists technical fields on DeepCrawledPage additively", () => {
    const synthesisPages = toSynthesisPages([fixtureDoc()]);
    const records = mapSynthesisPagesToDeepCrawledPages(synthesisPages);
    assert.equal(records[0]?.url, "https://example.com/");
    assert.equal(records[0]?.page_type, "homepage");
    assert.equal(records[0]?.meta_description, "Hair restoration clinic");
    assert.deepEqual(records[0]?.headings?.[0], {
      level: 1,
      text: "Services",
    });
    assert.equal(records[0]?.canonical_url, "https://example.com/");
    assert.equal(records[0]?.self_canonical, true);
    assert.equal(records[0]?.http_status, 200);
    assert.equal(records[0]?.html_language, "en");
    assert.ok((records[0]?.content_chars ?? 0) > 0);
    assert.equal(records[0]?.schema_summary?.types[0], "Organization");
    assert.equal(records[0]?.internal_link_count, 1);
    assert.equal(records[0]?.internal_links_sample?.[0]?.anchor, "About");
    assert.equal(records[0]?.robots_meta, "index,follow");
    assert.equal(records[0]?.image_alt?.missing_alt, 1);
    assert.equal(records[0]?.hreflang?.[0]?.hreflang, "en");
  });
});
