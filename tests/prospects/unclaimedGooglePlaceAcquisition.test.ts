/**
 * CO-UNCLAIMED-1 Gate 7B — unclaimed Find One Specific Business.
 * Mocked lookup and acquisition. No live WordPress, Make, or database.
 */

import "../getoblicDirectory/getoblicDirectoryTestEnv";

import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, it } from "node:test";
import { de } from "../../lib/tenantI18n/messages/de";
import { en } from "../../lib/tenantI18n/messages/en";
import { es } from "../../lib/tenantI18n/messages/es";
import { fr } from "../../lib/tenantI18n/messages/fr";
import { it as itMessages } from "../../lib/tenantI18n/messages/it";
import { pt } from "../../lib/tenantI18n/messages/pt";
import { GetOblicDirectoryError } from "../../services/getoblicDirectory/getoblicDirectoryErrors";
import type { GetOblicWordpressListing } from "../../services/getoblicDirectory/getoblicWordpressTypes";
import { GetOblicWordpressError } from "../../services/getoblicDirectory/getoblicWordpressTypes";
import {
  acquireUnclaimedGetoblicProspectByGooglePlaceId,
  type AcquireUnclaimedGetoblicProspectByGooglePlaceIdDeps,
} from "../../services/getoblicDirectory/unclaimedGetoblicGooglePlaceAcquisition";
import type { UnclaimedGetoblicDirectoryMode } from "../../services/getoblicDirectory/unclaimedGetoblicDirectoryMode";

const ROOT = process.cwd();
const ORG = "11111111-1111-4111-8111-111111111111";
const USER = "cccccccc-cccc-4ccc-8ccc-cccccccccccc";
const PROSPECT = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
const PLACE_ID = "ChIJexactPlace";

function read(relativePath: string): string {
  return readFileSync(join(ROOT, relativePath), "utf8");
}

function sliceFn(source: string, start: string, end?: string): string {
  const from = source.indexOf(start);
  assert.ok(from >= 0, start);
  const to = end ? source.indexOf(end, from + start.length) : source.length;
  assert.ok(to > from, end ?? "end");
  return source.slice(from, to);
}

function listing(
  wordpressListingId: number,
  googleId: string | null,
): GetOblicWordpressListing {
  return {
    wordpress_listing_id: wordpressListingId,
    status: "publish",
    title: "Oak Street Salon",
    author_id: 12,
    google_id: googleId,
    google_place_url: null,
    knowledge_base: null,
  };
}

function harness(options: {
  mode?: UnclaimedGetoblicDirectoryMode;
  listings?: GetOblicWordpressListing[];
  lookupError?: Error;
}) {
  const calls = {
    lookups: [] as string[],
    acquired: [] as number[],
  };
  const deps: AcquireUnclaimedGetoblicProspectByGooglePlaceIdDeps = {
    resolveMode: async () => options.mode ?? "unclaimed",
    getListingsByGoogleId: async (googleId) => {
      calls.lookups.push(googleId);
      if (options.lookupError) throw options.lookupError;
      return options.listings ?? [];
    },
    acquireListing: async (input) => {
      calls.acquired.push(Number(input.wordpressListingId));
      return { prospectId: PROSPECT, inserted: true };
    },
  };
  return { calls, deps };
}

describe("GetOblic Google Place ID lookup contract", () => {
  it("returns every parsed match and does not exact-filter google_id", () => {
    const client = read("services/getoblicDirectory/getoblicWordpressClient.ts");
    const fn = sliceFn(
      client,
      "export async function getWordpressListingsByGoogleId",
      "export async function assignWordpressListingAuthor",
    );
    assert.match(fn, /googleId: string/);
    assert.match(fn, /Promise<GetOblicWordpressListing\[\]>/);
    assert.match(
      fn,
      /\/listings\?google_id=\$\{encodeURIComponent\(normalized\)\}/,
    );
    assert.match(fn, /google_id is required/);
    assert.match(fn, /Array\.isArray\(root\.matches\)/);
    assert.match(fn, /matches\.map\(\(entry\) => parseListing\(entry\)\)/);
    assert.doesNotMatch(fn, /googleBusinessIdsEqual/);
    assert.doesNotMatch(fn, /length === 1/);
  });
});

