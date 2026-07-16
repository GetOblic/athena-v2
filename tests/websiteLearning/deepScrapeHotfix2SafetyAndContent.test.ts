import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, it } from "node:test";

import {
  DEEP_SCRAPE_CRAWL_POLICY,
  evaluateCorpusUsefulness,
  evaluateExtractedPageUsefulness,
} from "../../services/websiteLearning/deepScrape/crawlPolicy";
import { formatDeepScrapeErrorMessage } from "../../services/websiteLearning/deepScrape/deepScrapeJobTypes";
import {
  classifyIpAddress,
  isPrivateOrLocalIp,
  normalizeIpLiteral,
} from "../../services/websiteLearning/deepScrape/urlSafety";

const ROOT = process.cwd();

describe("Deep scrape hotfix 2 — URL safety classifications", () => {
  it("1. public IPv4 accepted", () => {
    assert.equal(classifyIpAddress("8.8.8.8"), "public_ipv4");
    assert.equal(isPrivateOrLocalIp("8.8.8.8"), false);
  });

  it("2/3. public and compressed public IPv6 accepted", () => {
    assert.equal(classifyIpAddress("2001:4860:4860::8888"), "public_ipv6");
    assert.equal(isPrivateOrLocalIp("2001:4860:4860::8888"), false);
    assert.equal(classifyIpAddress("2606:4700:4700::1111"), "public_ipv6");
    assert.equal(classifyIpAddress("2001:4860:4860:0:0:0:0:8888"), "public_ipv6");
  });

  it("4/5. IPv4-mapped public accepted; mapped private rejected", () => {
    assert.equal(classifyIpAddress("::ffff:8.8.8.8"), "ipv4_mapped_public");
    assert.equal(isPrivateOrLocalIp("::ffff:8.8.8.8"), false);
    assert.equal(classifyIpAddress("::ffff:192.168.1.10"), "ipv4_mapped_private");
    assert.equal(isPrivateOrLocalIp("::ffff:192.168.1.10"), true);
    assert.equal(classifyIpAddress("::ffff:10.0.0.1"), "ipv4_mapped_private");
  });

  it("6-9. IPv4 loopback, RFC1918, link-local, metadata rejected", () => {
    assert.equal(classifyIpAddress("127.0.0.1"), "loopback_ipv4");
    assert.equal(classifyIpAddress("10.1.2.3"), "private_ipv4");
    assert.equal(classifyIpAddress("172.16.0.1"), "private_ipv4");
    assert.equal(classifyIpAddress("192.168.0.5"), "private_ipv4");
    assert.equal(classifyIpAddress("169.254.1.1"), "link_local_ipv4");
    assert.equal(classifyIpAddress("169.254.169.254"), "metadata_ipv4");
    assert.equal(classifyIpAddress("100.64.0.1"), "cgnat_ipv4");
    assert.ok(isPrivateOrLocalIp("127.0.0.1"));
    assert.ok(isPrivateOrLocalIp("192.168.1.1"));
    assert.ok(isPrivateOrLocalIp("169.254.169.254"));
  });

  it("10-13. IPv6 loopback, ULA, link-local, multicast rejected", () => {
    assert.equal(classifyIpAddress("::1"), "loopback_ipv6");
    assert.equal(classifyIpAddress("fe80::1"), "link_local_ipv6");
    assert.equal(classifyIpAddress("fc00::1"), "ula_ipv6");
    assert.equal(classifyIpAddress("fd12:3456:789a::1"), "ula_ipv6");
    assert.equal(classifyIpAddress("ff02::1"), "multicast_ipv6");
    assert.ok(isPrivateOrLocalIp("::1"));
    assert.ok(isPrivateOrLocalIp("fe80::1"));
    assert.ok(isPrivateOrLocalIp("fc00::1"));
    assert.ok(isPrivateOrLocalIp("ff02::1"));
  });

  it("14/17/18. mixed policy, private literals, malformed literals", () => {
    assert.equal(isPrivateOrLocalIp("8.8.8.8"), false);
    assert.equal(isPrivateOrLocalIp("10.0.0.1"), true);
    assert.equal(classifyIpAddress("not-an-ip"), "malformed");
    assert.equal(classifyIpAddress("::::"), "malformed");
    assert.equal(normalizeIpLiteral("FE80::1%eth0"), "fe80::1");
    assert.equal(classifyIpAddress("FE80::1%eth0"), "link_local_ipv6");
    assert.ok(isPrivateOrLocalIp("192.0.2.1"));
    assert.ok(isPrivateOrLocalIp("203.0.113.10"));
  });

  it("15/16. redirect and same-domain safety remain in SSRF boundary", () => {
    const safeFetch = readFileSync(
      path.join(ROOT, "services/websiteLearning/deepScrape/safeFetch.ts"),
      "utf8",
    );
    const cheerio = readFileSync(
      path.join(
        ROOT,
        "services/websiteLearning/deepScrape/crawler/cheerioCrawler.ts",
      ),
      "utf8",
    );
    assert.match(safeFetch, /assertPublicHostname/);
    assert.match(safeFetch, /isSameRegistrableDomain/);
    assert.match(safeFetch, /redirectDepth:\s*hop/);
    assert.match(safeFetch, /CROSS_DOMAIN_REJECTED/);
    assert.match(cheerio, /assertPublicHostname/);
    assert.match(cheerio, /followRedirect\s*=\s*false/);
  });

  it("19. URL-safety diagnostics contain classifications and no page content", () => {
    const urlSafety = readFileSync(
      path.join(ROOT, "services/websiteLearning/deepScrape/urlSafety.ts"),
      "utf8",
    );
    const observability = readFileSync(
      path.join(ROOT, "services/websiteLearning/deepScrape/observability.ts"),
      "utf8",
    );
    assert.match(observability, /deep_scrape_url_safety_diagnostic/);
    assert.match(urlSafety, /deep_scrape_url_safety_diagnostic/);
    assert.match(urlSafety, /classifications/);
    assert.match(urlSafety, /fetchPurpose/);
    assert.match(urlSafety, /rejected/);
    assert.match(urlSafety, /rejectionCode/);
    assert.match(urlSafety, /dnsResultCount/);
    assert.doesNotMatch(urlSafety, /bodyText|page body|rawHtml/i);
    assert.doesNotMatch(urlSafety, /value\.includes\(":"\)\s*return\s*true/);
    assert.match(urlSafety, /BlockList/);
  });
});

