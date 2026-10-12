/**
 * COMMUNITY-INTELLIGENCE-1 Gate 3C — organization-scoped saves.
 * In-memory catalog. No database connection.
 */

import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { CommunityDiscoveryRequestError } from "../../services/communityDiscovery/communityDiscoveryErrors";
import { createSupabaseOrganizationCommunitySaves, createSupabasePublicCommunityCatalog } from "../../services/communityDiscovery/communityDiscoveryPersistence";
import {
  listSavedOrganizationCommunities,
  saveOrganizationCommunity,
} from "../../services/communityDiscovery/organizationCommunitySaves";
import { createCommunityDiscoveryDbFake } from "./communityDiscoveryDbFake";

const ORG_A = "org-a";
const ORG_B = "org-b";
const GROUP_ID = "123456789012345";
const GROUP_URL = `https://www.facebook.com/groups/${GROUP_ID}`;
const FIRST_AT = new Date("2026-10-12T12:00:00.000Z");
const SECOND_AT = new Date("2026-10-12T13:00:00.000Z");

function seedGroup(
  db: ReturnType<typeof createCommunityDiscoveryDbFake>,
  identity = GROUP_ID,
  displayName = "Independent Retailers",
) {
  db.seed("athena_public_communities", {
    id: `11111111-1111-4111-8111-${identity.slice(0, 12).padStart(12, "0")}`,
    platform: "facebook_groups",
    canonical_identity: identity,
    canonical_url: `https://www.facebook.com/groups/${identity}`,
    display_name: displayName,
    source: "public_url",
    sourced_at: "2020-01-01T00:00:00.000Z",
    suppression_state: "active",
    suppressed_at: null,
  });
}

