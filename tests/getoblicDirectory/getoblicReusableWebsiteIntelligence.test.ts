import "./getoblicDirectoryTestEnv";

import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, it } from "node:test";
import {
  findReusableWebsiteIntelligenceForListing,
  normalizeReusableWebsiteHost,
  resolveReusableWebsiteIntelligence,
  reusableWebsiteHostsMatch,
  sanitizeReusableWebsiteIntelligence,
  selectReusableWebsiteIntelligenceWinner,
  type ReusableWebsiteIntelligenceCandidate,
  type ReusableWebsiteIntelligenceLookup,
} from "../../services/getoblicDirectory/getoblicReusableWebsiteIntelligence";

const ROOT = process.cwd();
const ORG_A = "11111111-1111-1111-1111-111111111111";
const ORG_B = "22222222-2222-2222-2222-222222222222";
const ORG_C = "33333333-3333-3333-3333-333333333333";
const PROSPECT_A = "aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa";
const PROSPECT_C = "cccccccc-cccc-cccc-cccc-cccccccccccc";
const LISTING_ID = 4401;

function read(relativePath: string): string {
  return readFileSync(join(ROOT, relativePath), "utf8");
}

function deepWi(
  overrides: Record<string, unknown> = {},
): Record<string, unknown> {
  return {
    provider: "deep_v1",
    url: "https://www.acme.example/about",
    scraped_at: "2026-08-01T00:00:00.000Z",
    pages_analyzed: 6,
    about: "Deep about Acme",
    services: "Cuts and color",
    business_knowledge: { about: "Deep about Acme" },
    ...overrides,
  };
}

function homepageWi(
  overrides: Record<string, unknown> = {},
): Record<string, unknown> {
  return {
    provider: "homepage_only",
    url: "https://acme.example",
    scraped_at: "2026-08-02T00:00:00.000Z",
    about: "Homepage about Acme",
    services: "Cuts",
    ...overrides,
  };
}

function candidate(
  overrides: Partial<ReusableWebsiteIntelligenceCandidate> & {
    website_intelligence?: Record<string, unknown>;
  } = {},
): ReusableWebsiteIntelligenceCandidate {
  return {
    organizationId: ORG_A,
    prospectId: PROSPECT_A,
    website_intelligence: deepWi(),
    released_at: "2026-08-10T00:00:00.000Z",
    created_at: "2026-07-01T00:00:00.000Z",
    ...overrides,
  };
}

function lookupFrom(args: {
  links?: Array<{
    organization_id: string;
    prospect_id: string;
    wordpress_listing_id?: number;
    relationship_status?: string;
    released_at?: string | null;
    created_at?: string;
  }>;
  prospects?: Array<{
    id: string;
    organization_id: string;
    website_intelligence: unknown;
  }>;
}): ReusableWebsiteIntelligenceLookup {
  return {
    findReleasedHistoricalLinks: async (listingId, organizationId) =>
      (args.links ?? [])
        .filter(
          (link) =>
            (link.wordpress_listing_id ?? LISTING_ID) === listingId &&
            link.organization_id !== organizationId,
        )
        .map((link) => ({
          organization_id: link.organization_id,
          prospect_id: link.prospect_id,
          wordpress_listing_id: link.wordpress_listing_id ?? LISTING_ID,
          relationship_status: link.relationship_status ?? "released",
          released_at: link.released_at ?? "2026-08-10T00:00:00.000Z",
          created_at: link.created_at ?? "2026-07-01T00:00:00.000Z",
        })),
    loadProspectWebsiteIntelligence: async (ids) =>
      (args.prospects ?? []).filter((row) => ids.includes(row.id)),
  };
}

describe("reusable website host normalization", () => {
  it("matches www, protocol, path, and trailing-slash variants of the same host", () => {
    assert.equal(normalizeReusableWebsiteHost("https://www.acme.example/"), "acme.example");
    assert.equal(normalizeReusableWebsiteHost("http://ACME.example/about"), "acme.example");
    assert.equal(normalizeReusableWebsiteHost("acme.example"), "acme.example");
    assert.equal(
      reusableWebsiteHostsMatch("https://www.acme.example/path", "https://acme.example"),
      true,
    );
  });

  it("rejects empty, hostless, and mismatched hosts", () => {
    assert.equal(normalizeReusableWebsiteHost(null), null);
    assert.equal(normalizeReusableWebsiteHost("localhost"), null);
    assert.equal(
      reusableWebsiteHostsMatch("https://acme.example", "https://other.example"),
      false,
    );
  });
});

