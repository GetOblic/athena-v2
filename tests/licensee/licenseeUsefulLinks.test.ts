/**
 * Licensee Master Useful Links: Own Company author authority and claim URLs.
 */

import "../getoblicDirectory/getoblicDirectoryTestEnv";

import assert from "node:assert/strict";
import { createElement } from "react";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, it } from "node:test";
import { renderToStaticMarkup } from "react-dom/server";
import { LicenseeUsefulLinksCard } from "../../components/licensee/LicenseeUsefulLinksCard";
import { LicenseeUsefulLinksPanel } from "../../components/licensee/LicenseeUsefulLinksPanel";
import { en } from "../../lib/tenantI18n/messages/en";
import { buildLicenseeUsefulLinks } from "../../lib/licensee/licenseeUsefulLinksPresentation";
import { resolveLicenseeUsefulLinksAuthor } from "../../services/licensee/licenseeUsefulLinksAuthor";
import type { GetOblicDirectorySettingsResult } from "../../services/getoblicDirectory/getoblicDirectoryTypes";
import { ORGANIZATION_LANGUAGES } from "../../services/organizationLanguage";

const ROOT = process.cwd();
const OWN_COMPANY = "33333333-3333-4333-8333-333333333333";
const OTHER_ORG = "55555555-5555-4555-8555-555555555555";
const AUTHOR = 42;

const PATHS = {
  aiAgents: "/business-portfolio-ai-agent-page",
  virtualPhone: "/business-portfolio-virtual-line-page",
  calendar: "/business-portfolio-booking-page",
} as const;

const FRENCH_PATHS = {
  aiAgents: "/business-portfolio-agent-ia",
  virtualPhone: "/business-portfolio-ligne-virtuelle",
  calendar: "/business-portfolio-calendrier-ia",
} as const;

function read(relativePath: string): string {
  return readFileSync(join(ROOT, relativePath), "utf8");
}

function settingsResult(
  wordpressAuthorId: number | null,
): GetOblicDirectorySettingsResult {
  return {
    configured: true,
    settings: {
      organization_id: OWN_COMPANY,
      monthly_allowance: 4,
      wordpress_author_id: wordpressAuthorId,
      created_at: "2026-01-01T00:00:00.000Z",
      updated_at: "2026-01-01T00:00:00.000Z",
      updated_by_user_id: null,
    },
  };
}

function assertClosed(value: unknown) {
  assert.equal(buildLicenseeUsefulLinks(value, "en"), null);
  assert.equal(buildLicenseeUsefulLinks(value, "fr"), null);
}

function assertAuthorOnlyClaim(
  href: string,
  pathname: string,
) {
  const url = new URL(href);
  assert.equal(url.origin, "https://claim.getoblic.com");
  assert.equal(url.pathname, pathname);
  assert.deepEqual([...url.searchParams.keys()], ["author_id"]);
  assert.equal(url.searchParams.get("author_id"), String(AUTHOR));
  assert.equal(url.searchParams.get("contact_id"), null);
  assert.equal(url.searchParams.get("business_name"), null);
  assert.equal(url.searchParams.get("language"), null);
  assert.equal(url.searchParams.get("locale"), null);
  assert.equal(url.hash, "");
}

