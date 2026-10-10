/**
 * GL-LIC-1C — Licensee Useful Links reuses the tenant GetOblic Links card.
 */

import "../getoblicDirectory/getoblicDirectoryTestEnv";

import assert from "node:assert/strict";
import { createElement } from "react";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, it } from "node:test";
import { renderToStaticMarkup } from "react-dom/server";
import {
  DEFAULT_GETOBLIC_LINKS_API_BASE,
  GetOblicLinksCard,
  getOblicLinksApiUrl,
} from "../../components/identity/GetOblicLinksCard";
import {
  getOblicLinksHistoryStorageKey,
  readGetOblicLinksHistory,
  writeGetOblicLinksHistory,
} from "../../lib/getoblic-links/history";
import { parseCreateLinkBody } from "../../lib/getoblic-links/validation";
import { getTenantMessages } from "../../lib/tenantI18n/getTenantMessages";
import { LicenseeAccessError } from "../../services/licensee/licenseeIdentity";
import {
  assertNoLicenseeGetOblicOrganizationSelection,
  LicenseeGetOblicLinksAccessError,
  requireLicenseeGetOblicLinksAccess,
} from "../../services/licensee/licenseeGetOblicLinksAccess";
import { ORGANIZATION_LANGUAGES } from "../../services/organizationLanguage";
import type { GetOblicLinkHistoryEntry } from "../../lib/getoblic-links/types";

const ROOT = process.cwd();
const OWN_COMPANY = "33333333-3333-4333-8333-333333333333";
const OTHER_ORG = "55555555-5555-4555-8555-555555555555";
const MASTER_USER = "11111111-1111-4111-8111-111111111111";
const LICENSEE_API_BASE = "/api/licensee/getoblic-links";

const LICENSEE_ROUTES = [
  "app/api/licensee/getoblic-links/route.ts",
  "app/api/licensee/getoblic-links/health/route.ts",
  "app/api/licensee/getoblic-links/[slug]/route.ts",
];

const TENANT_ROUTES = [
  "app/api/getoblic-links/route.ts",
  "app/api/getoblic-links/health/route.ts",
  "app/api/getoblic-links/[slug]/route.ts",
];

function read(relativePath: string): string {
  return readFileSync(join(ROOT, relativePath), "utf8");
}

class MemoryStorage {
  private data = new Map<string, string>();

  getItem(key: string): string | null {
    return this.data.has(key) ? (this.data.get(key) as string) : null;
  }

  setItem(key: string, value: string): void {
    this.data.set(key, value);
  }
}

function historyEntry(): GetOblicLinkHistoryEntry {
  return {
    slug: "salon",
    short_url: "https://link.getoblic.com/salon",
    url: "https://example.com/book",
    template: "custom",
    created_at: "2026-10-10T00:00:00.000Z",
    label: "My Company",
  };
}

