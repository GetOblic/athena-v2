/**
 * EST-QUOTE-1C.2 — pure Prospect → Client commercial fill.
 */

import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  PROSPECT_TO_ORGANIZATION_COMMERCIAL_FIELDS,
  buildBlankCommercialIdentityFill,
  normalizeOptionalCommercialText,
} from "../../services/organization/commercialIdentity";

describe("commercial identity handoff", () => {
  it("trims optional text to null", () => {
    assert.equal(normalizeOptionalCommercialText("  Acme Ltd  "), "Acme Ltd");
    assert.equal(normalizeOptionalCommercialText("   "), null);
    assert.equal(normalizeOptionalCommercialText(null), null);
    assert.equal(normalizeOptionalCommercialText(12), null);
  });

  it("maps prospect email to business_email and fills only blank targets", () => {
    assert.deepEqual(
      PROSPECT_TO_ORGANIZATION_COMMERCIAL_FIELDS.find(
        ([source]) => source === "email",
      ),
      ["email", "business_email"],
    );

    const fill = buildBlankCommercialIdentityFill(
      {
        legal_name: "  New Legal  ",
        address: " 12 Main ",
        email: " buyer@acme.test ",
        business_name: "Should Not Become The Client Name",
        notes: "private",
        additional_context: "strategy",
        website: "https://acme.test",
        website_intelligence: { about: "secret" },
        phone: "  ",
      },
      {
        name: "Existing Trading",
        legal_name: "Kept Legal",
        address: "   ",
        business_email: null,
        phone: "555",
        slug: "kept-slug",
        language: "fr",
        brand_primary_color: "#112233",
      },
    );

    assert.deepEqual(fill, {
      address: "12 Main",
      business_email: "buyer@acme.test",
    });
    assert.equal(Object.hasOwn(fill, "legal_name"), false);
    assert.equal(Object.hasOwn(fill, "name"), false);
    assert.equal(Object.hasOwn(fill, "phone"), false);
    assert.equal(Object.hasOwn(fill, "notes"), false);
    assert.equal(Object.hasOwn(fill, "website"), false);
  });

  it("returns an empty fill when every source value is blank", () => {
    assert.deepEqual(
      buildBlankCommercialIdentityFill(
        {
          legal_name: " ",
          email: "",
          notes: "still private",
        },
        { legal_name: null, business_email: "" },
      ),
      {},
    );
  });
});