describe("organization community saves", () => {
  it("saves idempotently for one organization and keeps notes private", async () => {
    const db = createCommunityDiscoveryDbFake();
    seedGroup(db);
    const repository = createSupabaseOrganizationCommunitySaves(db);
    const catalog = createSupabasePublicCommunityCatalog(db);
    const body = {
      canonicalUrl: `https://m.facebook.com/groups/${GROUP_ID}/members?ref=1`,
      qualification: "relevant",
      notes: "  private note  ",
      organizationId: ORG_B,
    };

    const first = await saveOrganizationCommunity({
      organizationId: ORG_A,
      body,
      repository,
      catalog,
      now: FIRST_AT,
    });
    const repeated = await saveOrganizationCommunity({
      organizationId: ORG_A,
      body,
      repository,
      catalog,
      now: SECOND_AT,
    });
    const changed = await saveOrganizationCommunity({
      organizationId: ORG_A,
      body: { ...body, notes: "updated note", qualification: "not_relevant" },
      repository,
      catalog,
      now: SECOND_AT,
    });
    await saveOrganizationCommunity({
      organizationId: ORG_B,
      body: { ...body, notes: "other organization note" },
      repository,
      catalog,
      now: SECOND_AT,
    });

    const orgA = await listSavedOrganizationCommunities({
      organizationId: ORG_A,
      repository,
    });
    const orgB = await listSavedOrganizationCommunities({
      organizationId: ORG_B,
      repository,
    });
    const saveWrites = db.upserts.filter(
      (entry) => entry.table === "athena_organization_communities",
    );

    assert.equal(first.id, repeated.id);
    assert.equal(repeated.updatedAt, first.updatedAt);
    assert.equal(first.notes, "private note");
    assert.equal(first.organizationId, ORG_A);
    assert.equal(first.canonicalUrl, GROUP_URL);
    assert.equal(changed.id, first.id);
    assert.equal(changed.createdAt, first.createdAt);
    assert.equal(changed.updatedAt, SECOND_AT.toISOString());
    assert.equal(changed.qualification, "not_relevant");
    assert.equal(changed.notes, "updated note");
    assert.equal(db.rows("athena_public_communities").length, 1);
    assert.equal(db.rows("athena_organization_communities").length, 2);
    assert.equal(saveWrites.length, 3);
    assert.deepEqual(
      saveWrites.map((entry) => entry.options),
      [
        { onConflict: "organization_id,community_id" },
        { onConflict: "organization_id,community_id" },
        { onConflict: "organization_id,community_id" },
      ],
    );
    assert.equal(orgA.length, 1);
    assert.equal(orgA[0].notes, "updated note");
    assert.equal(JSON.stringify(orgA).includes("other organization note"), false);
    assert.equal(orgB.length, 1);
    assert.equal(orgB[0].notes, "other organization note");
    assert.equal(JSON.stringify(orgB).includes("updated note"), false);
    for (const query of db.queries.filter(
      (query) => query.table === "athena_organization_communities",
    )) {
      const upsertReturn = query.filters.every(
        (filter) => filter.type === "in" && filter.column === "id",
      );
      if (upsertReturn) continue;
      assert.equal(
        query.filters.some(
          (filter) =>
            filter.type === "eq" && filter.column === "organization_id",
        ),
        true,
      );
    }
  });

  it("rejects a non-group URL and invalid save fields without writing", async () => {
    const db = createCommunityDiscoveryDbFake();
    seedGroup(db);
    const repository = createSupabaseOrganizationCommunitySaves(db);
    const catalog = createSupabasePublicCommunityCatalog(db);
    const before = db.rows("athena_public_communities").length;

    await assert.rejects(
      () =>
        saveOrganizationCommunity({
          organizationId: ORG_A,
          body: {
            canonicalUrl: "https://www.reddit.com/r/retail",
            qualification: "relevant",
            notes: "secret",
          },
          repository,
          catalog,
        }),
      (error: unknown) =>
        error instanceof CommunityDiscoveryRequestError &&
        error.code === "INVALID_COMMUNITY_URL",
    );
    await assert.rejects(
      () =>
        saveOrganizationCommunity({
          organizationId: ORG_A,
          body: {
            canonicalUrl: GROUP_URL,
            qualification: "Relevant",
            notes: "hello\nthere",
          },
          repository,
          catalog,
        }),
      (error: unknown) =>
        error instanceof CommunityDiscoveryRequestError &&
        error.code === "INVALID_QUALIFICATION",
    );
    await assert.rejects(
      () =>
        saveOrganizationCommunity({
          organizationId: ORG_A,
          body: {
            canonicalUrl: GROUP_URL,
            qualification: "relevant",
            notes: "x".repeat(2001),
          },
          repository,
          catalog,
        }),
      (error: unknown) =>
        error instanceof CommunityDiscoveryRequestError &&
        error.code === "INVALID_NOTES",
    );

    assert.equal(db.rows("athena_public_communities").length, before);
    assert.equal(db.rows("athena_organization_communities").length, 0);
    assert.equal(JSON.stringify(db.upserts).includes("secret"), false);
  });

  it("fails closed when a save row is not scoped to the requested organization", async () => {
    const db = createCommunityDiscoveryDbFake();
    seedGroup(db);
    const repository = createSupabaseOrganizationCommunitySaves(db);
    const catalog = createSupabasePublicCommunityCatalog(db);
    await saveOrganizationCommunity({
      organizationId: ORG_A,
      body: {
        canonicalUrl: GROUP_URL,
        qualification: "relevant",
        notes: "org-a private",
      },
      repository,
      catalog,
    });
    await saveOrganizationCommunity({
      organizationId: ORG_B,
      body: {
        canonicalUrl: GROUP_URL,
        qualification: "relevant",
        notes: "org-b private",
      },
      repository,
      catalog,
    });
    db.ignoreFilters = true;

    await assert.rejects(
      () =>
        listSavedOrganizationCommunities({
          organizationId: ORG_A,
          repository,
        }),
      (error: unknown) =>
        error instanceof CommunityDiscoveryRequestError &&
        error.code === "PERSISTENCE_UNAVAILABLE" &&
        error.message.includes("org-a private") === false &&
        error.message.includes("org-b private") === false,
    );
  });

  it("lists at most 100 saves, newest first", async () => {
    const db = createCommunityDiscoveryDbFake();
    const repository = createSupabaseOrganizationCommunitySaves(db);
    const catalog = createSupabasePublicCommunityCatalog(db);
    for (let index = 0; index < 101; index += 1) {
      const identity = String(100000 + index);
      seedGroup(db, identity, `Group ${identity}`);
      await saveOrganizationCommunity({
        organizationId: ORG_A,
        body: {
          canonicalUrl: `https://www.facebook.com/groups/${identity}`,
          qualification: "relevant",
          notes: `note-${index}`,
        },
        repository,
      catalog,
        now: new Date(Date.UTC(2026, 0, 1, 0, 0, index)),
      });
    }

    const saves = await listSavedOrganizationCommunities({
      organizationId: ORG_A,
      repository,
    });

    assert.equal(saves.length, 100);
    assert.equal(saves[0].notes, "note-100");
    assert.equal(saves.some((save) => save.notes === "note-0"), false);
    assert.equal(
      saves.every((save) => save.organizationId === ORG_A),
      true,
    );
  });

  it("inserts an unknown public group, then saves it for one organization", async () => {
    const db = createCommunityDiscoveryDbFake();
    const repository = createSupabaseOrganizationCommunitySaves(db);
    const catalog = createSupabasePublicCommunityCatalog(db);
    const pasted = "https://m.facebook.com/groups/missing-group/about?ref=1";

    const first = await saveOrganizationCommunity({
      organizationId: ORG_A,
      body: {
        canonicalUrl: pasted,
        qualification: "relevant",
        organizationId: ORG_B,
      },
      repository,
      catalog,
      now: FIRST_AT,
    });
    const repeated = await saveOrganizationCommunity({
      organizationId: ORG_A,
      body: { canonicalUrl: pasted, qualification: "relevant" },
      repository,
      catalog,
      now: SECOND_AT,
    });
    const other = await saveOrganizationCommunity({
      organizationId: ORG_B,
      body: {
        canonicalUrl: "https://www.facebook.com/groups/missing-group",
        qualification: "relevant",
        notes: "org-b only",
      },
      repository,
      catalog,
      now: SECOND_AT,
    });

    const publicRows = db.rows("athena_public_communities");
    const publicWrites = db.upserts.filter(
      (entry) => entry.table === "athena_public_communities",
    );
    const orgA = await listSavedOrganizationCommunities({
      organizationId: ORG_A,
      repository,
    });
    const orgB = await listSavedOrganizationCommunities({
      organizationId: ORG_B,
      repository,
    });

    assert.equal(first.organizationId, ORG_A);
    assert.equal(first.canonicalUrl, "https://www.facebook.com/groups/missing-group");
    assert.equal(first.displayName, "missing-group");
    assert.equal(first.notes, null);
    assert.equal(first.id, repeated.id);
    assert.equal(repeated.updatedAt, first.updatedAt);
    assert.notEqual(other.id, first.id);
    assert.equal(other.notes, "org-b only");
    assert.equal(other.displayName, "missing-group");
    assert.equal(publicRows.length, 1);
    assert.equal(publicRows[0].canonical_identity, "missing-group");
    assert.equal(publicRows[0].display_name, "missing-group");
    assert.equal(publicRows[0].source, "public_url");
    assert.equal(publicRows[0].suppression_state, "active");
    assert.equal("organization_id" in publicRows[0], false);
    assert.equal(publicWrites.length, 1);
    assert.equal(publicWrites[0].options.ignoreDuplicates, true);
    assert.equal(publicWrites[0].options.onConflict, "platform,canonical_identity");
    assert.equal(db.rows("athena_organization_communities").length, 2);
    assert.equal(orgA.length, 1);
    assert.equal(orgA[0].notes, null);
    assert.equal(JSON.stringify(orgA).includes("org-b only"), false);
    assert.equal(orgB.length, 1);
    assert.equal(orgB[0].notes, "org-b only");
  });

  it("keeps an existing catalog name and private notes", async () => {
    const db = createCommunityDiscoveryDbFake();
    seedGroup(db, GROUP_ID, "Catalog Name");
    const repository = createSupabaseOrganizationCommunitySaves(db);
    const catalog = createSupabasePublicCommunityCatalog(db);
    const first = await saveOrganizationCommunity({
      organizationId: ORG_A,
      body: {
        canonicalUrl: `https://web.facebook.com/groups/${GROUP_ID}/`,
        qualification: "relevant",
        notes: "keep me",
      },
      repository,
      catalog,
      now: FIRST_AT,
    });
    const again = await saveOrganizationCommunity({
      organizationId: ORG_A,
      body: { canonicalUrl: GROUP_URL, qualification: "relevant" },
      repository,
      catalog,
      now: SECOND_AT,
    });
    const requalified = await saveOrganizationCommunity({
      organizationId: ORG_A,
      body: { canonicalUrl: GROUP_URL, qualification: "not_relevant" },
      repository,
      catalog,
      now: SECOND_AT,
    });

    const row = db.rows("athena_public_communities")[0];
    assert.equal(first.displayName, "Catalog Name");
    assert.equal(first.sourcedAt, "2020-01-01T00:00:00.000Z");
    assert.equal(again.id, first.id);
    assert.equal(again.notes, "keep me");
    assert.equal(again.updatedAt, first.updatedAt);
    assert.equal(requalified.id, first.id);
    assert.equal(requalified.qualification, "not_relevant");
    assert.equal(requalified.notes, "keep me");
    assert.equal(row.display_name, "Catalog Name");
    assert.equal(row.sourced_at, "2020-01-01T00:00:00.000Z");
    assert.equal(
      db.upserts.filter((entry) => entry.table === "athena_public_communities").length,
      0,
    );
  });

  it("does not save or revive a suppressed public group", async () => {
    const db = createCommunityDiscoveryDbFake();
    db.seed("athena_public_communities", {
      id: "22222222-2222-4222-8222-222222222222",
      platform: "facebook_groups",
      canonical_identity: "hidden-group",
      canonical_url: "https://www.facebook.com/groups/hidden-group",
      display_name: "Hidden Group",
      source: "public_url",
      sourced_at: "2020-01-01T00:00:00.000Z",
      suppression_state: "suppressed",
      suppressed_at: "2020-02-01T00:00:00.000Z",
    });
    const repository = createSupabaseOrganizationCommunitySaves(db);
    const catalog = createSupabasePublicCommunityCatalog(db);

    await assert.rejects(
      () =>
        saveOrganizationCommunity({
          organizationId: ORG_A,
          body: {
            canonicalUrl: "https://m.facebook.com/groups/hidden-group/members",
            qualification: "relevant",
            notes: "secret",
          },
          repository,
          catalog,
        }),
      (error: unknown) =>
        error instanceof CommunityDiscoveryRequestError &&
        error.code === "COMMUNITY_SUPPRESSED" &&
        error.status === 409 &&
        error.message.includes("secret") === false,
    );

    const row = db.rows("athena_public_communities")[0];
    assert.equal(row.display_name, "Hidden Group");
    assert.equal(row.suppression_state, "suppressed");
    assert.equal(row.suppressed_at, "2020-02-01T00:00:00.000Z");
    assert.equal(db.rows("athena_public_communities").length, 1);
    assert.equal(db.rows("athena_organization_communities").length, 0);
    assert.equal(db.upserts.length, 0);
    assert.equal(JSON.stringify(db.upserts).includes("secret"), false);
  });
});