describe("reusable website intelligence sanitization", () => {
  it("accepts usable intelligence and strips tenant-identifying keys", () => {
    const sanitized = sanitizeReusableWebsiteIntelligence({
      ...deepWi(),
      organization_id: ORG_A,
      prospect_id: PROSPECT_A,
      source_prospect_id: PROSPECT_A,
      source_organization_id: ORG_A,
      user_id: "user-1",
      linked_discussion_id: "discussion-1",
    });
    assert.ok(sanitized);
    assert.equal(sanitized.provider, "deep_v1");
    assert.equal(sanitized.about, "Deep about Acme");
    assert.equal(sanitized.organization_id, undefined);
    assert.equal(sanitized.prospect_id, undefined);
    assert.equal(sanitized.source_prospect_id, undefined);
    assert.equal(sanitized.source_organization_id, undefined);
    assert.equal(sanitized.user_id, undefined);
    assert.equal(sanitized.linked_discussion_id, undefined);
  });

  it("rejects unusable or malformed intelligence", () => {
    assert.equal(sanitizeReusableWebsiteIntelligence(null), null);
    assert.equal(sanitizeReusableWebsiteIntelligence("nope"), null);
    assert.equal(sanitizeReusableWebsiteIntelligence([]), null);
    assert.equal(
      sanitizeReusableWebsiteIntelligence({
        provider: "homepage_only",
        url: "https://acme.example",
        scraped_at: "2026-08-01T00:00:00.000Z",
        about: "",
        services: "",
      }),
      null,
    );
  });
});

describe("reusable website intelligence winner selection", () => {
  it("prefers deep_v1 over homepage and never merges candidates", () => {
    const homepage = candidate({
      prospectId: PROSPECT_C,
      organizationId: ORG_C,
      website_intelligence: homepageWi({
        scraped_at: "2026-09-01T00:00:00.000Z",
        about: "Newer homepage",
      }),
      released_at: "2026-09-01T00:00:00.000Z",
    });
    const deep = candidate({
      website_intelligence: deepWi({ about: "Winning deep" }),
    });
    const winner = selectReusableWebsiteIntelligenceWinner([homepage, deep]);
    assert.equal(winner?.prospectId, PROSPECT_A);
    assert.equal(winner?.website_intelligence.about, "Winning deep");
    assert.equal(winner?.website_intelligence.provider, "deep_v1");
    assert.notEqual(winner?.website_intelligence.about, "Newer homepage");
  });

  it("prefers greater pages_analyzed among deep_v1 candidates", () => {
    const lower = candidate({
      prospectId: PROSPECT_A,
      website_intelligence: deepWi({ pages_analyzed: 3, about: "fewer pages" }),
      released_at: "2026-09-01T00:00:00.000Z",
    });
    const higher = candidate({
      prospectId: PROSPECT_C,
      organizationId: ORG_C,
      website_intelligence: deepWi({ pages_analyzed: 9, about: "more pages" }),
      released_at: "2026-07-01T00:00:00.000Z",
    });
    const winner = selectReusableWebsiteIntelligenceWinner([lower, higher]);
    assert.equal(winner?.website_intelligence.about, "more pages");
    assert.equal(winner?.website_intelligence.pages_analyzed, 9);
  });

  it("uses newer scraped_at as the next deep_v1 tie-break", () => {
    const older = candidate({
      prospectId: PROSPECT_A,
      website_intelligence: deepWi({
        pages_analyzed: 6,
        scraped_at: "2026-07-01T00:00:00.000Z",
        about: "older scrape",
      }),
    });
    const newer = candidate({
      prospectId: PROSPECT_C,
      organizationId: ORG_C,
      website_intelligence: deepWi({
        pages_analyzed: 6,
        scraped_at: "2026-08-15T00:00:00.000Z",
        about: "newer scrape",
      }),
    });
    const winner = selectReusableWebsiteIntelligenceWinner([older, newer]);
    assert.equal(winner?.website_intelligence.about, "newer scrape");
  });

  it("uses released_at then created_at as deterministic final tie-breaks", () => {
    const olderRelease = candidate({
      prospectId: PROSPECT_A,
      website_intelligence: deepWi({
        pages_analyzed: 6,
        scraped_at: "2026-08-01T00:00:00.000Z",
        about: "older release",
      }),
      released_at: "2026-08-01T00:00:00.000Z",
      created_at: "2026-08-01T00:00:00.000Z",
    });
    const newerRelease = candidate({
      prospectId: PROSPECT_C,
      organizationId: ORG_C,
      website_intelligence: deepWi({
        pages_analyzed: 6,
        scraped_at: "2026-08-01T00:00:00.000Z",
        about: "newer release",
      }),
      released_at: "2026-08-20T00:00:00.000Z",
      created_at: "2026-07-01T00:00:00.000Z",
    });
    assert.equal(
      selectReusableWebsiteIntelligenceWinner([olderRelease, newerRelease])
        ?.website_intelligence.about,
      "newer release",
    );

    const olderCreated = candidate({
      prospectId: PROSPECT_A,
      website_intelligence: homepageWi({
        scraped_at: "2026-08-01T00:00:00.000Z",
        about: "older created",
      }),
      released_at: "2026-08-10T00:00:00.000Z",
      created_at: "2026-07-01T00:00:00.000Z",
    });
    const newerCreated = candidate({
      prospectId: PROSPECT_C,
      organizationId: ORG_C,
      website_intelligence: homepageWi({
        scraped_at: "2026-08-01T00:00:00.000Z",
        about: "newer created",
      }),
      released_at: "2026-08-10T00:00:00.000Z",
      created_at: "2026-07-20T00:00:00.000Z",
    });
    assert.equal(
      selectReusableWebsiteIntelligenceWinner([olderCreated, newerCreated])
        ?.website_intelligence.about,
      "newer created",
    );
  });

  it("selects the newest homepage candidate when no deep_v1 exists", () => {
    const older = candidate({
      website_intelligence: homepageWi({
        scraped_at: "2026-07-01T00:00:00.000Z",
        about: "older homepage",
      }),
    });
    const newer = candidate({
      prospectId: PROSPECT_C,
      organizationId: ORG_C,
      website_intelligence: homepageWi({
        scraped_at: "2026-08-20T00:00:00.000Z",
        about: "newer homepage",
      }),
    });
    const winner = selectReusableWebsiteIntelligenceWinner([older, newer]);
    assert.equal(winner?.website_intelligence.about, "newer homepage");
    assert.equal(winner?.website_intelligence.provider, "homepage_only");
  });
});

