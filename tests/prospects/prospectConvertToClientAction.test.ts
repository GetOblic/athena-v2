/**
 * Phase 3 / 3A — Prospect detail Convert to Client CTA.
 * Own-Company eligibility + presentation and request-boundary checks. No DB I/O.
 */

import "../licensee/licenseeAuthTestEnv";

import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { afterEach, describe, it } from "node:test";
import { AppRouterContext } from "next/dist/shared/lib/app-router-context.shared-runtime";
import {
  CONVERT_TO_CLIENT_PRIMARY_ACTION,
  ProspectConvertToClientAction,
  convertToClientUserMessage,
  shouldShowConvertToClientCta,
  shouldShowConvertedToClientState,
} from "../../components/prospects/ProspectConvertToClientAction";
import {
  PROSPECT_HEADER_ACTION_BASE,
  PROSPECT_PRIMARY_ACTION,
  PROSPECT_STATUS_CHIP_SAVED,
} from "../../lib/prospects/prospectDetailPresentation";
import { shouldShowGetOblicListingReleaseAction } from "../../lib/prospects/getOblicListingReleasePresentation";
import { ProspectDetailHeader } from "../../components/prospects/ProspectDetailHeader";
import { supabaseAdmin } from "../../lib/supabaseAdmin";
import { isLicenseeOwnCompanyOrganization } from "../../services/licensee/licenseeIdentity";

const ROOT = process.cwd();

function read(relativePath: string): string {
  return readFileSync(join(ROOT, relativePath), "utf8");
}

const OWN_COMPANY_ORG_ID = "33333333-3333-4333-8333-333333333333";
const MANAGED_CLIENT_ORG_ID = "44444444-4444-4444-8444-444444444444";
const SIBLING_ORG_ID = "77777777-7777-4777-8777-777777777777";
const PLAIN_ORG_ID = "99999999-9999-4999-8999-999999999999";
const LICENSEE_ACCOUNT_ID = "11111111-1111-4111-8111-111111111111";

const stubRouter = {
  back() {},
  forward() {},
  refresh() {},
  push() {},
  replace() {},
  prefetch() {},
};

function renderConvertAction(
  conversionStatus: "none" | "active" | "reversed",
  canConvertProspectToClient = true,
  getoblic?: {
    isGetOblicDerivedProspect?: boolean;
    hasActiveGetOblicOwnership?: boolean;
  },
) {
  return renderToStaticMarkup(
    createElement(
      AppRouterContext.Provider,
      { value: stubRouter as never },
      createElement(ProspectConvertToClientAction, {
        prospectId: "5558bc85-3bea-4583-aa3c-35f20ded7026",
        businessName: "Acme Clinic",
        conversionStatus,
        canConvertProspectToClient,
        isGetOblicDerivedProspect: getoblic?.isGetOblicDerivedProspect,
        hasActiveGetOblicOwnership: getoblic?.hasActiveGetOblicOwnership,
      }),
    ),
  );
}

const originalFrom = supabaseAdmin.from.bind(supabaseAdmin);

function installOwnCompanyIdentity(ownCompanyOrganizationId: string | null) {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  (supabaseAdmin as any).from = (table: string) => {
    const filters: Record<string, string> = {};
    const builder = {
      select() {
        return builder;
      },
      eq(column: string, value: string) {
        filters[column] = value;
        return builder;
      },
      async maybeSingle() {
        if (table !== "licensee_accounts") {
          return { data: null, error: null };
        }
        if (
          ownCompanyOrganizationId &&
          filters.own_company_organization_id === ownCompanyOrganizationId
        ) {
          return { data: { id: LICENSEE_ACCOUNT_ID }, error: null };
        }
        return { data: null, error: null };
      },
    };
    return builder;
  };
}

function restoreSupabaseAdmin() {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  (supabaseAdmin as any).from = originalFrom;
}

afterEach(() => {
  restoreSupabaseAdmin();
});