describe("Licensee Useful Links — URL builder", () => {
  it("builds exactly three claim URLs for a positive safe author", () => {
    const links = buildLicenseeUsefulLinks(AUTHOR, "en");
    assert.ok(links);
    const hrefs = [links.aiAgentsHref, links.virtualPhoneHref, links.calendarHref];
    assert.deepEqual(
      hrefs.map((href) => new URL(href).pathname),
      [PATHS.aiAgents, PATHS.virtualPhone, PATHS.calendar],
    );
    for (const href of hrefs) {
      const url = new URL(href);
      assert.equal(url.origin, "https://claim.getoblic.com");
      assert.deepEqual([...url.searchParams.keys()], ["author_id"]);
      assert.equal(url.searchParams.get("author_id"), String(AUTHOR));
      assert.equal(url.searchParams.get("contact_id"), null);
      assert.equal(url.searchParams.get("business_name"), null);
      assert.equal(url.hash, "");
      assert.doesNotMatch(href, /contact_id|business_name|organization|licensee|email|allowance/);
    }
    assert.equal(
      links.aiAgentsHref,
      "https://claim.getoblic.com/business-portfolio-ai-agent-page?author_id=42",
    );
    assert.equal(
      links.virtualPhoneHref,
      "https://claim.getoblic.com/business-portfolio-virtual-line-page?author_id=42",
    );
    assert.equal(
      links.calendarHref,
      "https://claim.getoblic.com/business-portfolio-booking-page?author_id=42",
    );
  });

  it("fails closed for invalid authors and accepts no caller base URL", () => {
    assertClosed(0);
    assertClosed(-7);
    assertClosed(1.5);
    assertClosed(Number.MAX_SAFE_INTEGER + 2);
    assertClosed(null);
    assertClosed(undefined);
    assertClosed("");
    assertClosed("42");
    assert.equal(buildLicenseeUsefulLinks.length, 2);
    const source = read("lib/licensee/licenseeUsefulLinksPresentation.ts");
    assert.match(source, /https:\/\/claim\.getoblic\.com/);
    assert.match(
      source,
      /export function buildLicenseeUsefulLinks\(\s*authorId: unknown,\s*language: OrganizationLanguage,\s*\)/,
    );
    assert.doesNotMatch(source, /baseUrl|baseURL|origin:\s*string/);
    assert.doesNotMatch(source, /contact_id|business_name/);
    assert.doesNotMatch(source, /searchParams\.set\("language"\)|searchParams\.set\("locale"\)/);
    assert.doesNotMatch(source, /Accept-Language|navigator\.language/);
    assert.doesNotMatch(source, /getOblicFunnelPresentation|getOblicFunnelAuthor/);
  });

  it("uses French claim paths only when the Licensee language is fr", () => {
    for (const language of ORGANIZATION_LANGUAGES) {
      const links = buildLicenseeUsefulLinks(AUTHOR, language);
      assert.ok(links, language);
      const expected = language === "fr" ? FRENCH_PATHS : PATHS;
      assertAuthorOnlyClaim(links.aiAgentsHref, expected.aiAgents);
      assertAuthorOnlyClaim(links.virtualPhoneHref, expected.virtualPhone);
      assertAuthorOnlyClaim(links.calendarHref, expected.calendar);
      assert.doesNotMatch(
        `${links.aiAgentsHref} ${links.virtualPhoneHref} ${links.calendarHref}`,
        /[?&](contact_id|business_name|language|locale)=/,
      );
    }
    const french = buildLicenseeUsefulLinks(AUTHOR, "fr");
    assert.ok(french);
    assert.equal(
      french.aiAgentsHref,
      "https://claim.getoblic.com/business-portfolio-agent-ia?author_id=42",
    );
    assert.equal(
      french.virtualPhoneHref,
      "https://claim.getoblic.com/business-portfolio-ligne-virtuelle?author_id=42",
    );
    assert.equal(
      french.calendarHref,
      "https://claim.getoblic.com/business-portfolio-calendrier-ia?author_id=42",
    );
  });
});

