import "./licenseeAuthTestEnv";

import assert from "node:assert/strict";
import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, it } from "node:test";

const ROOT = process.cwd();

/**
 * Session-scoped Client routes that may read or write the source Prospect's
 * saved GetOblic content. Identity comes only from the authenticated
 * organization and one active conversion. Caller-supplied Prospect, source
 * organization, and Licensee ids stay rejected.
 */
const AUTHORIZED_ACTIVE_CONVERSION_API_ROUTES = [
  "app/api/client-prospect-intelligence/availability/route.ts",
  "app/api/client-prospect-intelligence/getoblic-content/route.ts",
  "app/api/client-prospect-intelligence/getoblic-content-draft/description/route.ts",
  "app/api/client-prospect-intelligence/getoblic-content-draft/knowledge-base/route.ts",
  "app/api/client-prospect-intelligence/getoblic-publication/description/route.ts",
  "app/api/client-prospect-intelligence/getoblic-publication/knowledge-base/route.ts",
] as const;

function isAuthorizedActiveConversionRoute(routePath: string): boolean {
  return (AUTHORIZED_ACTIVE_CONVERSION_API_ROUTES as readonly string[]).includes(
    routePath,
  );
}

function read(relativePath: string): string {
  return readFileSync(join(ROOT, relativePath), "utf8");
}

function listApiRoutes(dir: string): string[] {
  const entries = readdirSync(join(ROOT, dir), { withFileTypes: true });
  const files: string[] = [];
  for (const entry of entries) {
    const relative = `${dir}/${entry.name}`;
    if (entry.isDirectory()) {
      files.push(...listApiRoutes(relative));
    } else if (entry.name === "route.ts") {
      files.push(relative);
    }
  }
  return files;
}

describe("BIC-1 conversion orchestration contract", () => {
  it("hydrates after durable conversion, alreadyActive, and reattach — never inside provisioning", () => {
    const conversion = read(
      "services/licensee/licenseeProspectClientConversion.ts",
    );
    const hydration = read(
      "services/licensee/licenseeProspectClientIntelligenceHydration.ts",
    );

    assert.match(
      conversion,
      /hydrateLicenseeProspectClientIntelligence|tryHydrateLicenseeProspectClientIntelligence/,
    );
    assert.match(conversion, /CONTINUITY_HYDRATION_FAILED|continuityState/);
    assert.match(conversion, /continuityInitialized/);
    assert.match(
      conversion,
      /website: prospect\.website[\s\S]*websiteIntelligence: prospect\.website_intelligence/,
    );

    const provisionFn = conversion.slice(
      conversion.indexOf("async function provisionClientSubAccount"),
      conversion.indexOf("function mapProvisioningIdentityError"),
    );
    assert.doesNotMatch(
      provisionFn,
      /hydrateLicenseeProspectClientIntelligence/,
    );

    const finishFn = conversion.slice(
      conversion.indexOf("async function finishFirstConversion"),
      conversion.indexOf("async function requireGetOblicOwnershipForConversion"),
    );
    assert.doesNotMatch(
      finishFn,
      /hydrateLicenseeProspectClientIntelligence/,
    );

    assert.match(hydration, /sanitizeReusableWebsiteIntelligence/);
    assert.doesNotMatch(hydration, /function sanitize/);
    assert.doesNotMatch(conversion, /upsertAthenaIdentity|compileMasterIdentityProfile/);
    assert.doesNotMatch(conversion, /generateReview|openrouter|OpenRouter/i);
    assert.doesNotMatch(
      conversion,
      /athena_website_deep_scrape_jobs|deepScrapeExecutor/,
    );
    assert.doesNotMatch(conversion, /select\(\s*["']\*["']\s*\)/);
    assert.doesNotMatch(hydration, /select\(\s*["']\*["']\s*\)/);
  });

  it("keeps hydration fail-open and reports continuity state", () => {
    const conversion = read(
      "services/licensee/licenseeProspectClientConversion.ts",
    );
    const route = read("app/api/prospects/[id]/convert-to-client/route.ts");

    assert.match(conversion, /CONTINUITY_HYDRATION_FAILED/);
    assert.match(conversion, /console\.warn/);
    assert.match(conversion, /continuityState: LicenseeProspectClientContinuityState/);
    assert.match(conversion, /try \{/);
    assert.match(route, /continuityInitialized/);
    assert.match(route, /continuityState/);
    assert.doesNotMatch(route, /from\("prospects"\)/);
    assert.doesNotMatch(route, /hydrateLicenseeProspectClientIntelligence/);
  });

  it("does not add an unauthorized client→Prospect read API", () => {
    const routes = listApiRoutes("app/api");
    for (const routePath of AUTHORIZED_ACTIVE_CONVERSION_API_ROUTES) {
      assert.ok(routes.includes(routePath), routePath);
    }

    for (const routePath of routes) {
      const source = read(routePath);
      assert.doesNotMatch(source, /inheritedProspect|readProspectForClient/);
      assert.doesNotMatch(source, /hydrateLicenseeProspectClientIntelligence/);

      if (routePath.startsWith("app/api/client-prospect-intelligence/")) {
        assert.equal(isAuthorizedActiveConversionRoute(routePath), true, routePath);
      }

      if (isAuthorizedActiveConversionRoute(routePath)) {
        assert.match(source, /requireCurrentOrganizationContext\(\)/);
        assert.match(
          source,
          /resolveClientProspectIntelligenceAuthority\(organizationId\)|clientOrganizationId:\s*organizationId/,
        );
        assert.doesNotMatch(
          source,
          /from\("prospects"\)|from\("athena_identity"\)|client_organization/,
        );
        assert.doesNotMatch(
          source,
          /prospectId|sourceOrganizationId|source_organization_id|prospect_id|licenseeAccountId|licensee_account_id/,
        );
        continue;
      }

      assert.doesNotMatch(source, /clientProspectIntelligence/);
      if (routePath.includes("convert-to-client")) {
        continue;
      }
      if (
        routePath.includes("prospects") &&
        source.includes("from(\"prospects\")")
      ) {
        assert.doesNotMatch(
          source,
          /requireCurrentOrganizationContext[\s\S]*client_organization/,
        );
      }
    }
    assert.ok(
      routes.includes("app/api/prospects/[id]/convert-to-client/route.ts"),
    );
  });

  it("does not reverse-sync Identity on restore and does not mutate GetOblic from hydration", () => {
    const reverse = read(
      "services/licensee/licenseeProspectClientConversion.ts",
    ).slice(
      read("services/licensee/licenseeProspectClientConversion.ts").indexOf(
        "export async function reverseLicenseeProspectClientConversion",
      ),
    );
    assert.doesNotMatch(reverse, /athena_identity|website_intelligence/);
    assert.doesNotMatch(reverse, /hydrateLicenseeProspectClientIntelligence/);

    const hydration = read(
      "services/licensee/licenseeProspectClientIntelligenceHydration.ts",
    );
    assert.doesNotMatch(
      hydration,
      /athena_getoblic_listing_links|GETOBLIC_LISTING_LINKS_TABLE/,
    );
    assert.doesNotMatch(hydration, /from\("prospects"\)/);
  });
});