describe("Prospect Convert to Client Own Company eligibility", () => {
  it("treats only the designated Own Company organization as convertible", async () => {
    installOwnCompanyIdentity(OWN_COMPANY_ORG_ID);

    assert.equal(await isLicenseeOwnCompanyOrganization(OWN_COMPANY_ORG_ID), true);
    assert.equal(await isLicenseeOwnCompanyOrganization(PLAIN_ORG_ID), false);
    assert.equal(
      await isLicenseeOwnCompanyOrganization(MANAGED_CLIENT_ORG_ID),
      false,
    );
    assert.equal(await isLicenseeOwnCompanyOrganization(SIBLING_ORG_ID), false);
    assert.equal(await isLicenseeOwnCompanyOrganization("  "), false);
  });

  it("does not infer eligibility from cookies, names, slugs, or /licensee chrome", () => {
    const identity = read("services/licensee/licenseeIdentity.ts");
    const page = read("app/prospects/[id]/page.tsx");
    const action = read(
      "components/prospects/ProspectConvertToClientAction.tsx",
    );
    assert.match(identity, /export async function isLicenseeOwnCompanyOrganization/);
    assert.match(
      identity,
      /\.eq\("own_company_organization_id", id\)/,
    );
    assert.match(page, /isLicenseeOwnCompanyOrganization\(organizationId\)/);
    assert.match(page, /canConvertProspectToClient=\{canConvertProspectToClient\}/);
    assert.match(page, /isGetOblicDerivedProspect=\{getoblicDerived\}/);
    assert.match(page, /hasActiveGetOblicOwnership=\{hasActiveGetOblicOwnership\}/);
    assert.doesNotMatch(page, /licenseeMasterMarker|licenseeOriginCookie/);
    assert.doesNotMatch(page, /document\.cookie|cookies\(\)/);
    assert.doesNotMatch(page, /href=["']\/licensee["']/);
    assert.doesNotMatch(action, /href=["']\/licensee["']/);
    assert.doesNotMatch(action, /document\.cookie/);
  });
});

describe("Prospect Convert to Client presentation", () => {
  it("shows Convert to Client for Own Company when there is no conversion", () => {
    assert.equal(
      shouldShowConvertToClientCta({
        canConvertProspectToClient: true,
        conversionStatus: "none",
      }),
      true,
    );
    const html = renderConvertAction("none", true);
    assert.match(html, /Convert to Client/);
    assert.match(html, /data-prospect-header-action="convert-to-client"/);
    assert.doesNotMatch(html, /Converted to Client/);
    assert.doesNotMatch(html, /type="email"/);
    assert.doesNotMatch(html, /@getoblic\.com/);
    assert.doesNotMatch(html, /disabled=""/);
  });

  it("shows the same Convert to Client CTA for Own Company after reversal", () => {
    assert.equal(
      shouldShowConvertToClientCta({
        canConvertProspectToClient: true,
        conversionStatus: "reversed",
      }),
      true,
    );
    const html = renderConvertAction("reversed", true);
    assert.match(html, /Convert to Client/);
    assert.match(html, /data-prospect-header-action="convert-to-client"/);
    assert.doesNotMatch(html, /Re-convert|Convert again|First conversion/);
    assert.doesNotMatch(html, /type="email"/);
  });

  it("shows Converted to Client for Own Company active and omits the Convert CTA", () => {
    assert.equal(
      shouldShowConvertToClientCta({
        canConvertProspectToClient: true,
        conversionStatus: "active",
      }),
      false,
    );
    assert.equal(
      shouldShowConvertedToClientState({
        canConvertProspectToClient: true,
        conversionStatus: "active",
      }),
      true,
    );
    const html = renderConvertAction("active", true);
    assert.doesNotMatch(
      html,
      /data-prospect-header-action="convert-to-client"/,
    );
    assert.match(html, /Converted to Client/);
    assert.match(html, /data-prospect-header-action="converted-to-client"/);
    assert.match(html, /<span/);
    assert.doesNotMatch(
      html,
      /data-prospect-header-action="converted-to-client"[^>]*\bbutton\b/,
    );
    assert.ok(html.includes(PROSPECT_STATUS_CHIP_SAVED));
    assert.doesNotMatch(html, /bg-\[var\(--athena-success\)\]/);
    assert.doesNotMatch(html, /bg-\[var\(--athena-orange\)\]/);
  });

  it("omits Convert to Client for an ordinary non-Licensee tenant", () => {
    assert.equal(
      shouldShowConvertToClientCta({
        canConvertProspectToClient: false,
        conversionStatus: "none",
      }),
      false,
    );
    const html = renderConvertAction("none", false);
    assert.equal(html, "");
    assert.doesNotMatch(html, /Convert to Client/);
    assert.doesNotMatch(html, /Converted to Client/);
    assert.doesNotMatch(html, /disabled/);
    assert.doesNotMatch(html, /Unable to convert/);
  });

  it("omits Convert to Client for a managed Licensee client/sub-account", () => {
    const html = renderConvertAction("none", false);
    assert.equal(html, "");
    assert.doesNotMatch(
      html,
      /data-prospect-header-action="convert-to-client"/,
    );
    assert.doesNotMatch(html, /authorization|not authorized|403/i);
  });

  it("shows Convert to Client for a GetOblic Prospect with an active claim", () => {
    assert.equal(
      shouldShowConvertToClientCta({
        canConvertProspectToClient: true,
        conversionStatus: "none",
        isGetOblicDerivedProspect: true,
        hasActiveGetOblicOwnership: true,
      }),
      true,
    );
    const html = renderConvertAction("reversed", true, {
      isGetOblicDerivedProspect: true,
      hasActiveGetOblicOwnership: true,
    });
    assert.match(html, /data-prospect-header-action="convert-to-client"/);
    assert.doesNotMatch(html, /disabled=""/);
  });

  it("omits Convert to Client for a released-only GetOblic Prospect", () => {
    assert.equal(
      shouldShowConvertToClientCta({
        canConvertProspectToClient: true,
        conversionStatus: "none",
        isGetOblicDerivedProspect: true,
        hasActiveGetOblicOwnership: false,
      }),
      false,
    );
    const html = renderConvertAction("reversed", true, {
      isGetOblicDerivedProspect: true,
      hasActiveGetOblicOwnership: false,
    });
    assert.equal(html, "");
    assert.doesNotMatch(html, /Convert to Client/);
    assert.doesNotMatch(html, /disabled/);
  });

  it("keeps Convert to Client for a manual Prospect without a GetOblic claim", () => {
    assert.equal(
      shouldShowConvertToClientCta({
        canConvertProspectToClient: true,
        conversionStatus: "none",
        isGetOblicDerivedProspect: false,
        hasActiveGetOblicOwnership: false,
      }),
      true,
    );
    const html = renderConvertAction("none", true, {
      isGetOblicDerivedProspect: false,
      hasActiveGetOblicOwnership: false,
    });
    assert.match(html, /Convert to Client/);
  });

  it("keeps Converted to Client when conversion is active", () => {
    const html = renderConvertAction("active", true, {
      isGetOblicDerivedProspect: true,
      hasActiveGetOblicOwnership: true,
    });
    assert.match(html, /Converted to Client/);
    assert.doesNotMatch(
      html,
      /data-prospect-header-action="convert-to-client"/,
    );
  });

  it("omits Convert to Client for a sibling/non-Own-Company organization", () => {
    assert.equal(
      shouldShowConvertedToClientState({
        canConvertProspectToClient: false,
        conversionStatus: "active",
      }),
      false,
    );
    const html = renderConvertAction("reversed", false);
    assert.equal(html, "");
    assert.doesNotMatch(html, /Convert to Client/);
    assert.doesNotMatch(html, /Converted to Client/);
  });

  it("keeps a direct active Prospect header renderable", () => {
    const html = renderToStaticMarkup(
      createElement(
        AppRouterContext.Provider,
        { value: stubRouter as never },
        createElement(ProspectDetailHeader, {
          backLabel: "Prospects",
          eyebrow: "Prospect",
          title: "Acme Clinic",
          intelligenceLabel: "Ready",
          intelligenceStatus: "Ready",
          ready: true,
          hasDiscussion: false,
          askAthenaLabel: "Ask Athena",
          addObservationLabel: "Add observation",
          editProfileLabel: "Edit profile",
          openWebsiteLabel: "Open website",
          completenessScore: null,
          generateActions: null,
          researchAction: null,
          clientConversionAction: createElement(ProspectConvertToClientAction, {
            prospectId: "5558bc85-3bea-4583-aa3c-35f20ded7026",
            businessName: "Acme Clinic",
            conversionStatus: "active",
            canConvertProspectToClient: true,
          }),
          lifecycleAction: createElement("div", null, "Working status"),
          intelligenceGroupLabel: "Intelligence",
          prospectToolsLabel: "Tools",
          directoryGroupLabel: "Directory",
        }),
      ),
    );
    assert.match(html, /Acme Clinic/);
    assert.match(html, /Converted to Client/);
    assert.doesNotMatch(
      html,
      /data-prospect-header-action="convert-to-client"/,
    );
  });
});

describe("Prospect Convert to Client visual treatment", () => {
  it("uses a solid green primary CTA matching Ask Athena grammar", () => {
    const html = renderConvertAction("none", true);
    const action = read(
      "components/prospects/ProspectConvertToClientAction.tsx",
    );
    const presentation = read("lib/prospects/prospectDetailPresentation.ts");
    assert.match(html, /data-prospect-header-action="convert-to-client"/);
    assert.match(html, />Convert to Client</);
    assert.ok(html.includes(CONVERT_TO_CLIENT_PRIMARY_ACTION));
    assert.ok(
      CONVERT_TO_CLIENT_PRIMARY_ACTION.startsWith(PROSPECT_HEADER_ACTION_BASE),
    );
    assert.ok(CONVERT_TO_CLIENT_PRIMARY_ACTION.includes("bg-[var(--athena-success)]"));
    assert.ok(CONVERT_TO_CLIENT_PRIMARY_ACTION.includes("text-white"));
    assert.ok(CONVERT_TO_CLIENT_PRIMARY_ACTION.includes("shadow-lg"));
    assert.ok(CONVERT_TO_CLIENT_PRIMARY_ACTION.includes("hover:opacity-90"));
    assert.ok(CONVERT_TO_CLIENT_PRIMARY_ACTION.includes("h-11"));
    assert.ok(CONVERT_TO_CLIENT_PRIMARY_ACTION.includes("rounded-2xl"));
    assert.ok(CONVERT_TO_CLIENT_PRIMARY_ACTION.includes("px-5"));
    assert.ok(CONVERT_TO_CLIENT_PRIMARY_ACTION.includes("text-sm"));
    assert.ok(CONVERT_TO_CLIENT_PRIMARY_ACTION.includes("font-semibold"));
    assert.ok(PROSPECT_PRIMARY_ACTION.includes("bg-[var(--athena-orange)]"));
    assert.ok(!CONVERT_TO_CLIENT_PRIMARY_ACTION.includes("athena-orange"));
    assert.ok(!CONVERT_TO_CLIENT_PRIMARY_ACTION.includes("bg-white/[0.03]"));
    assert.doesNotMatch(html, /PROSPECT_UTILITY_ACTION/);
    assert.match(action, /CONVERT_TO_CLIENT_PRIMARY_ACTION/);
    assert.doesNotMatch(action, /PROSPECT_UTILITY_ACTION/);
    assert.match(
      presentation,
      /PROSPECT_PRIMARY_ACTION = `\$\{PROSPECT_HEADER_ACTION_BASE\} bg-\[var\(--athena-orange\)\]/,
    );
  });

  it("keeps Converted to Client as a non-actionable status chip", () => {
    const html = renderConvertAction("active", true);
    const action = read(
      "components/prospects/ProspectConvertToClientAction.tsx",
    );
    assert.match(html, /<span[^>]*data-prospect-header-action="converted-to-client"/);
    assert.ok(html.includes(PROSPECT_STATUS_CHIP_SAVED));
    assert.doesNotMatch(html, /<button[^>]*converted-to-client/);
    assert.doesNotMatch(html, /onClick/);
    assert.match(action, /className=\{PROSPECT_STATUS_CHIP_SAVED\}/);
    assert.doesNotMatch(
      action,
      /converted-to-client[\s\S]{0,120}CONVERT_TO_CLIENT_PRIMARY_ACTION/,
    );
  });
});

describe("Prospect Convert to Client request boundary", () => {
  it("posts the promotion endpoint with no client email or authority fields", () => {
    const action = read("components/prospects/ProspectConvertToClientAction.tsx");
    const page = read("app/prospects/[id]/page.tsx");
    assert.match(page, /ProspectConvertToClientAction/);
    assert.match(page, /conversionStatus=\{conversionState\.status\}/);
    assert.match(page, /getProspectClientConversionState\(prospect\.id\)/);
    assert.match(page, /isLicenseeOwnCompanyOrganization\(organizationId\)/);
    assert.match(page, /isGetOblicDerivedProspect\(prospect\)/);
    assert.match(page, /shouldShowGetOblicListingReleaseAction/);
    assert.match(page, /conversionStatus: conversionState\.status/);
    assert.doesNotMatch(page, /licensee_prospect_client_conversions/);
    assert.doesNotMatch(action, /from\("licensee_prospect_client_conversions"\)/);
    assert.match(
      action,
      /`\/api\/prospects\/\$\{prospectId\}\/convert-to-client`/,
    );
    assert.match(action, /method: "POST"/);
    assert.doesNotMatch(action, /JSON\.stringify/);
    assert.doesNotMatch(action, /accountEmail|clientAccountEmail/);
    assert.doesNotMatch(action, /licenseeAccountId|masterUserId/);
    assert.doesNotMatch(action, /sourceOrganizationId|clientOrganizationId/);
    assert.doesNotMatch(action, /type="email"/);
    assert.match(action, /Convert \{businessName\} to a client\?/);
    assert.match(
      action,
      /A client sub-account will be created and this business will move/,
    );
  });

  it("keeps server API authorization on the domain service, not the CTA", () => {
    const route = read("app/api/prospects/[id]/convert-to-client/route.ts");
    const domain = read(
      "services/licensee/licenseeProspectClientConversion.ts",
    );
    const identity = read("services/licensee/licenseeIdentity.ts");
    assert.match(route, /promoteLicenseeProspectToClient/);
    assert.match(route, /sourceOrganizationId: organizationId/);
    assert.match(route, /actingUserId: userId/);
    assert.doesNotMatch(route, /masterUserId/);
    assert.doesNotMatch(route, /isLicenseeOwnCompanyOrganization/);
    assert.match(identity, /getLicenseeAccountsByOwnCompanyOrganizationId/);
    assert.doesNotMatch(route, /canConvertProspectToClient/);
    assert.match(domain, /async function resolveOwnCompanyLicenseeContext/);
    assert.match(domain, /SOURCE_NOT_OWN_COMPANY/);
    assert.match(
      domain,
      /licenseeAccount\.own_company_organization_id !== input\.sourceOrganizationId/,
    );
    assert.match(identity, /Presentation\/eligibility only/);
  });

  it("disables the CTA while pending and returns to /prospects on success", () => {
    const action = read("components/prospects/ProspectConvertToClientAction.tsx");
    assert.match(action, /if \(pending\)/);
    assert.match(action, /disabled=\{pending\}/);
    assert.match(action, /setPending\(true\)/);
    assert.match(action, /router\.push\("\/prospects"\)/);
    assert.match(action, /router\.refresh\(\)/);
    assert.match(action, /role="alert"/);
    assert.doesNotMatch(action, /window\.location\.href\s*=\s*"\/prospects"/);
  });

  it("hides GetOblic Release while conversion is ACTIVE and keeps it for reversed/none", () => {
    assert.equal(
      shouldShowGetOblicListingReleaseAction({
        relationshipStatus: "linked",
        conversionStatus: "active",
      }),
      false,
    );
    assert.equal(
      shouldShowGetOblicListingReleaseAction({
        relationshipStatus: "claiming",
        conversionStatus: "active",
      }),
      false,
    );
    assert.equal(
      shouldShowGetOblicListingReleaseAction({
        relationshipStatus: "linked",
        conversionStatus: "reversed",
      }),
      true,
    );
    assert.equal(
      shouldShowGetOblicListingReleaseAction({
        relationshipStatus: "claiming",
        conversionStatus: "none",
      }),
      true,
    );
    assert.equal(
      shouldShowGetOblicListingReleaseAction({
        relationshipStatus: "released",
        conversionStatus: "reversed",
      }),
      false,
    );
    const page = read("app/prospects/[id]/page.tsx");
    assert.match(
      page,
      /from ["']@\/lib\/prospects\/getOblicListingReleasePresentation["']/,
    );
    assert.match(page, /shouldShowGetOblicListingReleaseAction/);
    assert.match(page, /showGetOblicRelease/);
    assert.doesNotMatch(
      page,
      /shouldShowGetOblicListingReleaseAction[\s\S]*from ["']@\/components\/prospects\/GetOblicListingReleaseControl["']/,
    );
    assert.doesNotMatch(page, /notFound\(\)|redirect\(/);
  });

  it("maps conversion failures to useful page-level copy", () => {
    assert.equal(
      convertToClientUserMessage(403),
      "Unable to convert this prospect from the current account.",
    );
    assert.equal(
      convertToClientUserMessage(409),
      "This prospect could not be converted automatically. Please contact your administrator.",
    );
    assert.equal(
      convertToClientUserMessage(500),
      "Unable to convert this prospect right now.",
    );
    const action = read("components/prospects/ProspectConvertToClientAction.tsx");
    assert.match(action, /convertToClientUserMessage\(response\.status\)/);
    assert.doesNotMatch(action, /payload\.error\?\.message/);
  });
});