describe("unclaimed Google Place acquisition", () => {
  it("acquires the one exact canonical listing and ignores non-matching rows", async () => {
    const { calls, deps } = harness({
      listings: [
        listing(4401, "ChIJother"),
        listing(4402, ` ${PLACE_ID} `),
        listing(4402, PLACE_ID),
      ],
    });
    const result = await acquireUnclaimedGetoblicProspectByGooglePlaceId(
      { organizationId: ORG, actorUserId: USER, googleId: PLACE_ID },
      deps,
    );
    assert.deepEqual(result, { prospectId: PROSPECT, inserted: true });
    assert.deepEqual(calls.lookups, [PLACE_ID]);
    assert.deepEqual(calls.acquired, [4402]);
  });

  it("does not insert when no listing matches the Google Place ID", async () => {
    const { calls, deps } = harness({
      listings: [listing(4401, "ChIJother"), listing(4403, null)],
    });
    await assert.rejects(
      () =>
        acquireUnclaimedGetoblicProspectByGooglePlaceId(
          { organizationId: ORG, actorUserId: USER, googleId: PLACE_ID },
          deps,
        ),
      (error: unknown) =>
        error instanceof GetOblicDirectoryError &&
        error.code === "GETOBLIC_GOOGLE_PLACE_NOT_LISTED" &&
        error.status === 404,
    );
    assert.deepEqual(calls.acquired, []);
  });

  it("does not insert when several canonical listings match", async () => {
    const { calls, deps } = harness({
      listings: [listing(4401, PLACE_ID), listing(4402, PLACE_ID)],
    });
    await assert.rejects(
      () =>
        acquireUnclaimedGetoblicProspectByGooglePlaceId(
          { organizationId: ORG, actorUserId: USER, googleId: PLACE_ID },
          deps,
        ),
      (error: unknown) =>
        error instanceof GetOblicDirectoryError &&
        error.code === "GETOBLIC_GOOGLE_PLACE_AMBIGUOUS" &&
        error.status === 409,
    );
    assert.deepEqual(calls.acquired, []);
  });

  it("does not look up or acquire when the mode is ordinary or refused", async () => {
    for (const mode of ["ordinary", "refused"] as const) {
      const { calls, deps } = harness({
        mode,
        listings: [listing(4401, PLACE_ID)],
      });
      await assert.rejects(
        () =>
          acquireUnclaimedGetoblicProspectByGooglePlaceId(
            { organizationId: ORG, actorUserId: USER, googleId: PLACE_ID },
            deps,
          ),
        (error: unknown) =>
          error instanceof GetOblicDirectoryError &&
          error.code === "GETOBLIC_UNCLAIMED_PROSPECTING_NOT_AUTHORIZED" &&
          error.status === 403,
      );
      assert.deepEqual(calls.lookups, []);
      assert.deepEqual(calls.acquired, []);
    }
  });

  it("does not acquire when the Google ID lookup fails", async () => {
    const { calls, deps } = harness({
      lookupError: new GetOblicWordpressError("NETWORK", "down", 502),
    });
    await assert.rejects(
      () =>
        acquireUnclaimedGetoblicProspectByGooglePlaceId(
          { organizationId: ORG, actorUserId: USER, googleId: PLACE_ID },
          deps,
        ),
      (error: unknown) =>
        error instanceof GetOblicDirectoryError &&
        error.code === "GETOBLIC_REMOTE_TRANSIENT",
    );
    assert.deepEqual(calls.acquired, []);
  });

  it("does not call Make, claim, author assignment, listing capacity, or generation", () => {
    const helper = read(
      "services/getoblicDirectory/unclaimedGetoblicGooglePlaceAcquisition.ts",
    );
    assert.match(helper, /getWordpressListingsByGoogleId/);
    assert.match(helper, /googleBusinessIdsEqual/);
    assert.match(helper, /acquireUnclaimedGetoblicDirectoryProspect/);
    assert.doesNotMatch(helper, /addGoogleBusinessListing/);
    assert.doesNotMatch(helper, /claimKnownExistingListing/);
    assert.doesNotMatch(helper, /assignWordpressListingAuthor/);
    assert.doesNotMatch(helper, /resolveOrCreateWordpressUser/);
    assert.doesNotMatch(helper, /reserveGetOblicListingCapacity/);
    assert.doesNotMatch(helper, /getGetOblicListingCapacity/);
    assert.doesNotMatch(helper, /ensureProspectGenerationQueued/);
    assert.doesNotMatch(helper, /convertGoogleBusinessSelection/);
  });
});

