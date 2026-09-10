/**
 * Prospect Completeness — deterministic evidence coverage only.
 */

import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import {
  computeProspectIntelligenceCompleteness,
  hasActiveGetOblicListingLink,
  isMeaningfullyPopulated,
  prospectCompletenessBand,
  PROSPECT_COMPLETENESS_WEIGHTS,
  readImportedSourceDescription,
} from "../../services/prospects/prospectIntelligenceCompleteness";

const ROOT = process.cwd();

function read(relativePath: string): string {
  return readFileSync(join(ROOT, relativePath), "utf8");
}

function sparseProspect(
  overrides: Record<string, unknown> = {},
): Parameters<typeof computeProspectIntelligenceCompleteness>[0]["prospect"] {
  return {
    business_name: "Acme Clinic",
    ...overrides,
  };
}

describe("Prospect Completeness", () => {
  it("scores a minimum sparse prospect from identity core only", () => {
    const result = computeProspectIntelligenceCompleteness({
      prospect: sparseProspect(),
    });
    assert.ok(Math.abs(result.breakdown.identityCore - 25 / 3) < 1e-9);
    assert.equal(result.breakdown.contact, 0);
    assert.equal(result.breakdown.website, 0);
    assert.equal(result.breakdown.websiteIntelligence, 0);
    assert.equal(result.breakdown.generatedIntelligence, 0);
    assert.equal(result.breakdown.enrichment, 0);
    assert.equal(result.score, Math.round(25 / 3));
    assert.equal(result.band, "Low");
    assert.equal(prospectCompletenessBand(0), "Low");
  });

  it("awards full identity and contact buckets", () => {
    const result = computeProspectIntelligenceCompleteness({
      prospect: sparseProspect({
        category: "Clinics",
        city: "Dallas",
        email: "hello@acme.com",
        phone: "555-0100",
      }),
    });
    assert.equal(result.breakdown.identityCore, 25);
    assert.equal(result.breakdown.contact, 20);
    assert.equal(result.score, 45);
    assert.equal(result.band, "Medium");
  });

  it("awards website only when a normalized usable URL exists", () => {
    const result = computeProspectIntelligenceCompleteness({
      prospect: sparseProspect({
        website: "https://acme.example",
      }),
    });
    assert.equal(result.breakdown.website, 15);
    assert.equal(result.breakdown.websiteIntelligence, 0);
    assert.equal(result.score, Math.round(25 / 3 + 15));
  });

  it("awards website intelligence when usable content exists", () => {
    const result = computeProspectIntelligenceCompleteness({
      prospect: sparseProspect({
        website: "https://acme.example",
        website_intelligence: {
          about: "A clinic serving local clients.",
        },
      }),
    });
    assert.equal(result.breakdown.website, 15);
    assert.equal(result.breakdown.websiteIntelligence, 20);
    assert.equal(result.score, Math.round(25 / 3 + 15 + 20));
  });

  it("awards generated intelligence only when a current EV exists", () => {
    const without = computeProspectIntelligenceCompleteness({
      prospect: sparseProspect(),
      hasCurrentExecutiveVersion: false,
    });
    const withEv = computeProspectIntelligenceCompleteness({
      prospect: sparseProspect(),
      hasCurrentExecutiveVersion: true,
    });
    assert.equal(without.breakdown.generatedIntelligence, 0);
    assert.equal(withEv.breakdown.generatedIntelligence, 15);
    assert.equal(withEv.score, without.score + 15);
  });

  it("awards enrichment from social, GBP, imported description, or active GetOblic link", () => {
    const social = computeProspectIntelligenceCompleteness({
      prospect: sparseProspect({ linkedin: "https://linkedin.com/company/acme" }),
    });
    const imported = computeProspectIntelligenceCompleteness({
      prospect: sparseProspect({
        raw_json: { listing: { description: "Imported GetOblic listing copy." } },
      }),
    });
    const activeLink = computeProspectIntelligenceCompleteness({
      prospect: sparseProspect(),
      hasActiveGetOblicListingLink: true,
    });
    assert.equal(social.breakdown.enrichment, 5);
    assert.equal(imported.breakdown.enrichment, 5);
    assert.equal(activeLink.breakdown.enrichment, 5);
    assert.equal(readImportedSourceDescription({ listing: { description: "n/a" } }), null);
    assert.equal(hasActiveGetOblicListingLink({ relationship_status: "linked" }), true);
    assert.equal(hasActiveGetOblicListingLink({ relationship_status: "released" }), false);
    assert.equal(hasActiveGetOblicListingLink(null), false);
  });

  it("ignores placeholder text across buckets", () => {
    assert.equal(isMeaningfullyPopulated("  "), false);
    assert.equal(isMeaningfullyPopulated("na"), false);
    assert.equal(isMeaningfullyPopulated("n/a"), false);
    assert.equal(isMeaningfullyPopulated("tbd"), false);
    const placeholders = computeProspectIntelligenceCompleteness({
      prospect: {
        business_name: "n/a",
        category: " TBD ",
        city: "na",
        email: "n/a",
        website: "",
        linkedin: "tbd",
        ads_content: "N/A",
      },
    });
    assert.equal(placeholders.score, 0);
    assert.equal(placeholders.band, "Low");
  });

  it("clamps to a deterministic 0–100 integer", () => {
    const first = computeProspectIntelligenceCompleteness({
      prospect: sparseProspect({
        category: "Clinics",
        country: "US",
        email: "hello@acme.com",
        website: "https://acme.example",
        website_intelligence: { about: "Clinic story." },
        linkedin: "https://linkedin.com/company/acme",
      }),
      hasCurrentExecutiveVersion: true,
    });
    const second = computeProspectIntelligenceCompleteness({
      prospect: sparseProspect({
        category: "Clinics",
        country: "US",
        email: "hello@acme.com",
        website: "https://acme.example",
        website_intelligence: { about: "Clinic story." },
        linkedin: "https://linkedin.com/company/acme",
      }),
      hasCurrentExecutiveVersion: true,
    });
    assert.equal(first.score, second.score);
    assert.equal(Number.isInteger(first.score), true);
    assert.ok(first.score >= 0 && first.score <= 100);
    assert.equal(first.score, 100);
    assert.equal(first.band, "Excellent");
    assert.equal(
      first.breakdown.identityCore +
        first.breakdown.contact +
        first.breakdown.website +
        first.breakdown.websiteIntelligence +
        first.breakdown.generatedIntelligence +
        first.breakdown.enrichment,
      100,
    );
    assert.equal(PROSPECT_COMPLETENESS_WEIGHTS.identityCore, 25);
  });

  it("lets an active GetOblic link affect only the enrichment bucket", () => {
    const base = computeProspectIntelligenceCompleteness({
      prospect: sparseProspect(),
    });
    const withLink = computeProspectIntelligenceCompleteness({
      prospect: sparseProspect(),
      hasActiveGetOblicListingLink: true,
    });
    assert.equal(withLink.breakdown.identityCore, base.breakdown.identityCore);
    assert.equal(withLink.breakdown.contact, base.breakdown.contact);
    assert.equal(withLink.breakdown.website, base.breakdown.website);
    assert.equal(
      withLink.breakdown.websiteIntelligence,
      base.breakdown.websiteIntelligence,
    );
    assert.equal(
      withLink.breakdown.generatedIntelligence,
      base.breakdown.generatedIntelligence,
    );
    assert.equal(withLink.breakdown.enrichment, 5);
    assert.equal(base.breakdown.enrichment, 0);
  });

  it("does not use opportunity_score, analysis.confidence, or lifecycle status", () => {
    const base = computeProspectIntelligenceCompleteness({
      prospect: sparseProspect({
        opportunity_score: null,
        lifecycle_status: "New",
      }),
      analysisConfidence: null,
    });
    const inflated = computeProspectIntelligenceCompleteness({
      prospect: sparseProspect({
        opportunity_score: 99,
        lifecycle_status: "Qualified",
      }),
      analysisConfidence: 100,
    });
    assert.equal(inflated.score, base.score);
    assert.equal(inflated.breakdown.generatedIntelligence, 0);
    assert.equal(inflated.breakdown.identityCore, base.breakdown.identityCore);

    const helper = read("services/prospects/prospectIntelligenceCompleteness.ts");
    const page = read("app/prospects/[id]/page.tsx");
    const scoreUi = read("components/prospects/ProspectIntelligenceScore.tsx");
    assert.doesNotMatch(helper, /opportunity_score\s*\+|analysisConfidence\s*\+/);
    assert.match(page, /computeProspectIntelligenceCompleteness/);
    assert.doesNotMatch(page, /completeness[\s\S]{0,80}opportunity_score/);
    assert.doesNotMatch(scoreUi, /opportunity_score|analysis\.confidence/);
  });

  it("always displays a 0–100 completeness ring including zero", () => {
    const zero = computeProspectIntelligenceCompleteness({
      prospect: { business_name: "n/a" },
    });
    assert.equal(zero.score, 0);
    assert.equal(prospectCompletenessBand(39), "Low");
    assert.equal(prospectCompletenessBand(40), "Medium");
    assert.equal(prospectCompletenessBand(69), "Medium");
    assert.equal(prospectCompletenessBand(70), "Strong");
    assert.equal(prospectCompletenessBand(89), "Strong");
    assert.equal(prospectCompletenessBand(90), "Excellent");
    assert.equal(prospectCompletenessBand(100), "Excellent");
  });
});
