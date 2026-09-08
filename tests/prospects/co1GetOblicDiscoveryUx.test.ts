/**
 * CO-1 Find Opportunities UX and Saved presentation.
 * Source-contract and pure helper checks. No live GetOblic or OpenRouter calls.
 */

import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, it } from "node:test";
import {
  firstGetOblicOpportunityCategoryName,
  resolveGetOblicOpportunityCardPhase,
} from "../../components/prospects/GetOblicOpportunityResultCard";
import {
  getProspectIntelligenceStatusLabel,
  isProspectIntelligenceProcessing,
  shouldOfferProspectFullIntelligenceAction,
} from "../../lib/prospects/prospectReadinessPresentation";
import { getLocalizedProspectReadinessLabel } from "../../lib/tenantI18n/prospectPresentation";
import { de } from "../../lib/tenantI18n/messages/de";
import { en } from "../../lib/tenantI18n/messages/en";
import { es } from "../../lib/tenantI18n/messages/es";
import { fr } from "../../lib/tenantI18n/messages/fr";
import { it as itMessages } from "../../lib/tenantI18n/messages/it";
import { pt } from "../../lib/tenantI18n/messages/pt";
import { ORGANIZATION_LANGUAGES } from "../../services/organizationLanguage";
import { resolveProspectDisplayStatus } from "../../services/prospects/prospectDisplay";
import { normalizeWebsiteUrl } from "../../services/prospects/prospectUtils";

const ROOT = process.cwd();

function read(relativePath: string): string {
  return readFileSync(join(ROOT, relativePath), "utf8");
}

const DICTIONARIES = { en, fr, es, it: itMessages, de, pt } as const;