describe("Licensee Useful Links — author resolver", () => {
  it("returns the author only from the supplied Own Company id", async () => {
    const queried: string[] = [];
    const author = await resolveLicenseeUsefulLinksAuthor(OWN_COMPANY, async (organizationId) => {
      queried.push(organizationId);
      return settingsResult(AUTHOR);
    });
    assert.equal(author, AUTHOR);
    assert.deepEqual(queried, [OWN_COMPANY]);
    assert.equal(queried.includes(OTHER_ORG), false);
  });

  it("does not query settings when Own Company is missing", async () => {
    let queried = 0;
    const getSettings = async () => {
      queried += 1;
      return settingsResult(AUTHOR);
    };
    assert.equal(await resolveLicenseeUsefulLinksAuthor(null, getSettings), null);
    assert.equal(await resolveLicenseeUsefulLinksAuthor(undefined, getSettings), null);
    assert.equal(await resolveLicenseeUsefulLinksAuthor("   ", getSettings), null);
    assert.equal(queried, 0);
  });

  it("fails closed when settings are missing, unreadable, or the author is invalid", async () => {
    assert.equal(
      await resolveLicenseeUsefulLinksAuthor(OWN_COMPANY, async () => ({
        configured: false,
        code: "GETOBLIC_DIRECTORY_NOT_CONFIGURED",
      })),
      null,
    );
    assert.equal(
      await resolveLicenseeUsefulLinksAuthor(OWN_COMPANY, async () => {
        throw new Error("settings read failed");
      }),
      null,
    );
    for (const invalid of [null, 0, -3, 1.5, Number.MAX_SAFE_INTEGER + 2]) {
      assert.equal(
        await resolveLicenseeUsefulLinksAuthor(
          OWN_COMPANY,
          async () => settingsResult(invalid as number | null),
        ),
        null,
      );
    }
  });

  it("does not use Prospect, managed-client, or listing author paths", () => {
    const author = read("services/licensee/licenseeUsefulLinksAuthor.ts");
    const page = read("app/licensee/useful-links/page.tsx");
    const presentation = read("lib/licensee/licenseeUsefulLinksPresentation.ts");
    for (const source of [author, page, presentation]) {
      assert.doesNotMatch(source, /resolveLicenseeOwnCompanyGetOblicAuthorId/);
      assert.doesNotMatch(source, /listControllingLicenseeAccountsForOrganization/);
      assert.doesNotMatch(source, /getOblicFunnelAuthor/);
      assert.doesNotMatch(source, /getOblicFunnelPresentation/);
      assert.doesNotMatch(source, /athena_getoblic_listing_links|wordpress_listing_id/);
      assert.doesNotMatch(source, /\.insert\(|\.update\(|\.upsert\(|\.delete\(/);
    }
    assert.match(author, /getGetOblicDirectorySettings/);
    assert.match(author, /ownCompanyOrganizationId/);
  });
});

describe("Licensee Useful Links — page security", () => {
  it("uses the authenticated Licensee Master Own Company and ignores request author input", () => {
    const page = read("app/licensee/useful-links/page.tsx");
    const panel = read("components/licensee/LicenseeUsefulLinksPanel.tsx");
    assert.match(page, /export const dynamic = "force-dynamic"/);
    assert.match(page, /createSupabaseServerClient/);
    assert.match(page, /supabase\.auth\.getUser\(\)/);
    assert.match(page, /getLicenseeAccountByUserId\(user\.id\)/);
    assert.match(page, /isAccountAccessActive\(user\.id\)/);
    assert.match(page, /LICENSEE_MASTER_MARKER_COOKIE/);
    assert.match(page, /getLicenseeLocalization\(\s*licenseeAccount\.default_language/);
    assert.match(page, /licenseeAccount\.own_company_organization_id/);
    assert.match(page, /resolveLicenseeUsefulLinksAuthor\(ownCompanyOrganizationId\)/);
    assert.match(
      page,
      /buildLicenseeUsefulLinks\(\s*authorId,\s*licenseeAccount\.default_language\s*,?\s*\)/,
    );
    assert.doesNotMatch(page, /searchParams/);
    assert.doesNotMatch(page, /Accept-Language|accept-language/);
    assert.doesNotMatch(page, /navigator\.language|navigator\.languages/);
    assert.doesNotMatch(page, /request\.json|request\.body/);
    assert.doesNotMatch(page, /author_id/);
    assert.doesNotMatch(page, /monthly_allowance|updated_by_user_id|getoblic_account_email/);
    assert.match(panel, /target="_blank"/);
    assert.match(panel, /rel="noopener noreferrer"/);
    assert.doesNotMatch(panel, /searchParams|author_id|monthly_allowance/);
  });
});

describe("Licensee Useful Links — availability", () => {
  const links = buildLicenseeUsefulLinks(AUTHOR, "en");
  assert.ok(links);

  it("renders three external links when the Own Company author is valid", () => {
    const html = renderToStaticMarkup(
      createElement(LicenseeUsefulLinksPanel, {
        messages: en.licensee,
        state: { status: "ready", links },
      }),
    );
    assert.match(html, /AI Agents/);
    assert.match(html, /Virtual Phone/);
    assert.match(html, /Calendar/);
    assert.equal((html.match(/claim\.getoblic\.com/g) ?? []).length, 3);
    assert.match(html, new RegExp(`href="${links.aiAgentsHref.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}"`));
    assert.match(html, /target="_blank"/);
    assert.match(html, /rel="noopener noreferrer"/);
    assert.doesNotMatch(html, /contact_id|business_name|monthly_allowance/);
  });

  it("renders no external claim links without an Own Company", () => {
    const html = renderToStaticMarkup(
      createElement(LicenseeUsefulLinksPanel, {
        messages: en.licensee,
        state: { status: "no_own_company" },
      }),
    );
    assert.match(html, /Designate your company account/);
    assert.match(html, /Master dashboard/);
    assert.doesNotMatch(html, /claim\.getoblic\.com/);
    assert.doesNotMatch(html, /<a\b/);
    assert.doesNotMatch(html, /href=/);
  });

  it("renders no external claim links when the author mapping is missing", () => {
    const html = renderToStaticMarkup(
      createElement(LicenseeUsefulLinksPanel, {
        messages: en.licensee,
        state: { status: "unavailable" },
      }),
    );
    assert.match(html, /Links unavailable/);
    assert.doesNotMatch(html, /claim\.getoblic\.com/);
    assert.doesNotMatch(html, /<a\b/);
    assert.doesNotMatch(html, /href=/);
  });

  it("keeps the dashboard card internal and full-width above search", () => {
    const html = renderToStaticMarkup(
      createElement(LicenseeUsefulLinksCard, { messages: en.licensee }),
    );
    assert.match(html, /href="\/licensee\/useful-links"/);
    assert.match(html, /Useful Links/);
    assert.match(html, /Open →/);
    assert.doesNotMatch(html, /claim\.getoblic\.com/);
    const page = read("app/licensee/page.tsx");
    const plan = page.indexOf("<LicenseePlanSection");
    const card = page.indexOf("<LicenseeUsefulLinksCard");
    const client = page.indexOf("<LicenseeDashboardClient");
    assert.ok(plan >= 0 && card > plan && client > card);
    assert.doesNotMatch(page, /claim\.getoblic\.com|author_id/);
    assert.match(page, /searchParams\?: Promise<\{ created\?: string; linked\?: string; message\?: string \}>/);
  });
});