describe("reusable website intelligence resolution", () => {
  it("copies one usable deep winner for an exact listing and matching host", async () => {
    const winner = await resolveReusableWebsiteIntelligence(
      {
        currentOrganizationId: ORG_B,
        wordpressListingId: LISTING_ID,
        currentWebsite: "https://acme.example",
      },
      lookupFrom({
        links: [
          { organization_id: ORG_A, prospect_id: PROSPECT_A },
          {
            organization_id: ORG_C,
            prospect_id: PROSPECT_C,
            released_at: "2026-09-01T00:00:00.000Z",
          },
        ],
        prospects: [
          {
            id: PROSPECT_A,
            organization_id: ORG_A,
            website_intelligence: deepWi({
              pages_analyzed: 8,
              about: "A deep",
            }),
          },
          {
            id: PROSPECT_C,
            organization_id: ORG_C,
            website_intelligence: homepageWi({ about: "C homepage" }),
          },
        ],
      }),
    );
    assert.ok(winner);
    assert.equal(winner.provider, "deep_v1");
    assert.equal(winner.about, "A deep");
    assert.equal(winner.pages_analyzed, 8);
    assert.equal(winner.prospect_id, undefined);
    assert.equal(winner.organization_id, undefined);
    assert.doesNotMatch(JSON.stringify(winner), new RegExp(ORG_A));
    assert.doesNotMatch(JSON.stringify(winner), new RegExp(PROSPECT_A));
  });

  it("copies homepage intelligence when it is the only usable host match", async () => {
    const winner = await resolveReusableWebsiteIntelligence(
      {
        currentOrganizationId: ORG_B,
        wordpressListingId: LISTING_ID,
        currentWebsite: "https://www.acme.example",
      },
      lookupFrom({
        links: [{ organization_id: ORG_A, prospect_id: PROSPECT_A }],
        prospects: [
          {
            id: PROSPECT_A,
            organization_id: ORG_A,
            website_intelligence: homepageWi(),
          },
        ],
      }),
    );
    assert.ok(winner);
    assert.equal(winner.provider, "homepage_only");
    assert.equal(winner.about, "Homepage about Acme");
  });

  it("skips host mismatch, missing website, unusable intelligence, and same-org rows", async () => {
    const mismatch = await resolveReusableWebsiteIntelligence(
      {
        currentOrganizationId: ORG_B,
        wordpressListingId: LISTING_ID,
        currentWebsite: "https://acme.example",
      },
      lookupFrom({
        links: [{ organization_id: ORG_A, prospect_id: PROSPECT_A }],
        prospects: [
          {
            id: PROSPECT_A,
            organization_id: ORG_A,
            website_intelligence: deepWi({ url: "https://other.example" }),
          },
        ],
      }),
    );
    assert.equal(mismatch, null);

    const noWebsite = await resolveReusableWebsiteIntelligence(
      {
        currentOrganizationId: ORG_B,
        wordpressListingId: LISTING_ID,
        currentWebsite: null,
      },
      lookupFrom({
        links: [{ organization_id: ORG_A, prospect_id: PROSPECT_A }],
        prospects: [
          {
            id: PROSPECT_A,
            organization_id: ORG_A,
            website_intelligence: deepWi(),
          },
        ],
      }),
    );
    assert.equal(noWebsite, null);

    const unusable = await resolveReusableWebsiteIntelligence(
      {
        currentOrganizationId: ORG_B,
        wordpressListingId: LISTING_ID,
        currentWebsite: "https://acme.example",
      },
      lookupFrom({
        links: [{ organization_id: ORG_A, prospect_id: PROSPECT_A }],
        prospects: [
          {
            id: PROSPECT_A,
            organization_id: ORG_A,
            website_intelligence: { provider: "homepage_only", url: "https://acme.example" },
          },
        ],
      }),
    );
    assert.equal(unusable, null);

    const sameOrg = await resolveReusableWebsiteIntelligence(
      {
        currentOrganizationId: ORG_B,
        wordpressListingId: LISTING_ID,
        currentWebsite: "https://acme.example",
      },
      lookupFrom({
        links: [{ organization_id: ORG_B, prospect_id: PROSPECT_A }],
        prospects: [
          {
            id: PROSPECT_A,
            organization_id: ORG_B,
            website_intelligence: deepWi(),
          },
        ],
      }),
    );
    assert.equal(sameOrg, null);
  });

  it("returns null when historical intelligence is absent", async () => {
    const winner = await resolveReusableWebsiteIntelligence(
      {
        currentOrganizationId: ORG_B,
        wordpressListingId: LISTING_ID,
        currentWebsite: "https://acme.example",
      },
      lookupFrom({ links: [], prospects: [] }),
    );
    assert.equal(winner, null);
  });

  it("fails open when the privileged lookup throws", async () => {
    const winner = await findReusableWebsiteIntelligenceForListing(
      {
        currentOrganizationId: ORG_B,
        wordpressListingId: LISTING_ID,
        currentWebsite: "https://acme.example",
      },
      {
        findReleasedHistoricalLinks: async () => {
          throw new Error("cross-org lookup exploded");
        },
        loadProspectWebsiteIntelligence: async () => {
          throw new Error("must not load prospects");
        },
      },
    );
    assert.equal(winner, null);
  });
});