describe("Deep scrape hotfix 2 — content acceptance policy", () => {
  it("20-24. concise legitimate business pages are accepted", () => {
    const service = evaluateExtractedPageUsefulness({
      title: "Scalp Micropigmentation",
      headings: ["Our Services"],
      metaDescription: "SMP treatments in London",
      text: "We offer scalp micropigmentation for hair loss.",
      pageType: "services",
    });
    assert.equal(service.accepted, true);
    assert.equal(service.rejectionCode, null);
    assert.notEqual(service.rejectionCode, "PAGE_TOO_THIN");

    const bio = evaluateExtractedPageUsefulness({
      title: "Meet the Team",
      headings: ["Dr. Avery"],
      text: "Dr. Avery leads our clinic with 12 years of SMP experience.",
      pageType: "team",
    });
    assert.equal(bio.accepted, true);

    const contact = evaluateExtractedPageUsefulness({
      title: "Contact",
      headings: ["Visit Us"],
      text: "Email hello@apexscalpclinic.com Phone +44 20 1234 5678 London clinic.",
      pageType: "contact",
    });
    assert.equal(contact.accepted, true);
    assert.ok(contact.businessSignals.includes("email"));
    assert.ok(contact.businessSignals.includes("phone"));

    const location = evaluateExtractedPageUsefulness({
      title: "Location",
      headings: ["Find us"],
      text: "Visit 12 Harley Street London for consultations and aftercare.",
      pageType: "contact",
    });
    assert.equal(location.accepted, true);

    const brochure = evaluateExtractedPageUsefulness({
      title: "Apex Scalp Clinic",
      headings: ["Natural looking hair restoration"],
      metaDescription: "Scalp micropigmentation clinic",
      text: "Book a consultation for density and hairline treatments.",
      pageType: "homepage",
    });
    assert.equal(brochure.accepted, true);
  });

  it("25. multiple concise pages form a valid combined corpus", () => {
    const pages = [
      { title: "Home", text: "Apex Scalp Clinic restores confidence with SMP." },
      { title: "Services", text: "Hairline design and density treatments." },
      { title: "Contact", text: "Book online or call our London clinic team." },
    ];
    const corpus = evaluateCorpusUsefulness(pages);
    assert.equal(corpus.useful, true);
    assert.equal(corpus.code, "OK");
    assert.equal(corpus.acceptedPageCount, 3);
  });

  it("26-36. empty/nav/cookie/login/denied/error/parked/sale/coming-soon/js/captcha rejected", () => {
    assert.equal(
      evaluateExtractedPageUsefulness({ text: "" }).rejectionCode,
      "PAGE_EMPTY",
    );
    assert.equal(
      evaluateExtractedPageUsefulness({
        text: "Home About Services Contact Menu Login Search",
      }).rejectionCode,
      "PAGE_NAVIGATION_ONLY",
    );
    assert.equal(
      evaluateExtractedPageUsefulness({
        text: "Accept all cookies to continue browsing this site.",
      }).rejectionCode,
      "PAGE_COOKIE_WALL_ONLY",
    );
    assert.equal(
      evaluateExtractedPageUsefulness({
        text: "Please log in to continue to your account dashboard.",
      }).rejectionCode,
      "PAGE_LOGIN_GATE",
    );
    assert.equal(
      evaluateExtractedPageUsefulness({
        text: "403 Forbidden. Access denied by policy.",
      }).rejectionCode,
      "PAGE_ACCESS_DENIED",
    );
    assert.equal(
      evaluateExtractedPageUsefulness({
        text: "500 Internal Server Error. Please try again later.",
      }).rejectionCode,
      "PAGE_SERVER_ERROR",
    );
    assert.equal(
      evaluateExtractedPageUsefulness({
        text: "This domain is parked. Parked page placeholder.",
      }).rejectionCode,
      "PAGE_PARKED_DOMAIN",
    );
    assert.equal(
      evaluateExtractedPageUsefulness({
        text: "This domain is for sale. Buy this domain today.",
      }).rejectionCode,
      "PAGE_DOMAIN_FOR_SALE",
    );
    assert.equal(
      evaluateExtractedPageUsefulness({
        text: "Coming soon. Under construction.",
      }).rejectionCode,
      "PAGE_COMING_SOON",
    );
    assert.equal(
      evaluateExtractedPageUsefulness({
        text: "Please enable JavaScript to continue using this application.",
      }).rejectionCode,
      "PAGE_JS_SHELL",
    );
    assert.equal(
      evaluateExtractedPageUsefulness({
        text: "Verify you are human. Captcha challenge required.",
      }).rejectionCode,
      "PAGE_CAPTCHA",
    );
  });

  it("37/38. duplicates excluded; never labeled PAGE_TOO_THIN", () => {
    const seen = new Set<string>();
    const first = evaluateExtractedPageUsefulness({
      title: "Services",
      text: "Scalp micropigmentation density treatment details for clients.",
      pageType: "services",
      seenFingerprints: seen,
    });
    assert.equal(first.accepted, true);
    seen.add(first.duplicateFingerprint!);
    const dup = evaluateExtractedPageUsefulness({
      title: "Services",
      text: "Scalp micropigmentation density treatment details for clients.",
      pageType: "services",
      seenFingerprints: seen,
    });
    assert.equal(dup.rejectionCode, "PAGE_DUPLICATE");
    assert.notEqual(dup.rejectionCode, "PAGE_TOO_THIN");
    assert.notEqual(first.rejectionCode, "PAGE_TOO_THIN");
  });

  it("39/40. synthesis path and precise corpus failure codes", () => {
    assert.equal(evaluateCorpusUsefulness([]).code, "NO_USABLE_PAGES");
    assert.equal(
      evaluateCorpusUsefulness([{ title: "x", text: "hi" }]).code,
      "EMPTY_OR_UNUSABLE_CORPUS",
    );
    const engine = readFileSync(
      path.join(ROOT, "services/websiteLearning/deepScrape/crawlEngine.ts"),
      "utf8",
    );
    const adapter = readFileSync(
      path.join(
        ROOT,
        "services/websiteLearning/deepScrape/crawler/crawleeAdapter.ts",
      ),
      "utf8",
    );
    assert.match(adapter, /evaluateCorpusUsefulness/);
    assert.match(engine, /synthesizeDeepWebsiteIntelligence/);
    assert.match(engine, /synthesisInvoked:\s*true/);
  });

  it("41-48. phase B, caps, and unchanged flows remain wired", () => {
    assert.equal(DEEP_SCRAPE_CRAWL_POLICY.maxMeaningfulPages, 25);
    const engine = readFileSync(
      path.join(ROOT, "services/websiteLearning/deepScrape/crawlEngine.ts"),
      "utf8",
    );
    const adapter = readFileSync(
      path.join(
        ROOT,
        "services/websiteLearning/deepScrape/crawler/crawleeAdapter.ts",
      ),
      "utf8",
    );
    const synthesize = readFileSync(
      path.join(ROOT, "services/websiteLearning/deepScrape/synthesize.ts"),
      "utf8",
    );
    const executor = readFileSync(
      path.join(ROOT, "services/websiteLearning/deepScrape/deepScrapeExecutor.ts"),
      "utf8",
    );
    const identity = readFileSync(
      path.join(ROOT, "services/identity/identityService.ts"),
      "utf8",
    );
    const refresh = readFileSync(
      path.join(ROOT, "app/api/prospects/[id]/refresh/route.ts"),
      "utf8",
    );

    assert.match(synthesize, /generationKind:\s*"identity_profile"/);
    assert.match(executor, /compileMasterIdentityProfile/);
    assert.match(executor, /prospect_deep_scrape/);
    assert.match(executor, /NO_USABLE_PAGES/);
    assert.match(executor, /EMPTY_OR_UNUSABLE_CORPUS/);
    assert.doesNotMatch(identity, /runDeepWebsiteCrawl/);
    assert.doesNotMatch(refresh, /runDeepWebsiteCrawl/);
    assert.doesNotMatch(engine, /PAGE_TOO_THIN/);
    assert.doesNotMatch(adapter, /PAGE_TOO_THIN/);
    assert.match(adapter, /rejectedByReason/);
    assert.match(engine, /candidatesDiscovered/);
    assert.match(engine, /pagesAccepted/);
    assert.match(engine, /combinedExtractedChars/);
  });

  it("readable UI messages for key failure codes", () => {
    assert.match(
      formatDeepScrapeErrorMessage("PRIVATE_IP_REJECTED"),
      /protected network address/i,
    );
    assert.match(
      formatDeepScrapeErrorMessage("NO_USABLE_PAGES"),
      /could not find any readable business pages/i,
    );
    assert.match(
      formatDeepScrapeErrorMessage("EMPTY_OR_UNUSABLE_CORPUS"),
      /usable business content/i,
    );
    assert.match(
      formatDeepScrapeErrorMessage("ROBOTS_DENIED"),
      /does not permit automated crawling/i,
    );
  });
});
