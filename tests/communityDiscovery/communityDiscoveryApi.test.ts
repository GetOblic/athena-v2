/**
 * COMMUNITY-INTELLIGENCE-1 Gate 3C — API and boundary contract.
 * Reads source. Does not boot Next.js or call a provider.
 */

import assert from "node:assert/strict";
import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, it } from "node:test";
import {
  COMMUNITY_DISCOVERY_OBJECTIVE_MAX_LENGTH,
  COMMUNITY_DISCOVERY_OBJECTIVE_MIN_LENGTH,
  COMMUNITY_DISCOVERY_QUALIFICATION_MAX_TOKENS,
  COMMUNITY_DISCOVERY_QUALIFICATION_TIMEOUT_MS,
  COMMUNITY_DISCOVERY_ROUTE_MAX_DURATION_SECONDS,
  COMMUNITY_DISCOVERY_SEARCH_LIMIT,
  COMMUNITY_DISCOVERY_SEARCH_TIMEOUT_MS,
  ORGANIZATION_COMMUNITY_NOTES_MAX_LENGTH,
  ORGANIZATION_COMMUNITY_SAVES_LIST_LIMIT,
} from "../../services/communityDiscovery/communityDiscoveryLimits";
import { SOCIAL_COMMUNITY_PLATFORMS } from "../../services/communityDiscovery/socialCommunityPlatform";

const ROOT = process.cwd();

function read(relativePath: string): string {
  return readFileSync(join(ROOT, relativePath), "utf8");
}

describe("community discovery API contract", () => {
  const discoveryRoute = read("app/api/community-discovery/route.ts");
  const savesRoute = read("app/api/community-discovery/saves/route.ts");
  const serviceFiles = readdirSync(join(ROOT, "services/communityDiscovery"))
    .filter((name) => name.endsWith(".ts"))
    .map((name) => read(`services/communityDiscovery/${name}`))
    .join("\n");
  const persistence = read(
    "services/communityDiscovery/communityDiscoveryPersistence.ts",
  );
  const discovery = read("services/communityDiscovery/discoverCommunities.ts");
  const openRouter = read("lib/openrouter.ts");
  const bounded = openRouter.slice(
    openRouter.indexOf("export async function callOpenRouterBounded"),
  );

  it("authenticates both routes with the current organization and ignores a body organization id", () => {
    for (const route of [discoveryRoute, savesRoute]) {
      assert.match(route, /requireCurrentOrganizationContext/);
      assert.match(route, /organizationId/);
      assert.doesNotMatch(route, /body\.organizationId|record\.organizationId/);
      assert.match(route, /Cache-Control": "no-store"/);
      assert.doesNotMatch(route, /export async function DELETE|export async function PATCH/);
    }
    assert.match(discoveryRoute, /export async function POST/);
    assert.doesNotMatch(discoveryRoute, /export async function GET/);
    assert.match(discoveryRoute, /discoverFacebookGroups/);
    assert.match(discoveryRoute, /createBraveCommunitySearchProvider/);
    assert.match(discoveryRoute, /signal: request\.signal/);
    assert.match(savesRoute, /export async function GET/);
    assert.match(savesRoute, /export async function POST/);
    assert.match(savesRoute, /saveOrganizationCommunity/);
    assert.match(savesRoute, /listSavedOrganizationCommunities/);
    assert.equal(
      COMMUNITY_DISCOVERY_ROUTE_MAX_DURATION_SECONDS,
      30,
    );
    assert.match(discoveryRoute, /maxDuration/);
  });

  it("keeps provider credentials server-side and stays inside the Gate 3A catalog", () => {
    assert.match(serviceFiles, /BRAVE_SEARCH_API_KEY/);
    assert.match(serviceFiles, /BRAVE_SEARCH_API_BASE_URL/);
    assert.doesNotMatch(serviceFiles, /NEXT_PUBLIC_/);
    assert.doesNotMatch(serviceFiles, /graph\.facebook\.com/i);
    assert.doesNotMatch(serviceFiles, /facebook\.com\/v\d+/i);
    assert.doesNotMatch(serviceFiles, /from\("discussions"/);
    assert.doesNotMatch(serviceFiles, /from\("communities"/);
    assert.doesNotMatch(serviceFiles, /workers\//);
    assert.doesNotMatch(serviceFiles, /cookie/i);
    assert.deepEqual(SOCIAL_COMMUNITY_PLATFORMS, ["facebook_groups"]);
    assert.match(persistence, /source: PUBLIC_COMMUNITY_CATALOG_SOURCE/);
    assert.match(persistence, /ignoreDuplicates: true/);
    assert.match(persistence, /onConflict: "platform,canonical_identity"/);
    assert.match(persistence, /onConflict: "organization_id,community_id"/);
    assert.match(persistence, /\.eq\("organization_id", organizationId\)/);
    assert.doesNotMatch(persistence, /snippet|raw_payload|description/);
    assert.doesNotMatch(discovery, /athena_organization_communities/);
    assert.match(discovery, /normalizeSocialCommunityUrl/);
    assert.equal(COMMUNITY_DISCOVERY_SEARCH_LIMIT, 10);
    assert.equal(COMMUNITY_DISCOVERY_SEARCH_TIMEOUT_MS, 8_000);
    assert.equal(COMMUNITY_DISCOVERY_QUALIFICATION_TIMEOUT_MS, 12_000);
    assert.equal(COMMUNITY_DISCOVERY_QUALIFICATION_MAX_TOKENS, 800);
    assert.equal(COMMUNITY_DISCOVERY_OBJECTIVE_MIN_LENGTH, 3);
    assert.equal(COMMUNITY_DISCOVERY_OBJECTIVE_MAX_LENGTH, 280);
    assert.equal(ORGANIZATION_COMMUNITY_SAVES_LIST_LIMIT, 100);
    assert.equal(ORGANIZATION_COMMUNITY_NOTES_MAX_LENGTH, 2000);
  });

  it("adds a bounded OpenRouter call without the generation retry loop", () => {
    const generation = openRouter.slice(
      0,
      openRouter.indexOf("export async function callOpenRouterBounded"),
    );
    const qualificationModel = read(
      "services/communityDiscovery/communityQualificationModel.ts",
    );
    const qualification = read(
      "services/communityDiscovery/communityDiscoveryQualification.ts",
    );
    const routing = read("lib/llm/modelRouting.ts");

    assert.match(openRouter, /export async function callOpenRouter\(/);
    assert.match(generation, /buildTokenBudgetSchedule/);
    assert.match(generation, /resolveCallModel/);
    assert.doesNotMatch(generation, /OPENROUTER_COMMUNITY_QUALIFICATION_MODEL/);
    assert.match(bounded, /signal: input\.signal/);
    assert.match(bounded, /max_tokens: maxTokens/);
    assert.doesNotMatch(bounded, /buildTokenBudgetSchedule/);
    assert.match(qualificationModel, /openai\/gpt-4\.1-nano/);
    assert.match(
      qualificationModel,
      /OPENROUTER_COMMUNITY_QUALIFICATION_MODEL/,
    );
    assert.match(qualification, /resolveCommunityQualificationModel/);
    assert.doesNotMatch(qualification, /OPENROUTER_ANALYSIS_MODEL|getLLMModelRoles/);
    assert.doesNotMatch(routing, /gpt-4\.1-nano|OPENROUTER_COMMUNITY_QUALIFICATION_MODEL/);
    assert.match(discovery, /qualifyDiscoveredCommunities/);
    assert.match(discovery, /status: "unavailable"/);
  });
});