describe("Google business route keeps Free first and ordinary Make", () => {
  it("branches only after the Free plan return", () => {
    const route = read("app/api/prospects/from-google-business/route.ts");
    const post = sliceFn(route, "export async function POST", "catch (error)");
    const freeAt = post.indexOf("persistFreeConvertFromGoogleBusiness");
    const modeAt = post.indexOf("resolveUnclaimedGetoblicDirectoryMode");
    const refusedAt = post.indexOf('directoryMode === "refused"');
    const unclaimedAt = post.indexOf('directoryMode === "unclaimed"');
    const acquireAt = post.indexOf(
      "acquireUnclaimedGetoblicProspectByGooglePlaceId",
    );
    const convertAt = post.indexOf("convertGoogleBusinessSelection");
    assert.ok(
      freeAt >= 0 &&
        modeAt > freeAt &&
        refusedAt > modeAt &&
        unclaimedAt > refusedAt &&
        acquireAt > unclaimedAt &&
        convertAt > acquireAt,
    );

    const unclaimed = sliceFn(
      post,
      'directoryMode === "unclaimed"',
      "const { make, conversion }",
    );
    assert.match(unclaimed, /googleBusiness\.google_id/);
    assert.match(unclaimed, /prospect_id: acquired\.prospectId/);
    assert.match(unclaimed, /generation_queued: false/);
    assert.doesNotMatch(
      unclaimed,
      /addGoogleBusinessListing|claimKnownExistingListing|assignWordpressListingAuthor|ensureProspectGenerationQueued|reserveGetOblicListingCapacity|toPublicGetOblicConversion/,
    );

    const freeBranch = sliceFn(
      post,
      'if (convertContext.athenaPlan === "free")',
      "const { make, conversion }",
    );
    assert.match(freeBranch, /persistFreeConvertFromGoogleBusiness/);
    assert.match(freeBranch, /payload: body/);
    assert.doesNotMatch(
      freeBranch,
      /convertGoogleBusinessSelection|addGoogleBusinessListing|toPublicGetOblicConversion|result: make/,
    );

    const ordinary = post.slice(convertAt);
    assert.match(ordinary, /actorLicenseeAccountId/);
    assert.match(ordinary, /toPublicGetOblicConversion/);
  });

  it("leaves the ordinary Google conversion guard in place", () => {
    const convert = read(
      "services/googleBusiness/googleBusinessConvertService.ts",
    );
    assert.match(convert, /if \(directoryMode !== "ordinary"\)/);
    assert.ok(
      convert.indexOf("resolveDirectoryMode") <
        convert.indexOf("const make = await addListing"),
    );
    assert.match(convert, /addGoogleBusinessListing/);
    assert.match(convert, /GOOGLE_BUSINESS_AUTHOR_MAPPING_MISSING/);
    assert.doesNotMatch(convert, /acquireUnclaimedGetoblicProspectByGooglePlaceId/);
    assert.doesNotMatch(convert, /persistFreeConvertFromGoogleBusiness/);
  });
});

