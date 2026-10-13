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
  removeOrganizationCommunitySave,
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
    assert.equal(saveWrites.length, 2);
    assert.deepEqual(
      saveWrites.map((entry) => entry.options),
      [
        { onConflict: "organization_id,community_id" },
        { onConflict: "organization_id,community_id" },
      ],
    );
    const noteUpdate = db.updates.find(
      (entry) =>
        entry.table === "athena_organization_communities" &&
        entry.values.notes === "updated note",
    );
    assert.ok(noteUpdate);
    assert.equal(noteUpdate.values.removed_at, undefined);
    assert.equal(
      noteUpdate.filters.some(
        (filter) => filter.type === "is" && filter.column === "removed_at",
      ),
      true,
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

  it("masks an owned save without deleting rows, notes, or another organization", async () => {
    const db = createCommunityDiscoveryDbFake();
    seedGroup(db);
    const repository = createSupabaseOrganizationCommunitySaves(db);
    const catalog = createSupabasePublicCommunityCatalog(db);
    const owned = await saveOrganizationCommunity({
      organizationId: ORG_A,
      body: {
        canonicalUrl: GROUP_URL,
        qualification: "not_relevant",
        notes: "keep this note",
      },
      repository,
      catalog,
      now: FIRST_AT,
    });
    const foreign = await saveOrganizationCommunity({
      organizationId: ORG_B,
      body: {
        canonicalUrl: GROUP_URL,
        qualification: "relevant",
        notes: "org-b private",
      },
      repository,
      catalog,
      now: FIRST_AT,
    });

    await removeOrganizationCommunitySave({
      organizationId: ORG_A,
      saveId: owned.id,
      repository,
      now: SECOND_AT,
    });
    await removeOrganizationCommunitySave({
      organizationId: ORG_A,
      saveId: owned.id,
      repository,
      now: new Date("2026-10-12T14:00:00.000Z"),
    });

    const orgRows = db.rows("athena_organization_communities");
    const ownedRow = orgRows.find((row) => row.id === owned.id);
    const foreignRow = orgRows.find((row) => row.id === foreign.id);
    const listedA = await listSavedOrganizationCommunities({
      organizationId: ORG_A,
      repository,
    });
    const listedB = await listSavedOrganizationCommunities({
      organizationId: ORG_B,
      repository,
    });
    const mask = db.updates.filter(
      (entry) =>
        entry.table === "athena_organization_communities" &&
        entry.values.removed_at === SECOND_AT.toISOString(),
    );

    assert.equal(orgRows.length, 2);
    assert.equal(db.rows("athena_public_communities").length, 1);
    assert.equal(db.rows("athena_public_communities")[0]?.canonical_identity, GROUP_ID);
    assert.ok(ownedRow);
    assert.equal(ownedRow.notes, "keep this note");
    assert.equal(ownedRow.qualification, "not_relevant");
    assert.equal(ownedRow.organization_id, ORG_A);
    assert.equal(ownedRow.removed_at, SECOND_AT.toISOString());
    assert.equal(ownedRow.updated_at, SECOND_AT.toISOString());
    assert.equal(ownedRow.community_id, foreignRow?.community_id);
    assert.ok(foreignRow);
    assert.equal(foreignRow.removed_at, undefined);
    assert.equal(foreignRow.notes, "org-b private");
    assert.equal(listedA.length, 0);
    assert.equal(listedB.length, 1);
    assert.equal(listedB[0]?.notes, "org-b private");
    assert.equal(JSON.stringify(listedA).includes("org-b private"), false);
    assert.equal(mask.length, 1);
    assert.deepEqual(Object.keys(mask[0]?.values ?? {}).sort(), [
      "removed_at",
      "updated_at",
    ]);
    assert.equal(
      mask[0]?.filters.some(
        (filter) =>
          filter.type === "eq" &&
          filter.column === "organization_id" &&
          filter.value === ORG_A,
      ),
      true,
    );
    assert.equal(JSON.stringify(db.updates).includes('"delete"'), false);
  });

  it("restores a masked save without a duplicate or a notes overwrite", async () => {
    const db = createCommunityDiscoveryDbFake();
    seedGroup(db);
    const repository = createSupabaseOrganizationCommunitySaves(db);
    const catalog = createSupabasePublicCommunityCatalog(db);
    const saved = await saveOrganizationCommunity({
      organizationId: ORG_A,
      body: {
        canonicalUrl: GROUP_URL,
        qualification: "not_relevant",
        notes: "keep this note",
      },
      repository,
      catalog,
      now: FIRST_AT,
    });
    await removeOrganizationCommunitySave({
      organizationId: ORG_A,
      saveId: saved.id,
      repository,
      now: SECOND_AT,
    });
    const upsertsBefore = db.upserts.length;
    const restoredAt = new Date("2026-10-12T15:00:00.000Z");

    const restored = await saveOrganizationCommunity({
      organizationId: ORG_A,
      body: { canonicalUrl: GROUP_URL, qualification: "relevant" },
      repository,
      catalog,
      now: restoredAt,
    });
    const again = await saveOrganizationCommunity({
      organizationId: ORG_A,
      body: { canonicalUrl: GROUP_URL, qualification: "not_relevant" },
      repository,
      catalog,
      now: new Date("2026-10-12T16:00:00.000Z"),
    });
    const row = db.rows("athena_organization_communities")[0];
    const restore = db.updates.find(
      (entry) =>
        entry.table === "athena_organization_communities" &&
        entry.values.removed_at === null,
    );

    assert.equal(restored.id, saved.id);
    assert.equal(again.id, saved.id);
    assert.equal(restored.qualification, "not_relevant");
    assert.equal(restored.notes, "keep this note");
    assert.equal(restored.removedAt, null);
    assert.equal(restored.updatedAt, restoredAt.toISOString());
    assert.equal(again.updatedAt, restored.updatedAt);
    assert.equal(db.rows("athena_organization_communities").length, 1);
    assert.equal(db.rows("athena_public_communities").length, 1);
    assert.equal(db.upserts.length, upsertsBefore);
    assert.equal(row?.notes, "keep this note");
    assert.equal(row?.qualification, "not_relevant");
    assert.equal(row?.removed_at, null);
    assert.ok(restore);
    assert.equal("notes" in (restore?.values ?? {}), false);
    assert.equal("qualification" in (restore?.values ?? {}), false);
    const listed = await listSavedOrganizationCommunities({
      organizationId: ORG_A,
      repository,
    });
    assert.equal(listed.length, 1);
    assert.equal(listed[0]?.notes, "keep this note");
  });

  it("does not let a stale or racing notes update clear the mask", async () => {
    const db = createCommunityDiscoveryDbFake();
    seedGroup(db);
    const repository = createSupabaseOrganizationCommunitySaves(db);
    const catalog = createSupabasePublicCommunityCatalog(db);
    const saved = await saveOrganizationCommunity({
      organizationId: ORG_A,
      body: {
        canonicalUrl: GROUP_URL,
        qualification: "relevant",
        notes: "keep this note",
      },
      repository,
      catalog,
      now: FIRST_AT,
    });
    await removeOrganizationCommunitySave({
      organizationId: ORG_A,
      saveId: saved.id,
      repository,
      now: SECOND_AT,
    });

    await assert.rejects(
      () =>
        saveOrganizationCommunity({
          organizationId: ORG_A,
          body: {
            canonicalUrl: GROUP_URL,
            qualification: "relevant",
            notes: "stale replacement",
          },
          repository,
          catalog,
          now: new Date("2026-10-12T16:00:00.000Z"),
        }),
      (error: unknown) =>
        error instanceof CommunityDiscoveryRequestError &&
        error.code === "SAVE_NOT_FOUND" &&
        error.status === 404 &&
        error.message.includes("keep this note") === false &&
        error.message.includes("stale replacement") === false,
    );
    const masked = db.rows("athena_organization_communities")[0];
    assert.equal(masked?.notes, "keep this note");
    assert.equal(masked?.removed_at, SECOND_AT.toISOString());
    assert.equal(masked?.updated_at, SECOND_AT.toISOString());

    await saveOrganizationCommunity({
      organizationId: ORG_A,
      body: { canonicalUrl: GROUP_URL, qualification: "relevant" },
      repository,
      catalog,
      now: new Date("2026-10-12T16:30:00.000Z"),
    });
    const seen = repository.findSave.bind(repository);
    const raceAt = new Date("2026-10-12T17:00:00.000Z");
    repository.findSave = async (organizationId, communityId) => {
      const found = await seen(organizationId, communityId);
      if (found && !found.removedAt) {
        repository.findSave = seen;
        await removeOrganizationCommunitySave({
          organizationId,
          saveId: found.id,
          repository,
          now: raceAt,
        });
      }
      return found;
    };

    await assert.rejects(
      () =>
        saveOrganizationCommunity({
          organizationId: ORG_A,
          body: {
            canonicalUrl: GROUP_URL,
            qualification: "not_relevant",
            notes: "racing note",
          },
          repository,
          catalog,
          now: new Date("2026-10-12T18:00:00.000Z"),
        }),
      (error: unknown) =>
        error instanceof CommunityDiscoveryRequestError &&
        error.code === "SAVE_NOT_FOUND" &&
        error.message.includes("racing note") === false &&
        error.message.includes("keep this note") === false,
    );

    const raced = db.rows("athena_organization_communities").find((row) => row.id === saved.id);
    assert.equal(raced?.removed_at, raceAt.toISOString());
    assert.equal(raced?.notes, "keep this note");
    assert.equal(raced?.qualification, "relevant");
    assert.equal(db.rows("athena_organization_communities").length, 1);
    assert.equal(db.rows("athena_public_communities").length, 1);
  });

  it("uses the same not-found response for an unknown id and another organization's save", async () => {
    const db = createCommunityDiscoveryDbFake();
    seedGroup(db);
    const repository = createSupabaseOrganizationCommunitySaves(db);
    const catalog = createSupabasePublicCommunityCatalog(db);
    const foreign = await saveOrganizationCommunity({
      organizationId: ORG_B,
      body: {
        canonicalUrl: GROUP_URL,
        qualification: "relevant",
        notes: "org-b private",
      },
      repository,
      catalog,
      now: FIRST_AT,
    });

    async function capture(saveId: string) {
      try {
        await removeOrganizationCommunitySave({
          organizationId: ORG_A,
          saveId,
          repository,
          now: SECOND_AT,
        });
        return null;
      } catch (error) {
        return error;
      }
    }

    const unknown = await capture("aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa");
    const foreignError = await capture(foreign.id);
    const malformed = await capture("not-a-uuid");
    const row = db.rows("athena_organization_communities")[0];

    assert.ok(unknown instanceof CommunityDiscoveryRequestError);
    assert.ok(foreignError instanceof CommunityDiscoveryRequestError);
    assert.ok(malformed instanceof CommunityDiscoveryRequestError);
    if (
      !(unknown instanceof CommunityDiscoveryRequestError) ||
      !(foreignError instanceof CommunityDiscoveryRequestError) ||
      !(malformed instanceof CommunityDiscoveryRequestError)
    ) {
      return;
    }
    assert.equal(unknown.code, "SAVE_NOT_FOUND");
    assert.equal(unknown.status, 404);
    assert.equal(foreignError.code, unknown.code);
    assert.equal(foreignError.status, unknown.status);
    assert.equal(foreignError.message, unknown.message);
    assert.equal(malformed.message, unknown.message);
    assert.equal(unknown.message.includes(foreign.id), false);
    assert.equal(unknown.message.includes("org-b private"), false);
    assert.equal(unknown.message.includes(ORG_B), false);
    assert.equal(row?.removed_at, undefined);
    assert.equal(row?.notes, "org-b private");
    assert.equal(db.rows("athena_organization_communities").length, 1);
    assert.equal(db.rows("athena_public_communities").length, 1);
  });

  it("does not restore a masked save when the public community is suppressed", async () => {
    const db = createCommunityDiscoveryDbFake();
    seedGroup(db);
    const repository = createSupabaseOrganizationCommunitySaves(db);
    const catalog = createSupabasePublicCommunityCatalog(db);
    const saved = await saveOrganizationCommunity({
      organizationId: ORG_A,
      body: {
        canonicalUrl: GROUP_URL,
        qualification: "relevant",
        notes: "keep this note",
      },
      repository,
      catalog,
      now: FIRST_AT,
    });
    await removeOrganizationCommunitySave({
      organizationId: ORG_A,
      saveId: saved.id,
      repository,
      now: SECOND_AT,
    });
    const suppressed = await db
      .from("athena_public_communities")
      .update({
        suppression_state: "suppressed",
        suppressed_at: "2020-02-01T00:00:00.000Z",
      })
      .eq("canonical_url", GROUP_URL)
      .select("id");
    assert.equal(suppressed.error, null);

    await assert.rejects(
      () =>
        saveOrganizationCommunity({
          organizationId: ORG_A,
          body: { canonicalUrl: GROUP_URL, qualification: "relevant" },
          repository,
          catalog,
        }),
      (error: unknown) =>
        error instanceof CommunityDiscoveryRequestError &&
        error.code === "COMMUNITY_SUPPRESSED",
    );
    const saves = db.rows("athena_organization_communities");
    assert.equal(saves.length, 1);
    assert.equal(saves[0]?.removed_at, SECOND_AT.toISOString());
    assert.equal(saves[0]?.notes, "keep this note");
    assert.equal(saves[0]?.qualification, "relevant");
  });
});
