import "./licenseeAuthTestEnv";

import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, it } from "node:test";
import { hasSuccessfulAthenaTraining } from "../../components/identity/identityPagePresentation";
import { sanitizeReusableWebsiteIntelligence } from "../../services/getoblicDirectory/getoblicReusableWebsiteIntelligence";
import {
  hydrateLicenseeProspectClientIntelligence,
  identityWebsiteIntelligenceIsProtected,
  isClientIdentityMutationBlocked,
  type HydrationIdentitySnapshot,
  type LicenseeProspectClientIntelligenceHydrationStore,
  type UntrainedIdentityInsert,
} from "../../services/licensee/licenseeProspectClientIntelligenceHydration";
import { isDeepWebsiteIntelligence } from "../../services/websiteLearning/deepScrape/deepWebsiteIntelligence";

const ROOT = process.cwd();
const CLIENT_ORG = "44444444-4444-4444-8444-444444444444";
const OWNER_ID = "a1a1a1a1-a1a1-4a1a-8a1a-a1a1a1a1a1a1";
const IDENTITY_ID = "id-1";

function read(relativePath: string): string {
  return readFileSync(join(ROOT, relativePath), "utf8");
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

function deepWi(
  overrides: Record<string, unknown> = {},
): Record<string, unknown> {
  return {
    provider: "deep_v1",
    url: "https://www.acme.example/about",
    scraped_at: "2026-08-01T00:00:00.000Z",
    pages_analyzed: 6,
    pages: [{ url: "https://acme.example", title: "Home", page_type: "home", excerpt: "Hi" }],
    about: "Deep about Acme",
    services: "Cuts and color",
    business_knowledge: { about: "Deep about Acme", services: "Cuts and color" },
    crawl_summary: { pages_analyzed: 6 },
    ...overrides,
  };
}

function identitySnapshot(
  overrides: Partial<HydrationIdentitySnapshot> = {},
): HydrationIdentitySnapshot {
  return {
    id: IDENTITY_ID,
    user_id: OWNER_ID,
    organization_id: CLIENT_ORG,
    website: null,
    website_intelligence: null,
    greeting_name: null,
    about_you: null,
    expertise: null,
    brain_status: "pending",
    brain_last_updated: null,
    master_profile: null,
    master_profile_version: null,
    master_profile_generated_at: null,
    last_deep_scrape_at: null,
    last_deep_scrape_pages: null,
    ...overrides,
  };
}

type MemoryStore = LicenseeProspectClientIntelligenceHydrationStore & {
  identities: HydrationIdentitySnapshot[];
  inserts: UntrainedIdentityInsert[];
  updates: Array<Record<string, unknown>>;
  ownerUserId: string | null;
  insertError: { code?: string } | null;
  updateError: Error | null;
};

function memoryStore(
  overrides: Partial<Omit<MemoryStore, keyof LicenseeProspectClientIntelligenceHydrationStore>> & {
    identities?: HydrationIdentitySnapshot[];
    ownerUserId?: string | null;
  } = {},
): MemoryStore {
  const store: MemoryStore = {
    identities: overrides.identities ? [...overrides.identities] : [],
    inserts: [],
    updates: [],
    ownerUserId: overrides.ownerUserId === undefined ? OWNER_ID : overrides.ownerUserId,
    insertError: null,
    updateError: null,
    async loadOwnerUserId() {
      return store.ownerUserId;
    },
    async loadIdentity() {
      return store.identities[0] ?? null;
    },
    async insertUntrainedIdentity(row) {
      if (store.insertError) {
        throw store.insertError;
      }
      store.inserts.push(row);
      store.identities.push(
        identitySnapshot({
          ...row,
          website_intelligence: row.website_intelligence,
        }),
      );
    },
    async updateEmptyIdentityFields(input) {
      if (store.updateError) {
        throw store.updateError;
      }
      store.updates.push({ ...input });
      const existing = store.identities[0];
      if (!existing) {
        return;
      }
      if ("website" in input) {
        existing.website = input.website ?? null;
      }
      if ("websiteIntelligence" in input) {
        existing.website_intelligence = input.websiteIntelligence ?? null;
      }
    },
  };
  return store;
}

describe("BIC-1 hydration allowlist", () => {
  it("copies normalized website and sanitized homepage_only WI into a new untrained Identity", async () => {
    const store = memoryStore();
    const result = await hydrateLicenseeProspectClientIntelligence(
      {
        clientOrganizationId: CLIENT_ORG,
        website: "acme.example",
        websiteIntelligence: homepageWi({
          prospect_id: "prospect-a",
          organization_id: "org-a",
          user_id: "user-a",
          community_id: "community-a",
          linked_discussion_id: "discussion-a",
          source_prospect_id: "source-p",
          source_organization_id: "source-org",
        }),
      },
      store,
    );

    assert.equal(result.state, "initialized");
    assert.equal(result.identityCreated, true);
    assert.equal(result.websiteFilled, true);
    assert.equal(result.websiteIntelligenceFilled, true);
    assert.equal(store.inserts.length, 1);
    const inserted = store.inserts[0];
    assert.equal(inserted.website, "https://acme.example");
    assert.equal(inserted.website_intelligence?.provider, "homepage_only");
    assert.equal(inserted.website_intelligence?.url, "https://acme.example");
    assert.equal(
      inserted.website_intelligence?.scraped_at,
      "2026-08-02T00:00:00.000Z",
    );
    assert.equal(inserted.website_intelligence?.about, "Homepage about Acme");
    assert.equal(inserted.website_intelligence?.prospect_id, undefined);
    assert.equal(inserted.website_intelligence?.organization_id, undefined);
    assert.equal(inserted.website_intelligence?.user_id, undefined);
    assert.equal(inserted.website_intelligence?.community_id, undefined);
    assert.equal(inserted.website_intelligence?.linked_discussion_id, undefined);
    assert.equal(inserted.website_intelligence?.source_prospect_id, undefined);
    assert.equal(
      inserted.website_intelligence?.source_organization_id,
      undefined,
    );
    assert.equal(inserted.greeting_name, null);
    assert.equal(inserted.about_you, null);
    assert.equal(inserted.expertise, null);
    assert.equal(inserted.brain_status, "pending");
    assert.equal(inserted.brain_last_updated, null);
    assert.equal(inserted.master_profile, null);
    assert.equal(inserted.master_profile_version, null);
    assert.equal(inserted.master_profile_generated_at, null);
    assert.equal(inserted.last_deep_scrape_at, null);
    assert.equal(inserted.last_deep_scrape_pages, null);
    assert.equal(
      hasSuccessfulAthenaTraining({
        ...inserted,
        id: IDENTITY_ID,
        created_at: "2026-09-16T00:00:00.000Z",
        updated_at: "2026-09-16T00:00:00.000Z",
        website_intelligence: inserted.website_intelligence,
      }),
      false,
    );
    assert.deepEqual(
      inserted.website_intelligence,
      sanitizeReusableWebsiteIntelligence(
        homepageWi({
          prospect_id: "prospect-a",
          organization_id: "org-a",
          user_id: "user-a",
          community_id: "community-a",
          linked_discussion_id: "discussion-a",
          source_prospect_id: "source-p",
          source_organization_id: "source-org",
        }),
      ),
    );
  });

  it("copies usable deep_v1 WI and preserves provider, url, scraped_at, and deep fields", async () => {
    const store = memoryStore();
    const source = deepWi({
      prospect_id: "prospect-a",
      pages_analyzed: 8,
    });
    const result = await hydrateLicenseeProspectClientIntelligence(
      {
        clientOrganizationId: CLIENT_ORG,
        website: "https://acme.example",
        websiteIntelligence: source,
      },
      store,
    );

    assert.equal(result.state, "initialized");
    const copied = store.inserts[0].website_intelligence;
    assert.equal(copied?.provider, "deep_v1");
    assert.equal(copied?.url, "https://www.acme.example/about");
    assert.equal(copied?.scraped_at, "2026-08-01T00:00:00.000Z");
    assert.equal(copied?.pages_analyzed, 8);
    assert.ok(copied?.business_knowledge);
    assert.ok(copied?.pages);
    assert.equal(copied?.prospect_id, undefined);
    assert.equal(isDeepWebsiteIntelligence(copied), true);
    assert.equal(store.inserts[0].last_deep_scrape_at, null);
    assert.equal(store.inserts[0].last_deep_scrape_pages, null);
  });

  it("creates Identity with website only when WI is missing or unusable", async () => {
    const store = memoryStore();
    const result = await hydrateLicenseeProspectClientIntelligence(
      {
        clientOrganizationId: CLIENT_ORG,
        website: "https://acme.example",
        websiteIntelligence: { summary: "do not copy", provider: "homepage_only" },
      },
      store,
    );

    assert.equal(result.state, "initialized");
    assert.equal(store.inserts[0].website, "https://acme.example");
    assert.equal(store.inserts[0].website_intelligence, null);
    assert.equal(result.websiteIntelligenceFilled, false);
  });

  it("does not create an empty Identity when website and usable WI are both absent", async () => {
    const store = memoryStore();
    const result = await hydrateLicenseeProspectClientIntelligence(
      {
        clientOrganizationId: CLIENT_ORG,
        website: "   ",
        websiteIntelligence: { summary: "do not copy" },
      },
      store,
    );

    assert.equal(result.state, "noop");
    assert.equal(store.inserts.length, 0);
    assert.equal(store.identities.length, 0);
  });
});

describe("BIC-1 negative / private data", () => {
  it("hydrates only website and sanitized WI columns", async () => {
    const store = memoryStore();
    await hydrateLicenseeProspectClientIntelligence(
      {
        clientOrganizationId: CLIENT_ORG,
        website: "https://acme.example",
        websiteIntelligence: homepageWi(),
      },
      store,
    );

    const inserted = store.inserts[0];
    assert.deepEqual(Object.keys(inserted).sort(), [
      "about_you",
      "brain_last_updated",
      "brain_status",
      "expertise",
      "greeting_name",
      "last_deep_scrape_at",
      "last_deep_scrape_pages",
      "master_profile",
      "master_profile_generated_at",
      "master_profile_version",
      "organization_id",
      "user_id",
      "website",
      "website_intelligence",
    ]);
    assert.equal("notes" in inserted, false);
    assert.equal("additional_context" in inserted, false);
    assert.equal("email" in inserted, false);
    assert.equal("phone" in inserted, false);
    assert.equal("raw_json" in inserted, false);
    assert.equal("linked_discussion_id" in inserted, false);
  });

  it("does not copy notes, EI, CRM, discussions, or raw_json into Identity", () => {
    const source = read(
      "services/licensee/licenseeProspectClientIntelligenceHydration.ts",
    );
    assert.match(source, /sanitizeReusableWebsiteIntelligence/);
    assert.doesNotMatch(source, /notes|additional_context|ads_content|pain_points/);
    assert.doesNotMatch(
      source,
      /first_name|last_name|external_contact_id|decision_maker|job_title|whatsapp/,
    );
    assert.doesNotMatch(source, /raw_json|generated_listing_description/);
    assert.doesNotMatch(
      source,
      /opportunity_score|lifecycle_status|linked_discussion_id/,
    );
    assert.doesNotMatch(source, /from\("prospects"\)/);
    assert.doesNotMatch(source, /from\("discussions"\)/);
    assert.doesNotMatch(
      source,
      /from\("athena_executive_intelligence_versions"\)/,
    );
    assert.doesNotMatch(source, /select\(\s*["']\*["']\s*\)/);
    assert.match(source, /ATHENA_IDENTITY_HYDRATION_SELECT/);
  });
});

describe("BIC-1 training / zero-generation", () => {
  it("keeps new Identity untrained and never calls Train or Deep Scrape", () => {
    const source = read(
      "services/licensee/licenseeProspectClientIntelligenceHydration.ts",
    );
    assert.doesNotMatch(source, /upsertAthenaIdentity|compileMasterIdentityProfile/);
    assert.doesNotMatch(source, /generateReview|openrouter|OpenRouter/i);
    assert.doesNotMatch(
      source,
      /athena_website_deep_scrape_jobs|deepScrapeExecutor/,
    );
    assert.doesNotMatch(source, /from\("athena_getoblic_listing_links"\)/);
    assert.match(source, /brain_status: "pending"/);
  });
});

describe("BIC-1 idempotency / overwrite", () => {
  it("does not duplicate Identity on a second hydrate", async () => {
    const store = memoryStore();
    const input = {
      clientOrganizationId: CLIENT_ORG,
      website: "https://acme.example",
      websiteIntelligence: homepageWi(),
    };
    await hydrateLicenseeProspectClientIntelligence(input, store);
    const second = await hydrateLicenseeProspectClientIntelligence(input, store);

    assert.equal(store.inserts.length, 1);
    assert.equal(second.state, "noop");
    assert.equal(second.identityCreated, false);
    assert.equal(store.updates.length, 0);
  });

  it("repairs a missing Identity on retry after a previous insert failure", async () => {
    const store = memoryStore();
    store.insertError = { code: "40001" };
    await assert.rejects(() =>
      hydrateLicenseeProspectClientIntelligence(
        {
          clientOrganizationId: CLIENT_ORG,
          website: "https://acme.example",
          websiteIntelligence: homepageWi(),
        },
        store,
      ),
    );
    assert.equal(store.identities.length, 0);

    store.insertError = null;
    const repaired = await hydrateLicenseeProspectClientIntelligence(
      {
        clientOrganizationId: CLIENT_ORG,
        website: "https://acme.example",
        websiteIntelligence: homepageWi(),
      },
      store,
    );
    assert.equal(repaired.state, "initialized");
    assert.equal(repaired.identityCreated, true);
    assert.equal(store.inserts.length, 1);
  });

  it("fill-empties website onto an untrained Identity that has none", async () => {
    const store = memoryStore({
      identities: [identitySnapshot({ website_intelligence: homepageWi() })],
    });
    const result = await hydrateLicenseeProspectClientIntelligence(
      {
        clientOrganizationId: CLIENT_ORG,
        website: "https://acme.example",
        websiteIntelligence: homepageWi({ about: "Newer" }),
      },
      store,
    );

    assert.equal(result.state, "initialized");
    assert.equal(result.websiteFilled, true);
    assert.equal(result.websiteIntelligenceFilled, false);
    assert.equal(store.updates.length, 1);
    assert.equal(store.updates[0].website, "https://acme.example");
    assert.equal("websiteIntelligence" in store.updates[0], false);
  });

  it("does not overwrite existing website or usable WI on reconversion", async () => {
    const existingWi = homepageWi({ about: "Client already has this" });
    const store = memoryStore({
      identities: [
        identitySnapshot({
          website: "https://client.example",
          website_intelligence: existingWi,
        }),
      ],
    });
    const result = await hydrateLicenseeProspectClientIntelligence(
      {
        clientOrganizationId: CLIENT_ORG,
        website: "https://prospect.example",
        websiteIntelligence: homepageWi({ about: "Prospect WI" }),
      },
      store,
    );

    assert.equal(result.state, "noop");
    assert.equal(store.updates.length, 0);
    assert.equal(store.identities[0].website, "https://client.example");
    assert.equal(
      (store.identities[0].website_intelligence as { about?: string }).about,
      "Client already has this",
    );
  });

  it("never downgrades existing deep_v1 with homepage_only", async () => {
    const store = memoryStore({
      identities: [
        identitySnapshot({
          website: "https://acme.example",
          website_intelligence: deepWi(),
        }),
      ],
    });
    const result = await hydrateLicenseeProspectClientIntelligence(
      {
        clientOrganizationId: CLIENT_ORG,
        website: "https://other.example",
        websiteIntelligence: homepageWi(),
      },
      store,
    );

    assert.equal(result.state, "noop");
    assert.equal(store.updates.length, 0);
    assert.equal(
      identityWebsiteIntelligenceIsProtected(store.identities[0].website_intelligence),
      true,
    );
    assert.equal(
      isDeepWebsiteIntelligence(store.identities[0].website_intelligence),
      true,
    );
  });

  it("skips Identity writes when master_profile exists or Brain is ready/processing", async () => {
    for (const blocked of [
      identitySnapshot({
        website: null,
        master_profile: { executive_summary: "trained" },
        brain_status: "pending",
      }),
      identitySnapshot({ website: null, brain_status: "ready" }),
      identitySnapshot({ website: null, brain_status: "processing" }),
    ]) {
      assert.equal(isClientIdentityMutationBlocked(blocked), true);
      const store = memoryStore({ identities: [blocked] });
      const result = await hydrateLicenseeProspectClientIntelligence(
        {
          clientOrganizationId: CLIENT_ORG,
          website: "https://acme.example",
          websiteIntelligence: homepageWi(),
        },
        store,
      );
      assert.equal(result.state, "noop");
      assert.equal(store.updates.length, 0);
      assert.equal(store.identities[0].website, null);
    }
  });
});

describe("BIC-1 failure / isolation", () => {
  it("returns incomplete when the client owner membership is missing", async () => {
    const store = memoryStore({ ownerUserId: null });
    const result = await hydrateLicenseeProspectClientIntelligence(
      {
        clientOrganizationId: CLIENT_ORG,
        website: "https://acme.example",
        websiteIntelligence: homepageWi(),
      },
      store,
    );
    assert.equal(result.state, "incomplete");
    assert.equal(store.inserts.length, 0);
  });

  it("does not read another organization's Identity", async () => {
    const source = read(
      "services/licensee/licenseeProspectClientIntelligenceHydration.ts",
    );
    assert.match(source, /\.eq\("organization_id", input\.organizationId\)/);
    assert.match(source, /\.eq\("user_id", input\.userId\)/);
    assert.doesNotMatch(source, /wordpress_listing_id|findReusableWebsiteIntelligence/);
  });
});
