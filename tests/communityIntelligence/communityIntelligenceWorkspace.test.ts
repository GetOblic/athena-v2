/**
 * COMMUNITY-INTELLIGENCE-1 Gate 3E — Communities workspace.
 * Renders presentation and parses the accepted API. Does not call providers.
 *
 * A pasted public Facebook Group URL is saved without search.
 * Suggested contribution text is ephemeral qualification output.
 */

import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, it } from "node:test";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import {
  CommunityDiscoveryCards,
  SavedCommunityCards,
} from "../../components/communityIntelligence/CommunityDiscoveryCards";
import { CommunityIntelligenceWorkspace } from "../../components/communityIntelligence/CommunityIntelligenceWorkspace";
import { TractionSiblingNav } from "../../components/traction/TractionSiblingNav";
import {
  isTenantNavActive,
  localizeTenantNav,
} from "../../components/dashboard/tenantNavigation";
import {
  COMMUNITY_DISCOVERY_CLIENT_TIMEOUT_MS,
  parseCommunityDiscoveryPayload,
  parseSaveCommunityPayload,
  parseSavedCommunitiesPayload,
  canonicalManualFacebookGroupUrl,
  requestCommunityDiscovery,
  requestSaveCommunity,
  type CommunityDiscoveryCard,
} from "../../lib/communityIntelligence/communityDiscoveryClient";
import { de } from "../../lib/tenantI18n/messages/de";
import { en } from "../../lib/tenantI18n/messages/en";
import { es } from "../../lib/tenantI18n/messages/es";
import { fr } from "../../lib/tenantI18n/messages/fr";
import { it as itMessages } from "../../lib/tenantI18n/messages/it";
import { pt } from "../../lib/tenantI18n/messages/pt";
import type { TenantMessages } from "../../lib/tenantI18n/types";
import { COMMUNITY_DISCOVERY_ROUTE_MAX_DURATION_SECONDS } from "../../services/communityDiscovery/communityDiscoveryLimits";

const ROOT = process.cwd();
const GROUP_URL = "https://www.facebook.com/groups/123456789012345";

function read(relativePath: string): string {
  return readFileSync(join(ROOT, relativePath), "utf8");
}

function collectKeyPaths(value: unknown, prefix = ""): string[] {
  if (value === null || typeof value !== "object" || Array.isArray(value)) {
    return prefix ? [prefix] : [];
  }
  const paths = prefix ? [prefix] : [];
  for (const key of Object.keys(value as object).sort()) {
    const next = prefix ? `${prefix}.${key}` : key;
    paths.push(
      ...collectKeyPaths((value as Record<string, unknown>)[key], next),
    );
  }
  return paths;
}

const dictionaries: Record<string, TenantMessages> = {
  en,
  fr,
  es,
  de,
  pt,
  it: itMessages,
};

function discoveryBody(result: Record<string, unknown> | null, qualification: unknown) {
  return {
    ok: true,
    discovery: {
      platform: "facebook_groups",
      objective: "independent retailers",
      searchProvider: "brave",
      qualification,
      results: result ? [result] : [],
    },
  };
}

function groupResult(overrides: Record<string, unknown> = {}) {
  return {
    platform: "facebook_groups",
    canonicalIdentity: "123456789012345",
    canonicalUrl: "https://m.facebook.com/groups/123456789012345?ref=share",
    displayName: "Independent Retailers",
    source: "public_url",
    sourcedAt: "2026-10-12T12:00:00.000Z",
    catalog: "created",
    evidence: {
      title: "Independent Retailers",
      snippet: "A public group for independent retailers.",
    },
    qualification: {
      status: "available",
      explanation: "The group discusses wholesale buying for independent shops.",
    },
    relevanceScore: 99,
    ...overrides,
  };
}

