import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  classifyGetOblicListingClaimAvailability,
  getCurrentGetOblicAllocationPeriodStart,
  isActiveGetOblicRelationshipStatus,
  type GetOblicActiveListingClaimLookup,
} from "../../services/getoblicDirectory/getoblicDirectoryTypes";

const ORG_A = "11111111-1111-1111-1111-111111111111";
const ORG_B = "22222222-2222-2222-2222-222222222222";
const PROSPECT_A = "aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa";
const PROSPECT_B = "bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb";

function availabilityKeys(result: { availability: string }): string[] {
  return Object.keys(result);
}

describe("GetOblic active relationship status", () => {
  it("treats claiming as active", () => {
    assert.equal(isActiveGetOblicRelationshipStatus("claiming"), true);
  });

  it("treats linked as active", () => {
    assert.equal(isActiveGetOblicRelationshipStatus("linked"), true);
  });

  it("treats remote_missing as active", () => {
    assert.equal(isActiveGetOblicRelationshipStatus("remote_missing"), true);
  });

  it("treats released as inactive", () => {
    assert.equal(isActiveGetOblicRelationshipStatus("released"), false);
  });
});

describe("GetOblic listing claim availability", () => {
  it("returns available when no active mapping exists", () => {
    const result = classifyGetOblicListingClaimAvailability(ORG_A, PROSPECT_A, {
      found: false,
    });
    assert.deepEqual(result, { availability: "available" });
    assert.deepEqual(availabilityKeys(result), ["availability"]);
  });

  it("returns already_claimed_by_same_prospect for same org + same Prospect", () => {
    const result = classifyGetOblicListingClaimAvailability(ORG_A, PROSPECT_A, {
      found: true,
      organization_id: ORG_A,
      prospect_id: PROSPECT_A,
      relationship_status: "linked",
    });
    assert.deepEqual(result, {
      availability: "already_claimed_by_same_prospect",
    });
    assert.deepEqual(availabilityKeys(result), ["availability"]);
  });

  it("returns claimed_by_other_prospect_same_org for same org + different Prospect", () => {
    const result = classifyGetOblicListingClaimAvailability(ORG_A, PROSPECT_A, {
      found: true,
      organization_id: ORG_A,
      prospect_id: PROSPECT_B,
      relationship_status: "linked",
    });
    assert.deepEqual(result, {
      availability: "claimed_by_other_prospect_same_org",
    });
    assert.deepEqual(availabilityKeys(result), ["availability"]);
  });

  it("returns claimed_by_other_org without leaking other-tenant identifiers", () => {
    const otherClaim: GetOblicActiveListingClaimLookup = {
      found: true,
      organization_id: ORG_B,
      prospect_id: PROSPECT_B,
      relationship_status: "linked",
    };
    const result = classifyGetOblicListingClaimAvailability(
      ORG_A,
      PROSPECT_A,
      otherClaim,
    );
    assert.deepEqual(result, { availability: "claimed_by_other_org" });
    assert.deepEqual(availabilityKeys(result), ["availability"]);
    assert.equal("organization_id" in result, false);
    assert.equal("organization_name" in result, false);
    assert.equal("prospect_id" in result, false);
    assert.equal("user_id" in result, false);
    assert.doesNotMatch(JSON.stringify(result), new RegExp(ORG_B));
    assert.doesNotMatch(JSON.stringify(result), new RegExp(PROSPECT_B));
  });

  it("treats remote_missing in another organization as claimed_by_other_org", () => {
    const result = classifyGetOblicListingClaimAvailability(ORG_A, PROSPECT_A, {
      found: true,
      organization_id: ORG_B,
      prospect_id: PROSPECT_B,
      relationship_status: "remote_missing",
    });
    assert.deepEqual(result, { availability: "claimed_by_other_org" });
  });

  it("treats claiming in another organization as claimed_by_other_org", () => {
    const result = classifyGetOblicListingClaimAvailability(ORG_A, PROSPECT_A, {
      found: true,
      organization_id: ORG_B,
      prospect_id: PROSPECT_B,
      relationship_status: "claiming",
    });
    assert.deepEqual(result, { availability: "claimed_by_other_org" });
  });

  it("treats a released-only historical row as no active conflict", () => {
    const result = classifyGetOblicListingClaimAvailability(ORG_A, PROSPECT_A, {
      found: false,
    });
    assert.deepEqual(result, { availability: "available" });
  });
});

describe("GetOblic allocation period", () => {
  it("returns the first UTC day of the current month", () => {
    assert.equal(
      getCurrentGetOblicAllocationPeriodStart(
        new Date("2026-09-15T12:34:56.000Z"),
      ),
      "2026-09-01",
    );
  });

  it("uses the UTC month across local-date boundaries", () => {
    assert.equal(
      getCurrentGetOblicAllocationPeriodStart(
        new Date("2026-08-31T23:59:59.999Z"),
      ),
      "2026-08-01",
    );
    assert.equal(
      getCurrentGetOblicAllocationPeriodStart(
        new Date("2026-09-01T00:00:00.000Z"),
      ),
      "2026-09-01",
    );
    assert.equal(
      getCurrentGetOblicAllocationPeriodStart(
        new Date("2026-09-30T23:59:59.999Z"),
      ),
      "2026-09-01",
    );
    assert.equal(
      getCurrentGetOblicAllocationPeriodStart(
        new Date("2026-10-01T00:00:00.000Z"),
      ),
      "2026-10-01",
    );
  });
});