describe("reusable website intelligence source contract", () => {
  it("keeps privileged access in the reuse service and does not scrape or generate", () => {
    const service = read(
      "services/getoblicDirectory/getoblicReusableWebsiteIntelligence.ts",
    );
    const convert = read(
      "services/getoblicDirectory/getoblicDirectoryConvertService.ts",
    );
    const claim = read(
      "services/getoblicDirectory/getoblicDirectoryClaimService.ts",
    );
    const importer = read("services/prospects/prospectImporter.ts");
    const prospectService = read("services/prospects/prospectService.ts");
    const manualRoute = read("app/api/prospects/route.ts");

    assert.match(service, /id, organization_id, website_intelligence/);
    assert.match(service, /relationship_status", "released"/);
    assert.match(service, /websiteIntelligenceHasUsableContent/);
    assert.match(service, /DEEP_WEBSITE_INTELLIGENCE_PROVIDER/);
    assert.doesNotMatch(service, /scrapeHomepageIntelligence/);
    assert.doesNotMatch(service, /ensureProspectGenerationQueued/);
    assert.doesNotMatch(service, /OpenRouter|openrouter|gemini/i);
    assert.match(service, /TENANT_IDENTIFYING_KEYS/);
    assert.doesNotMatch(service, /create table/i);

    assert.match(convert, /findReusableWebsiteIntelligence/);
    assert.match(convert, /hydrateReusableWebsiteIntelligenceIfEligible/);
    assert.match(convert, /if \(args\.created\)/);
    assert.doesNotMatch(convert, /scrapeHomepageIntelligence/);
    assert.doesNotMatch(convert, /OpenRouter|openrouter|gemini/i);

    assert.doesNotMatch(claim, /findReusableWebsiteIntelligence/);
    assert.doesNotMatch(importer, /getoblicReusableWebsiteIntelligence/);
    assert.doesNotMatch(prospectService, /getoblicReusableWebsiteIntelligence/);
    assert.doesNotMatch(manualRoute, /getoblicReusableWebsiteIntelligence/);
    assert.doesNotMatch(prospectService, /getProspectsWithoutOrganization/);
  });
});