describe("Gate 3D community intelligence workspace", () => {
  it("keeps Communities inside Generate Traction and leaves Intelligence Domains on /communities", () => {
    const items = localizeTenantNav(en);
    const traction = items.find((item) => item.key === "generateTraction");
    const domains = items.find((item) => item.key === "intelligenceDomains");
    assert.ok(traction && domains);
    assert.equal(isTenantNavActive("/traction/communities", traction), true);
    assert.equal(isTenantNavActive("/personas", traction), true);
    assert.equal(isTenantNavActive("/ads", traction), true);
    assert.equal(isTenantNavActive("/social-planner", traction), true);
    assert.equal(isTenantNavActive("/traction/communities", domains), false);
    assert.equal(isTenantNavActive("/communities", domains), true);
    assert.deepEqual(domains.alsoActiveFor, ["/communities"]);

    const page = read("app/traction/communities/page.tsx");
    const layout = read("app/traction/layout.tsx");
    assert.match(page, /TenantAppShell/);
    assert.match(page, /TractionPageHeader/);
    assert.match(page, /currentPath="\/traction\/communities"/);
    assert.match(page, /href: "\/personas"/);
    assert.match(page, /href: "\/ads"/);
    assert.match(page, /href: "\/social-planner"/);
    assert.match(page, /href: "\/traction\/communities"/);
    assert.match(page, /current: true/);
    assert.match(layout, /redirectIfFreeUntrainedGrowthRoute/);
    assert.doesNotMatch(page, /AthenaBrandLink|TenantBackLink/);
  });

  it("adds Communities as the fourth sibling without removing the existing three", () => {
    for (const file of [
      "app/personas/page.tsx",
      "app/ads/page.tsx",
      "app/social-planner/page.tsx",
      "components/socialPlanner/SocialPlannerHistoryRoutePage.tsx",
    ]) {
      const source = read(file);
      assert.match(source, /href: "\/personas"/);
      assert.match(source, /href: "\/ads"/);
      assert.match(source, /href: "\/social-planner"/);
      assert.match(source, /href: "\/traction\/communities"/);
    }

    const html = renderToStaticMarkup(
      createElement(TractionSiblingNav, {
        links: [
          { href: "/personas", label: "Audiences" },
          { href: "/ads", label: "Advertising" },
          { href: "/social-planner", label: "Social Content" },
          {
            href: "/traction/communities",
            label: "Communities",
            help: "Find public Facebook Groups, then open them with your own account.",
            current: true,
          },
        ],
      }),
    );
    assert.match(html, /Audiences/);
    assert.match(html, /Advertising/);
    assert.match(html, /Social Content/);
    assert.match(html, /Communities/);
    assert.match(html, /href="\/personas"/);
    assert.match(html, /href="\/ads"/);
    assert.match(html, /href="\/social-planner"/);
    assert.doesNotMatch(html, /href="\/traction\/communities"/);
    assert.match(html, /emerald-200/);
  });

  it("renders the objective, bounded empty state, and follow-up without a drafted message", () => {
    const html = renderToStaticMarkup(
      createElement(CommunityIntelligenceWorkspace, { messages: en }),
    );
    assert.match(html, /Who do you want to reach/);
    assert.match(html, /Find Communities/);
    assert.match(html, /No search yet/);
    assert.match(html, /id="community-discovery-objective"/);
    assert.match(html, /Follow-up/);
    assert.match(html, /suggested contribution is optional/i);
    assert.match(html, /post it yourself/i);
    assert.match(html, /id="community-manual-url"/);
    assert.match(html, /type="url"/);
    assert.match(html, /Paste a public group link/);
    assert.match(html, /own Facebook account/);
    assert.doesNotMatch(html, />Open Group</);
    assert.doesNotMatch(html, /relevance score|Relevance score|score:/i);
  });

  it("shows returned name, Facebook, canonical URL, and explanation, and a clear unavailable state", () => {
    const available: CommunityDiscoveryCard = {
      canonicalUrl: GROUP_URL,
      displayName: "Independent Retailers",
      explanation: "The group discusses wholesale buying for independent shops.",
      suggestedContribution: "Shop owners who compare notes may want to share how they buy wholesale.",
      qualificationUnavailable: false,
      listingSnippet: "A public group for independent retailers.",
    };
    const unavailable: CommunityDiscoveryCard = {
      canonicalUrl: "https://www.facebook.com/groups/home.retailers",
      displayName: "Home Retailers",
      explanation: null,
      suggestedContribution: null,
      qualificationUnavailable: true,
      listingSnippet: null,
    };
    const html = renderToStaticMarkup(
      createElement(CommunityDiscoveryCards, {
        cards: [available, unavailable],
        copy: en.communityIntelligence,
        notices: {
          [GROUP_URL]: { tone: "duplicate" },
          "https://www.facebook.com/groups/home.retailers": {
            tone: "error",
            error: "saveFailed",
          },
        },
        onSave: () => undefined,
      }),
    );
    assert.match(html, /Independent Retailers/);
    assert.match(html, /Facebook/);
    assert.match(html, new RegExp(GROUP_URL.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")));
    assert.match(html, /Why it may be relevant/);
    assert.match(html, /wholesale buying/);
    assert.match(html, /Suggested contribution/);
    assert.match(html, /compare notes may want to share/);
    assert.match(html, /<textarea/);
    assert.match(html, /Copy/);
    assert.doesNotMatch(html, /readOnly|readonly/);
    assert.match(html, /Public listing/);
    assert.match(html, /Qualification unavailable/);
    assert.match(html, /No relevance explanation is available/);
    assert.match(html, /target="_blank"/);
    assert.match(html, /rel="noopener noreferrer"/);
    assert.match(html, /Already saved for this organization/);
    assert.match(html, /This community could not be saved/);
    assert.doesNotMatch(html, /99|relevanceScore|Not relevant/);
  });

  it("renders organization-private saved communities from the saves payload", () => {
    const html = renderToStaticMarkup(
      createElement(SavedCommunityCards, {
        copy: en.communityIntelligence,
        saves: [
          {
            id: "save-1",
            canonicalUrl: GROUP_URL,
            displayName: "Independent Retailers",
            qualification: "relevant",
            notes: "Ask about winter buying.",
          },
        ],
      }),
    );
    assert.match(html, /Independent Retailers/);
    assert.match(html, /Saved as relevant/);
    assert.match(html, /Ask about winter buying/);
    assert.match(html, /Open Group/);
    assert.match(html, new RegExp(`href="${GROUP_URL}"`));
  });

  it("parses discovery without inventing scores and keeps provider failures separate from qualification", () => {
    const qualified = parseCommunityDiscoveryPayload(
      discoveryBody(groupResult(), { status: "available" }),
    );
    assert.equal(qualified.ok, true);
    if (!qualified.ok) return;
    assert.equal(qualified.discovery.qualificationUnavailable, false);
    assert.equal(qualified.discovery.cards.length, 1);
    assert.equal(qualified.discovery.cards[0]?.canonicalUrl, GROUP_URL);
    assert.match(qualified.discovery.cards[0]?.explanation ?? "", /wholesale/);
    assert.equal(qualified.discovery.cards[0]?.suggestedContribution, null);
    assert.equal(
      "relevanceScore" in qualified.discovery.cards[0],
      false,
    );

    const unavailable = parseCommunityDiscoveryPayload(
      discoveryBody(
        groupResult({
          qualification: { status: "unavailable", reason: "timeout" },
        }),
        { status: "unavailable", reason: "timeout" },
      ),
    );
    assert.equal(unavailable.ok, true);
    if (!unavailable.ok) return;
    assert.equal(unavailable.discovery.qualificationUnavailable, true);
    assert.equal(unavailable.discovery.cards[0]?.explanation, null);
    assert.equal(unavailable.discovery.cards[0]?.suggestedContribution, null);
    assert.equal(unavailable.discovery.cards[0]?.qualificationUnavailable, true);

    const suggested = parseCommunityDiscoveryPayload(
      discoveryBody(
        groupResult({
          qualification: {
            status: "available",
            explanation: "The group discusses wholesale buying for independent shops.",
            suggestedContribution:
              "Shop owners who compare notes may want to share how they buy wholesale.",
          },
        }),
        { status: "available" },
      ),
    );
    assert.equal(suggested.ok, true);
    if (!suggested.ok) return;
    assert.equal(
      suggested.discovery.cards[0]?.suggestedContribution,
      "Shop owners who compare notes may want to share how they buy wholesale.",
    );

    const hiddenSuggestion = parseCommunityDiscoveryPayload(
      discoveryBody(
        groupResult({
          qualification: {
            status: "unavailable",
            reason: "timeout",
            suggestedContribution: "This should stay hidden.",
          },
        }),
        { status: "unavailable", reason: "timeout" },
      ),
    );
    assert.equal(hiddenSuggestion.ok, true);
    if (!hiddenSuggestion.ok) return;
    assert.equal(hiddenSuggestion.discovery.cards[0]?.explanation, null);
    assert.equal(hiddenSuggestion.discovery.cards[0]?.suggestedContribution, null);

    const empty = parseCommunityDiscoveryPayload(
      discoveryBody(null, { status: "unavailable", reason: "not_needed" }),
    );
    assert.equal(empty.ok, true);
    if (!empty.ok) return;
    assert.equal(empty.discovery.qualificationUnavailable, false);
    assert.deepEqual(empty.discovery.cards, []);

    const provider = parseCommunityDiscoveryPayload({
      ok: false,
      error: { code: "PROVIDER_UNAVAILABLE", message: "Community search is unavailable." },
    });
    assert.deepEqual(provider, { ok: false, error: "providerUnavailable" });

    const dropped = parseCommunityDiscoveryPayload(
      discoveryBody(
        groupResult({ platform: "reddit", canonicalUrl: "https://www.reddit.com/r/shops" }),
        { status: "available" },
      ),
    );
    assert.equal(dropped.ok, true);
    if (!dropped.ok) return;
    assert.deepEqual(dropped.discovery.cards, []);
  });

  it("sends only the accepted discovery and save bodies", async () => {
    const original = globalThis.fetch;
    const calls: Array<{ url: string; body: unknown }> = [];
    globalThis.fetch = (async (input: RequestInfo | URL, init?: RequestInit) => {
      const url = String(input);
      const body = typeof init?.body === "string" ? JSON.parse(init.body) : null;
      calls.push({ url, body });
      if (init?.method === "POST" && url.endsWith("/saves")) {
        return new Response(
          JSON.stringify({
            ok: true,
            save: {
              id: "save-1",
              platform: "facebook_groups",
              canonicalUrl: GROUP_URL,
              displayName: "Independent Retailers",
              qualification: "relevant",
              notes: null,
            },
          }),
          { status: 200, headers: { "Content-Type": "application/json" } },
        );
      }
      return new Response(JSON.stringify(discoveryBody(groupResult(), { status: "available" })), {
        status: 200,
        headers: { "Content-Type": "application/json" },
      });
    }) as typeof fetch;

    try {
      const controller = new AbortController();
      const discovered = await requestCommunityDiscovery("independent retailers", controller.signal);
      assert.equal(discovered.ok, true);
      const saved = await requestSaveCommunity(GROUP_URL);
      assert.equal(saved.ok, true);
      assert.deepEqual(calls[0]?.body, { objective: "independent retailers" });
      assert.equal(calls[0]?.url, "/api/community-discovery");
      assert.deepEqual(calls[1]?.body, {
        canonicalUrl: GROUP_URL,
        qualification: "relevant",
      });
      assert.equal(calls[1]?.url, "/api/community-discovery/saves");
      assert.equal(
        COMMUNITY_DISCOVERY_CLIENT_TIMEOUT_MS,
        (COMMUNITY_DISCOVERY_ROUTE_MAX_DURATION_SECONDS + 5) * 1000,
      );
    } finally {
      globalThis.fetch = original;
    }
  });

  it("saves a pasted group URL without search and still reports provider failure", () => {
    const saves = read("services/communityDiscovery/organizationCommunitySaves.ts");
    const workspace = read(
      "components/communityIntelligence/CommunityIntelligenceWorkspace.tsx",
    );
    const cards = read("components/communityIntelligence/CommunityDiscoveryCards.tsx");
    const client = read("lib/communityIntelligence/communityDiscoveryClient.ts");
    assert.match(saves, /insertMissing/);
    assert.match(saves, /COMMUNITY_SUPPRESSED/);
    assert.doesNotMatch(saves, /COMMUNITY_NOT_IN_CATALOG/);
    assert.match(workspace, /id="community-manual-url"/);
    assert.match(workspace, /canonicalManualFacebookGroupUrl/);
    assert.doesNotMatch(`${workspace}\n${cards}\n${client}`, /graph\.facebook|facebook\.com\/v\d+/i);
    assert.doesNotMatch(`${workspace}\n${client}`, /openrouter|callOpenRouter|reddit/i);
    const manualStart = workspace.indexOf("async function onManualSave");
    const manualBody = workspace.slice(manualStart, workspace.indexOf("const objectiveCount"));
    assert.match(manualBody, /requestSaveCommunity/);
    assert.doesNotMatch(manualBody, /requestCommunityDiscovery/);
    const manualInput = workspace.slice(
      workspace.indexOf('id="community-manual-url"'),
      workspace.indexOf('id="community-manual-url"') + 500,
    );
    assert.match(manualInput, /disabled=\{manualSaving\}/);
    assert.doesNotMatch(manualInput, /searching|discoveryError/);
    assert.match(cards, /navigator\.clipboard\.writeText\(draft\)/);
    assert.match(cards, /value=\{draft\}/);

    assert.equal(
      canonicalManualFacebookGroupUrl(
        "https://m.facebook.com/groups/missing-group/about?ref=1",
      ),
      "https://www.facebook.com/groups/missing-group",
    );
    assert.equal(canonicalManualFacebookGroupUrl("https://www.reddit.com/r/shops"), null);

    const missing = parseSaveCommunityPayload({
      ok: false,
      error: {
        code: "COMMUNITY_SUPPRESSED",
        message: "That public community is not available.",
      },
    });
    assert.deepEqual(missing, { ok: false, error: "communitySuppressed" });
    assert.match(workspace, /requestSavedCommunities/);
    const saveStart = workspace.indexOf("async function onSave");
    const saveBody = workspace.slice(saveStart, workspace.indexOf("const objectiveCount"));
    assert.ok(saveBody.indexOf("requestSavedCommunities") < saveBody.indexOf("requestSaveCommunity"));
    assert.match(saveBody, /tone: "duplicate"/);

    const catalogMiss = parseSaveCommunityPayload({
      ok: false,
      error: {
        code: "COMMUNITY_NOT_IN_CATALOG",
        message: "That public community is not in the catalog.",
      },
    });
    assert.deepEqual(catalogMiss, { ok: false, error: "notInCatalog" });

    const listed = parseSavedCommunitiesPayload({
      ok: true,
      saves: [
        {
          id: "save-1",
          platform: "facebook_groups",
          canonicalUrl: GROUP_URL,
          displayName: "Independent Retailers",
          qualification: "relevant",
          notes: null,
        },
      ],
    });
    assert.equal(listed.ok, true);
    if (!listed.ok) return;
    assert.equal(listed.saves[0]?.canonicalUrl, GROUP_URL);
  });

  it("keeps community intelligence copy aligned across six dictionaries", () => {
    const canonical = collectKeyPaths(en.communityIntelligence);
    assert.ok(canonical.includes("communityIntelligence") === false);
    assert.ok(canonical.includes("findCommunities"));
    assert.ok(canonical.includes("errors.providerUnavailable"));
    assert.ok(canonical.includes("errors.notInCatalog"));
    assert.ok(canonical.includes("errors.communitySuppressed"));
    assert.ok(canonical.includes("errors.invalidCommunityUrl"));
    assert.ok(canonical.includes("suggestedConversationFollowUp"));
    assert.ok(canonical.includes("manualUrlLabel"));
    assert.ok(canonical.includes("suggestedContributionLabel"));
    assert.ok(canonical.includes("copySuggestion"));
    for (const [language, dictionary] of Object.entries(dictionaries)) {
      assert.deepEqual(
        collectKeyPaths(dictionary.communityIntelligence),
        canonical,
        language,
      );
      assert.notEqual(
        dictionary.communityIntelligence.findCommunities.trim(),
        "",
        language,
      );
    }
  });
});