describe("CO-1 Find Opportunities UX", () => {
  it("adds Find opportunities from the Convert Opportunities library", () => {
    const library = read("components/prospects/ProspectsLibraryClient.tsx");
    assert.match(library, /href="\/prospects\/find"/);
    assert.match(library, /findOpportunitiesCta/);
    assert.match(library, /addProspectYourselfCta/);
    assert.match(library, /href="\/prospects\/import"/);
    assert.doesNotMatch(library, /Search GetOblic/);
    assert.doesNotMatch(library, /claim listing/);
    assert.doesNotMatch(library, /allocation remaining/);
  });

  it("renders /prospects/find under the tenant Convert Opportunities shell", () => {
    const page = read("app/prospects/find/page.tsx");
    assert.match(page, /TenantAppShell currentPath="\/prospects\/find"/);
    assert.match(page, /requireCurrentOrganizationContext/);
    assert.match(page, /copy\.find\.title/);
    assert.match(page, /copy\.find\.subtitle/);
    assert.match(page, /GetOblicOpportunityDiscovery/);
    assert.match(page, /getGetOblicDirectorySettings/);
    assert.match(page, /getGetOblicListingCapacity/);
    assert.doesNotMatch(page, /organizationId:/);
    assert.doesNotMatch(page, /fit score|recommendation score/i);
  });

  it("uses the existing directory search API and convert-only mutation", () => {
    const discovery = read(
      "components/prospects/GetOblicOpportunityDiscovery.tsx",
    );
    assert.match(discovery, /\/api\/getoblic-directory\/search/);
    assert.match(discovery, /\/api\/prospects\/from-getoblic/);
    assert.doesNotMatch(discovery, /getoblic-directory\/claim/);
    assert.doesNotMatch(discovery, /knowledge-base/);
    assert.doesNotMatch(discovery, /organizationId/);
    assert.doesNotMatch(discovery, /supabase/);
    assert.doesNotMatch(discovery, /OpenRouter|openrouter/i);
    assert.doesNotMatch(discovery, /google.?places/i);
    assert.match(discovery, /page: String\(nextPage\)/);
    assert.match(discovery, /if \(!trimmed\)/);
    assert.match(discovery, /GETOBLIC_LISTING_NOT_CLAIMABLE/);
    assert.match(discovery, /GETOBLIC_LISTING_CAPACITY_EXCEEDED/);
    assert.match(discovery, /listingCapacityReached/);
    assert.match(discovery, /outcome === "claim_incomplete"/);
    assert.match(discovery, /outcome === "remote_missing"/);
    assert.doesNotMatch(discovery, /outcome === "capacity_exceeded"/);
    assert.match(discovery, /setFailedId/);
    assert.match(discovery, /setFailureMessage/);
    assert.match(discovery, /copy\.listingCapacityReached/);
    assert.match(discovery, /INCOMPLETE_FOR_THIS_ORG/);
    assert.match(discovery, /alreadyBeingPursued/);
    assert.doesNotMatch(discovery, /271519816/);
    assert.doesNotMatch(discovery, /author_id/);
  });

  it("covers search result card states without leaking other-org identity", () => {
    assert.equal(
      resolveGetOblicOpportunityCardPhase({
        claimStatus: "AVAILABLE",
        inFlight: false,
        failed: false,
      }),
      "available",
    );
    assert.equal(
      resolveGetOblicOpportunityCardPhase({
        claimStatus: "OWNED_BY_THIS_ORG",
        inFlight: false,
        failed: false,
      }),
      "owned",
    );
    assert.equal(
      resolveGetOblicOpportunityCardPhase({
        claimStatus: "INCOMPLETE_FOR_THIS_ORG",
        inFlight: false,
        failed: false,
      }),
      "incomplete",
    );
    assert.notEqual(
      resolveGetOblicOpportunityCardPhase({
        claimStatus: "INCOMPLETE_FOR_THIS_ORG",
        inFlight: false,
        failed: false,
      }),
      "owned",
    );
    assert.equal(
      resolveGetOblicOpportunityCardPhase({
        claimStatus: "UNAVAILABLE",
        inFlight: false,
        failed: false,
      }),
      "unavailable",
    );
    assert.equal(
      resolveGetOblicOpportunityCardPhase({
        claimStatus: "AVAILABLE",
        inFlight: true,
        failed: false,
      }),
      "in_progress",
    );
    assert.equal(
      resolveGetOblicOpportunityCardPhase({
        claimStatus: "AVAILABLE",
        inFlight: false,
        failed: true,
      }),
      "failed",
    );
    assert.equal(
      firstGetOblicOpportunityCategoryName([
        { term_id: 1, slug: "hair", name: "Hair Salons" },
      ]),
      "Hair Salons",
    );

    const card = read("components/prospects/GetOblicOpportunityResultCard.tsx");
    assert.match(card, /addToOpportunities/);
    assert.match(card, /alreadyInMyOpportunities/);
    assert.match(card, /needsFinishing/);
    assert.match(card, /finishAdding/);
    assert.match(card, /alreadyBeingPursued/);
    assert.match(card, /sourceGetOblic/);
    assert.match(card, /viewListing/);
    assert.doesNotMatch(card, /claiming|reservation|allocation|WordPress/);
    assert.doesNotMatch(card, /organization_id/);
    assert.doesNotMatch(card, /prospect_id/);
    assert.doesNotMatch(card, /wordpress_listing_id\}/);
    assert.doesNotMatch(card, /google_id\}/);
    assert.doesNotMatch(card, /hit\.lat|hit\.lng/);
    assert.doesNotMatch(card, /hit\.status/);
    assert.doesNotMatch(card, /hit\.listing_type/);
  });

  it("keeps manual and CSV import paths intact", () => {
    const importPage = read("app/prospects/import/page.tsx");
    const forms = read("components/prospects/ProspectImportForms.tsx");
    assert.match(importPage, /ProspectImportForms/);
    assert.match(forms, /copy\.manualTitle/);
    assert.match(forms, /copy\.csvTitle/);
    assert.doesNotMatch(importPage, /GetOblicOpportunityDiscovery/);
    assert.doesNotMatch(forms, /from-getoblic/);
  });

  it("adds website completion only for thin GetOblic Prospects", () => {
    const detail = read("app/prospects/[id]/page.tsx");
    const card = read("components/prospects/GetOblicWebsiteCompletionCard.tsx");
    assert.match(
      detail,
      /prospect\.source === "getoblic" && !prospect\.website/,
    );
    assert.match(card, /Research this business|researchCta/);
    assert.match(card, /notNow/);
    assert.match(card, /normalizeWebsiteUrl/);
    assert.match(card, /`\/api\/prospects\/\$\{prospectId\}`/);
    assert.match(card, /method: "PATCH"/);
    assert.doesNotMatch(card, /decision maker|phone|email|whatsapp/i);
    assert.doesNotMatch(detail, /\/api\/getoblic-directory\/search/);
    assert.doesNotMatch(detail, /GetOblicOpportunityDiscovery/);
    assert.match(detail, /GetOblicListingReleaseControl/);
    assert.doesNotMatch(card, /Release GetOblic listing|getoblic-directory\/release/);
  });

  it("does not offer Generate on Saved GetOblic without a website", () => {
    assert.equal(
      shouldOfferProspectFullIntelligenceAction({
        source: "getoblic",
        website: null,
        hasCurrentVersion: false,
      }),
      false,
    );
    assert.equal(
      shouldOfferProspectFullIntelligenceAction({
        source: "getoblic",
        website: "https://acme.example",
        hasCurrentVersion: false,
      }),
      true,
    );
    assert.equal(
      shouldOfferProspectFullIntelligenceAction({
        source: "getoblic",
        website: null,
        hasCurrentVersion: true,
      }),
      true,
    );
    assert.equal(
      shouldOfferProspectFullIntelligenceAction({
        source: "manual",
        website: null,
        hasCurrentVersion: false,
      }),
      true,
    );
    assert.equal(
      shouldOfferProspectFullIntelligenceAction({
        source: "csv",
        website: null,
        hasCurrentVersion: false,
      }),
      true,
    );

    const detail = read("app/prospects/[id]/page.tsx");
    assert.match(detail, /shouldOfferProspectFullIntelligenceAction/);
    assert.match(detail, /GetOblicWebsiteCompletionCard/);
    assert.match(detail, /offerFullIntelligence \?/);
    assert.match(detail, /addWebsiteToStartResearch/);
    assert.match(detail, /ProspectRefreshIntelligenceButton/);
    assert.doesNotMatch(
      detail,
      /source === "manual".*shouldOfferProspectFullIntelligenceAction/,
    );
  });

  it("reuses existing website validation and does not persist invalid values from the card", () => {
    assert.equal(normalizeWebsiteUrl("not-a-site"), null);
    assert.equal(normalizeWebsiteUrl("acme.example"), "https://acme.example");
    const card = read("components/prospects/GetOblicWebsiteCompletionCard.tsx");
    assert.match(card, /if \(!normalized\)/);
    assert.match(card, /invalidWebsite/);
    assert.match(card, /laterNote/);
  });

  it("presents Saved without Queued or Processing copy", () => {
    assert.equal(
      resolveProspectDisplayStatus({
        prospectStatus: "Saved",
        hasCurrentVersion: false,
      }),
      "Saved",
    );
    assert.equal(isProspectIntelligenceProcessing("Saved"), false);
    assert.equal(
      getProspectIntelligenceStatusLabel(en, "Saved"),
      en.prospects.convert.saved,
    );
    assert.notEqual(
      getProspectIntelligenceStatusLabel(en, "Saved"),
      en.prospects.convert.athenaStarting,
    );
    assert.notEqual(
      getLocalizedProspectReadinessLabel(en, "Saved"),
      "Queued",
    );
    assert.equal(en.prospects.convert.saved, "Saved");
  });

  it("localizes new Find Opportunities and completion copy in all six languages", () => {
    for (const language of ORGANIZATION_LANGUAGES) {
      const messages = DICTIONARIES[language];
      assert.ok(messages.prospects.list.findOpportunitiesCta);
      assert.ok(messages.prospects.find.title);
      assert.ok(messages.prospects.find.addToOpportunities);
      assert.ok(messages.prospects.find.needsFinishing);
      assert.ok(messages.prospects.find.finishAdding);
      assert.ok(messages.prospects.find.listingCapacityReached);
      assert.ok(messages.prospects.detail.releaseGetOblicListing);
      assert.ok(messages.prospects.websiteCompletion.heading);
      assert.ok(messages.prospects.websiteCompletion.addWebsiteToStartResearch);
      assert.ok(messages.prospects.convert.saved);
      assert.ok(messages.prospects.readiness.saved);
    }
    assert.notEqual(
      fr.prospects.list.findOpportunitiesCta,
      en.prospects.list.findOpportunitiesCta,
    );
    assert.notEqual(de.prospects.find.title, en.prospects.find.title);
    assert.notEqual(
      es.prospects.websiteCompletion.notNow,
      en.prospects.websiteCompletion.notNow,
    );
  });

  it("does not modify Estimate, Ads, Social Planner, SEO, or KB write surfaces", () => {
    const find = read("app/prospects/find/page.tsx");
    const convert = read(
      "services/getoblicDirectory/getoblicDirectoryConvertService.ts",
    );
    for (const source of [find, convert]) {
      assert.doesNotMatch(source, /\/licensee\/estimate/);
      assert.doesNotMatch(source, /syncGetOblicListingKnowledgeBase/);
      assert.doesNotMatch(source, /from "next\/legacy"/);
    }
  });
});