describe("unclaimed Google discovery presentation", () => {
  it("shows Google search for Full unclaimed and keeps the Free exhausted sentence off that path", () => {
    const methods = read(
      "components/prospects/OpportunityDiscoveryMethods.tsx",
    );
    const google = read("components/prospects/GoogleBusinessDiscovery.tsx");
    const page = read("app/prospects/find/page.tsx");
    assert.match(
      methods,
      /googleOffered &&\s*\(directoryMode === "ordinary" \|\|\s*\(fullAthena && directoryMode === "unclaimed"\)\)/,
    );
    assert.match(page, /fullAthena=\{presentation === "full"\}/);
    assert.match(
      page,
      /googleAvailable=\{shouldOfferGoogleDiscovery\(presentation\)\}/,
    );
    assert.match(
      page,
      /shouldRequireGoogleAuthorMapping\(presentation\) &&\s*directoryMode !== "unclaimed"/,
    );
    assert.match(methods, /GoogleBusinessDiscovery/);
    assert.match(google, /directoryMode === "unclaimed"\s*\?\s*find\.addAsProspect/);
    assert.match(google, /copy\.addCta/);
    assert.match(google, /router\.push\(`\/prospects\/\$\{prospectId\}`\)/);
    assert.match(google, /GETOBLIC_GOOGLE_PLACE_NOT_LISTED/);
    assert.match(google, /copy\.notInGetOblic/);
    assert.match(google, /GETOBLIC_GOOGLE_PLACE_AMBIGUOUS/);
    assert.match(google, /copy\.ambiguousListing/);
    assert.match(
      google,
      /directoryMode === "unclaimed" \|\| !authorMappingMissing/,
    );
    assert.match(
      google,
      /directoryMode === "unclaimed" \|\| !prospectCapacityReached/,
    );

    const availableGoogle = sliceFn(
      methods,
      'data-discovery-source="google"\n            data-discovery-available="true"',
      'data-discovery-available="false"',
    );
    assert.doesNotMatch(availableGoogle, /googleUnavailable/);
    assert.doesNotMatch(
      availableGoogle,
      /Your Free opportunity has already been researched/,
    );
    assert.equal(
      en.prospects.find.methods.googleUnavailable,
      "Your Free opportunity has already been researched.",
    );
    assert.equal(en.prospects.find.addAsProspect, "Add as Prospect");
    assert.equal(en.prospects.find.google.addCta, "Add this business");
  });

  it("localizes the non-Free not-listed, ambiguous, and refused messages", () => {
    const dictionaries = [en, fr, es, itMessages, de, pt];
    for (const messages of dictionaries) {
      const find = messages.prospects.find;
      assert.ok(find.google.notInGetOblic.trim());
      assert.ok(find.google.ambiguousListing.trim());
      assert.ok(find.methods.googleAcquisitionUnavailable.trim());
      assert.notEqual(
        find.google.notInGetOblic,
        find.methods.googleUnavailable,
      );
      assert.notEqual(
        find.google.ambiguousListing,
        find.methods.googleUnavailable,
      );
      assert.notEqual(
        find.methods.googleAcquisitionUnavailable,
        find.methods.googleUnavailable,
      );
      assert.doesNotMatch(find.google.notInGetOblic, /Free/);
      assert.doesNotMatch(find.google.ambiguousListing, /Free/);
      assert.doesNotMatch(find.methods.googleAcquisitionUnavailable, /Free/);
    }
    assert.equal(
      en.prospects.find.google.notInGetOblic,
      "This business isn’t listed in GetOblic, so Athena didn’t add it.",
    );
    assert.equal(
      en.prospects.find.google.ambiguousListing,
      "Athena found more than one GetOblic listing for this business and didn’t add one.",
    );
    assert.equal(
      en.prospects.find.methods.googleAcquisitionUnavailable,
      "Athena can’t add a Google business for this workspace.",
    );
    assert.notEqual(
      fr.prospects.find.google.notInGetOblic,
      en.prospects.find.google.notInGetOblic,
    );
    assert.notEqual(
      de.prospects.find.methods.googleAcquisitionUnavailable,
      en.prospects.find.methods.googleAcquisitionUnavailable,
    );
  });
});