describe("Licensee GetOblic Links — authorization", () => {
  it("requires an authenticated user before reading a Master account", async () => {
    let masterReads = 0;
    await assert.rejects(
      () =>
        requireLicenseeGetOblicLinksAccess({
          getUserId: async () => "   ",
          requireMaster: async () => {
            masterReads += 1;
            return { own_company_organization_id: OWN_COMPANY };
          },
        }),
      (error: unknown) => {
        assert.ok(error instanceof LicenseeGetOblicLinksAccessError);
        assert.equal(error.status, 401);
        assert.equal(error.code, "UNAUTHORIZED");
        return true;
      },
    );
    assert.equal(masterReads, 0);
  });

  it("requires an active Licensee Master", async () => {
    await assert.rejects(
      () =>
        requireLicenseeGetOblicLinksAccess({
          getUserId: async () => MASTER_USER,
          requireMaster: async () => {
            throw new LicenseeAccessError(
              "This Master account has been deactivated.",
            );
          },
        }),
      (error: unknown) => {
        assert.ok(error instanceof LicenseeGetOblicLinksAccessError);
        assert.equal(error.status, 403);
        assert.equal(error.code, "FORBIDDEN");
        return true;
      },
    );
  });

  it("requires My Company and trims the stored organization id", async () => {
    for (const ownCompanyOrganizationId of [null, "", "   "]) {
      await assert.rejects(
        () =>
          requireLicenseeGetOblicLinksAccess({
            getUserId: async () => MASTER_USER,
            requireMaster: async () => ({ own_company_organization_id: ownCompanyOrganizationId }),
          }),
        (error: unknown) => {
          assert.ok(error instanceof LicenseeGetOblicLinksAccessError);
          assert.equal(error.status, 403);
          assert.equal(error.code, "OWN_COMPANY_REQUIRED");
          return true;
        },
      );
    }

    const access = await requireLicenseeGetOblicLinksAccess({
      getUserId: async () => MASTER_USER,
      requireMaster: async (userId) => {
        assert.equal(userId, MASTER_USER);
        return { own_company_organization_id: `  ${OWN_COMPANY}  ` };
      },
    });
    assert.deepEqual(access, {
      userId: MASTER_USER,
      organizationId: OWN_COMPANY,
    });
  });

  it("rejects managed-client organization selection from the query or body", () => {
    const keys = [
      "organizationId",
      "organization_id",
      "clientOrganizationId",
      "client_organization_id",
      "own_company_organization_id",
    ];
    for (const key of keys) {
      assert.throws(
        () =>
          assertNoLicenseeGetOblicOrganizationSelection(
            new Request(`https://athena.local/api/licensee/getoblic-links?${key}=${OTHER_ORG}`),
          ),
        (error: unknown) => {
          assert.ok(error instanceof LicenseeGetOblicLinksAccessError);
          assert.equal(error.code, "ORGANIZATION_SELECTION_REJECTED");
          return true;
        },
      );
      assert.throws(
        () =>
          assertNoLicenseeGetOblicOrganizationSelection(
            new Request("https://athena.local/api/licensee/getoblic-links"),
            { url: "https://example.com", [key]: OTHER_ORG },
          ),
        (error: unknown) => {
          assert.ok(error instanceof LicenseeGetOblicLinksAccessError);
          assert.equal(error.status, 400);
          return true;
        },
      );
    }

    assert.doesNotThrow(() =>
      assertNoLicenseeGetOblicOrganizationSelection(
        new Request("https://athena.local/api/licensee/getoblic-links"),
        { url: "https://example.com/book", slug: "salon" },
      ),
    );

    const input = parseCreateLinkBody({
      url: "https://example.com/book",
      organizationId: OTHER_ORG,
      organization_id: OTHER_ORG,
    });
    assert.equal(input.url, "https://example.com/book");
    assert.equal("organizationId" in input, false);
    assert.equal("organization_id" in input, false);
  });

  it("licensee routes authorize the Master and keep the Worker client unchanged", () => {
    const access = read("services/licensee/licenseeGetOblicLinksAccess.ts");
    assert.match(access, /supabase\.auth\.getUser\(\)/);
    assert.match(access, /requireLicenseeMasterAccount/);
    assert.match(access, /own_company_organization_id/);
    assert.doesNotMatch(access, /licensee_sub_accounts/);
    assert.doesNotMatch(access, /requireCurrentOrganizationContext/);
    assert.doesNotMatch(access, /GETOBLIC_LINKS_API_KEY/);
    assert.doesNotMatch(access, /\.(insert|update|upsert|delete|rpc)\(/);

    for (const file of LICENSEE_ROUTES) {
      const source = read(file);
      assert.match(source, /export const runtime = "nodejs"/);
      assert.match(source, /export const dynamic = "force-dynamic"/);
      assert.match(source, /requireLicenseeGetOblicLinksAccess/);
      assert.match(source, /assertNoLicenseeGetOblicOrganizationSelection/);
      assert.match(source, /licenseeGetOblicLinksJson|licenseeGetOblicLinksError/);
      assert.match(source, /from "@\/lib\/getoblic-links\/server"/);
      assert.doesNotMatch(source, /requireCurrentOrganizationContext/);
      assert.doesNotMatch(source, /licensee_sub_accounts/);
      assert.doesNotMatch(source, /GETOBLIC_LINKS_API_KEY/);
      assert.doesNotMatch(source, /searchParams\.get/);
      assert.doesNotMatch(source, /body\.organizationId|record\.organizationId/);
      assert.doesNotMatch(source, /\.(insert|update|upsert|delete|rpc)\(/);
    }

    const response = read("lib/getoblic-links/licenseeRouteResponse.ts");
    assert.match(response, /Cache-Control": "no-store"/);
    assert.match(response, /toAthenaApiError/);
    assert.doesNotMatch(response, /\.(insert|update|upsert|delete|rpc)\(/);

    const createRoute = read("app/api/licensee/getoblic-links/route.ts");
    const slugRoute = read("app/api/licensee/getoblic-links/[slug]/route.ts");
    const healthRoute = read("app/api/licensee/getoblic-links/health/route.ts");
    assert.match(createRoute, /createGetOblicLink/);
    assert.match(createRoute, /parseCreateLinkBody/);
    assert.match(healthRoute, /getGetOblicLinksHealth/);
    assert.match(slugRoute, /getGetOblicLink/);
    assert.match(slugRoute, /updateGetOblicLink/);
    assert.match(slugRoute, /deleteGetOblicLink/);
    assert.match(slugRoute, /parseUpdateLinkBody/);
    assert.match(slugRoute, /normalizeSlug/);
  });

  it("leaves tenant GetOblic Links routes on organization context", () => {
    for (const file of TENANT_ROUTES) {
      const source = read(file);
      assert.match(source, /requireCurrentOrganizationContext/);
      assert.doesNotMatch(source, /requireLicenseeGetOblicLinksAccess/);
      assert.doesNotMatch(source, /licenseeGetOblicLinks/);
    }
    const identity = read("app/identity/page.tsx");
    assert.match(identity, /<GetOblicLinksCard/);
    assert.doesNotMatch(identity, /apiBase/);
    assert.doesNotMatch(identity, /\/api\/licensee\/getoblic-links/);
  });
});

describe("Licensee GetOblic Links — component reuse", () => {
  it("builds tenant and licensee URLs from one api base", () => {
    assert.equal(DEFAULT_GETOBLIC_LINKS_API_BASE, "/api/getoblic-links");
    assert.equal(getOblicLinksApiUrl(DEFAULT_GETOBLIC_LINKS_API_BASE, "health"), "/api/getoblic-links/health");
    assert.equal(getOblicLinksApiUrl(LICENSEE_API_BASE), LICENSEE_API_BASE);
    assert.equal(
      getOblicLinksApiUrl(`${LICENSEE_API_BASE}/`, "health"),
      "/api/licensee/getoblic-links/health",
    );
    assert.equal(
      getOblicLinksApiUrl(LICENSEE_API_BASE, encodeURIComponent("Salon Link")),
      "/api/licensee/getoblic-links/Salon%20Link",
    );
    assert.equal(getOblicLinksApiUrl("  "), DEFAULT_GETOBLIC_LINKS_API_BASE);
  });

  it("keeps create, manage, details, and QR on the shared card", () => {
    const card = read("components/identity/GetOblicLinksCard.tsx");
    assert.equal((card.match(/\/api\/getoblic-links/g) ?? []).length, 1);
    assert.equal((card.match(/getOblicLinksApiUrl\(/g) ?? []).length, 7);
    assert.match(card, /method: "POST"/);
    assert.match(card, /method: "PATCH"/);
    assert.match(card, /method: "DELETE"/);
    assert.match(card, /url: destination/);
    assert.match(card, /disabled: !disabled/);
    assert.match(card, /renderGetOblicQrDataUrl/);
    assert.match(card, /downloadDataUrlPng/);
    assert.match(card, /messages\.createLink/);
    assert.match(card, /messages\.manageLinks/);
    assert.match(card, /messages\.latestLink/);
    assert.match(card, /messages\.qr/);
    assert.match(card, /messages\.enable/);
    assert.match(card, /messages\.disable/);
    assert.match(card, /messages\.delete/);
    assert.match(card, /messages\.saveDestination/);
    assert.doesNotMatch(card, /GETOBLIC_LINKS_API_KEY/);
    assert.doesNotMatch(card, /getoblic-links\/server/);

    const english = renderToStaticMarkup(
      createElement(GetOblicLinksCard, {
        organizationId: OWN_COMPANY,
        userId: MASTER_USER,
      }),
    );
    assert.match(english, /Create Link/);
    assert.match(english, /Manage Links/);
    assert.match(english, /Latest Link/);
    assert.doesNotMatch(english, /\/api\/licensee\/getoblic-links/);

    const french = getTenantMessages("fr").identity.getoblic;
    const localized = renderToStaticMarkup(
      createElement(GetOblicLinksCard, {
        organizationId: OWN_COMPANY,
        userId: MASTER_USER,
        apiBase: LICENSEE_API_BASE,
        messages: french,
      }),
    );
    assert.match(localized, new RegExp(french.createLink));
    assert.match(localized, new RegExp(french.manageLinks));
    assert.match(localized, new RegExp(french.latestLink));
  });

  it("mounts the existing card below claim links only when My Company exists", () => {
    const page = read("app/licensee/useful-links/page.tsx");
    const panelAt = page.indexOf("<LicenseeUsefulLinksPanel");
    const cardAt = page.indexOf("<GetOblicLinksCard");
    assert.ok(panelAt >= 0 && cardAt > panelAt);
    assert.match(page, /hasOwnCompany \?/);
    assert.match(page, /organizationId=\{resolvedOwnCompanyOrganizationId\}/);
    assert.match(page, /userId=\{user\.id\}/);
    assert.match(page, /apiBase="\/api\/licensee\/getoblic-links"/);
    assert.match(page, /language=\{licenseeAccount\.default_language\}/);
    assert.match(
      page,
      /getTenantMessages\(licenseeAccount\.default_language\)\.identity\s*\.getoblic/,
    );
    assert.match(page, /resolveLicenseeUsefulLinksAuthor\(ownCompanyOrganizationId\)/);
    const cardBlock = page.slice(cardAt, page.indexOf("/>", cardAt));
    assert.doesNotMatch(cardBlock, /authorId|wordpress_author_id/);
    assert.match(page, /browser-local/);
    assert.match(page, /handoff/);
  });
});

describe("Licensee GetOblic Links — browser-local history", () => {
  it("keys history by My Company and Master user and stays out of Supabase", () => {
    const storage = new MemoryStorage();
    const key = getOblicLinksHistoryStorageKey(OWN_COMPANY, MASTER_USER);
    assert.equal(key, `athena:getoblic-links:v1:${OWN_COMPANY}:${MASTER_USER}`);
    assert.equal(
      writeGetOblicLinksHistory(OWN_COMPANY, MASTER_USER, [historyEntry()], storage),
      true,
    );
    assert.equal(readGetOblicLinksHistory(OWN_COMPANY, MASTER_USER, storage).length, 1);
    assert.deepEqual(readGetOblicLinksHistory(OTHER_ORG, MASTER_USER, storage), []);

    const history = read("lib/getoblic-links/history.ts");
    const clearer = read("lib/licensee/clearHandoffBrowserStorage.ts");
    const keys = read("services/licensee/licenseeHandoffStorageKeys.ts");
    assert.match(history, /Browser-local GetOblic Links history/);
    assert.match(history, /Master\/sub-account handoff/);
    assert.doesNotMatch(history, /supabase|from\("/);
    assert.match(clearer, /athena:getoblic-links:v1:/);
    assert.match(clearer, /browser-local/);
    assert.match(keys, /athena:getoblic-links:v1:/);
    assert.match(keys, /Cleared on Master\/sub-account handoff/);
  });
});

describe("Licensee GetOblic Links — localization", () => {
  it("reuses identity.getoblic in all six languages", () => {
    const englishKeys = Object.keys(getTenantMessages("en").identity.getoblic).sort();
    assert.ok(englishKeys.includes("createLink"));
    assert.ok(englishKeys.includes("manageLinks"));
    for (const language of ORGANIZATION_LANGUAGES) {
      const dictionary = getTenantMessages(language).identity.getoblic;
      assert.deepEqual(Object.keys(dictionary).sort(), englishKeys, language);
      for (const key of englishKeys) {
        const value = dictionary[key as keyof typeof dictionary];
        assert.equal(typeof value, "string", `${language}.${key}`);
        assert.ok(value.trim().length > 0, `${language}.${key}`);
      }
    }
    const page = read("app/licensee/useful-links/page.tsx");
    assert.doesNotMatch(page, /usefulLinks\.getoblic|licensee\.getoblic/);
  });
});
