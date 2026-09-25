/**
 * GetOblic Funnel hrefs, Licensee Own Company author authority, and Prospect Detail wiring.
 */

import "../getoblicDirectory/getoblicDirectoryTestEnv";

import assert from "node:assert/strict";
import { createElement } from "react";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { afterEach, describe, it } from "node:test";
import { renderToStaticMarkup } from "react-dom/server";
import { GetOblicFunnelControls } from "../../components/prospects/GetOblicFunnelControls";
import { supabaseAdmin } from "../../lib/supabaseAdmin";
import {
  buildGetOblicFunnelPresentation,
  readLinkedGetOblicFunnelContactId,
} from "../../lib/prospects/getOblicFunnelPresentation";
import {
  PROSPECT_HEADER_ACTION_BASE,
  PROSPECT_UTILITY_CYAN_ACTION,
} from "../../lib/prospects/prospectDetailPresentation";
import { de } from "../../lib/tenantI18n/messages/de";
import { en } from "../../lib/tenantI18n/messages/en";
import { es } from "../../lib/tenantI18n/messages/es";
import { fr } from "../../lib/tenantI18n/messages/fr";
import { it as itMessages } from "../../lib/tenantI18n/messages/it";
import { pt } from "../../lib/tenantI18n/messages/pt";
import { GETOBLIC_DIRECTORY_SETTINGS_TABLE } from "../../services/getoblicDirectory/getoblicDirectoryTypes";
import { ORGANIZATION_LANGUAGES } from "../../services/organizationLanguage";
import { resolveLicenseeOwnCompanyGetOblicAuthorId } from "../../services/prospects/getOblicFunnelAuthor";

const ROOT = process.cwd();
const originalFrom = supabaseAdmin.from.bind(supabaseAdmin);

const CLIENT = "44444444-4444-4444-8444-444444444444";
const OWN_A = "33333333-3333-4333-8333-333333333333";
const OWN_B = "55555555-5555-4555-8555-555555555555";
const LIC_A = "11111111-1111-4111-8111-111111111111";
const LIC_B = "22222222-2222-4222-8222-222222222222";
const OWN_COMPANY_AUTHOR = 42;
const CLIENT_AUTHOR = 7;
const OTHER_LICENSEE_AUTHOR = 99;
const LINK_AUTHOR = 8;
const INVENTORY_POOL_AUTHOR = 271519816;

const FUNNEL_PATHS = {
  aiAgents: "/business-portfolio-ai-agent-page",
  virtualPhone: "/business-portfolio-virtual-line-page",
  calendar: "/business-portfolio-booking-page",
} as const;

const FRENCH_FUNNEL_PATHS = {
  aiAgents: "/business-portfolio-agent-ia",
  virtualPhone: "/business-portfolio-ligne-virtuelle",
  calendar: "/business-portfolio-calendrier-ia",
} as const;

const FUNNEL_LABELS = {
  en: {
    getoblicFunnel: "GetOblic Funnel",
    getoblicFunnelAiAgents: "AI Agents",
    getoblicFunnelVirtualPhone: "Virtual Phone",
    getoblicFunnelCalendar: "Calendar",
  },
  fr: {
    getoblicFunnel: "Tunnel GetOblic",
    getoblicFunnelAiAgents: "Agents IA",
    getoblicFunnelVirtualPhone: "Téléphone virtuel",
    getoblicFunnelCalendar: "Calendrier",
  },
  es: {
    getoblicFunnel: "Embudo GetOblic",
    getoblicFunnelAiAgents: "Agentes de IA",
    getoblicFunnelVirtualPhone: "Teléfono virtual",
    getoblicFunnelCalendar: "Calendario",
  },
  it: {
    getoblicFunnel: "Imbuto GetOblic",
    getoblicFunnelAiAgents: "Agenti IA",
    getoblicFunnelVirtualPhone: "Telefono virtuale",
    getoblicFunnelCalendar: "Calendario",
  },
  de: {
    getoblicFunnel: "GetOblic-Trichter",
    getoblicFunnelAiAgents: "KI-Agenten",
    getoblicFunnelVirtualPhone: "Virtuelles Telefon",
    getoblicFunnelCalendar: "Kalender",
  },
  pt: {
    getoblicFunnel: "Funil GetOblic",
    getoblicFunnelAiAgents: "Agentes de IA",
    getoblicFunnelVirtualPhone: "Telefone virtual",
    getoblicFunnelCalendar: "Calendário",
  },
} as const;

type LicenseeRow = {
  id: string;
  user_id: string;
  email: string;
  own_company_organization_id: string | null;
  default_language: string;
};

type RelationshipRow = {
  licensee_account_id: string;
  organization_id: string;
};

type SettingsRow = {
  organization_id: string;
  monthly_allowance: number;
  wordpress_author_id: number | null;
  created_at: string;
  updated_at: string;
  updated_by_user_id: null;
};

type QueryCall = {
  table: string;
  filters: Record<string, unknown>;
  columns?: string;
};

type OrganizationRow = {
  id: string;
  language: string;
};

type AuthorFixture = {
  licensees?: LicenseeRow[];
  relationships?: RelationshipRow[];
  settings?: SettingsRow[];
  organizations?: OrganizationRow[];
  ownCompanyLookupError?: boolean;
  relationshipLookupError?: boolean;
};

function read(relativePath: string): string {
  return readFileSync(join(ROOT, relativePath), "utf8");
}

function licensee(
  id: string,
  ownCompanyOrganizationId: string | null,
  defaultLanguage = "en",
): LicenseeRow {
  return {
    id,
    user_id: id,
    email: "master@example.com",
    own_company_organization_id: ownCompanyOrganizationId,
    default_language: defaultLanguage,
  };
}

function settings(
  organizationId: string,
  wordpressAuthorId: number | null,
): SettingsRow {
  return {
    organization_id: organizationId,
    monthly_allowance: 25,
    wordpress_author_id: wordpressAuthorId,
    created_at: "2026-09-01T00:00:00.000Z",
    updated_at: "2026-09-01T00:00:00.000Z",
    updated_by_user_id: null,
  };
}

function installFixture(store: AuthorFixture): { calls: QueryCall[] } {
  const calls: QueryCall[] = [];

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  (supabaseAdmin as any).from = (table: string) => {
    const filters: Record<string, unknown> = {};
    const call: QueryCall = { table, filters };
    calls.push(call);

    const rows = (): Record<string, unknown>[] => {
      if (table === "licensee_accounts") {
        return (store.licensees ?? []) as unknown as Record<string, unknown>[];
      }
      if (table === "licensee_sub_accounts") {
        return (store.relationships ?? []) as unknown as Record<string, unknown>[];
      }
      if (table === GETOBLIC_DIRECTORY_SETTINGS_TABLE) {
        return (store.settings ?? []) as unknown as Record<string, unknown>[];
      }
      if (table === "organizations") {
        return (store.organizations ?? []) as unknown as Record<string, unknown>[];
      }
      return [];
    };

    const matching = () =>
      rows().filter((row) =>
        Object.entries(filters).every(([column, expected]) => row[column] === expected),
      );

    const failed = () => {
      if (table === "licensee_sub_accounts" && store.relationshipLookupError) {
        return true;
      }
      if (
        table === "licensee_accounts" &&
        store.ownCompanyLookupError &&
        filters.own_company_organization_id
      ) {
        return true;
      }
      return false;
    };

    const payload = () => {
      if (failed()) {
        return { data: null, error: { message: "db down" }, count: 0 };
      }
      const matched = matching();
      return { data: matched, error: null, count: matched.length };
    };

    const builder = {
      select: (columns?: string) => {
        call.columns = columns;
        return builder;
      },
      eq: (column: string, value: unknown) => {
        filters[column] = value;
        return builder;
      },
      maybeSingle: async () => {
        if (failed()) {
          return { data: null, error: { message: "db down" } };
        }
        const matched = matching();
        return { data: matched[0] ?? null, error: null };
      },
      then(resolve: (value: { data: unknown; error: unknown; count: number }) => void) {
        return Promise.resolve(payload()).then(resolve);
      },
    };

    return builder;
  };

  return { calls };
}

function assertResolvedAuthor(
  result: Awaited<ReturnType<typeof resolveLicenseeOwnCompanyGetOblicAuthorId>>,
  authorId: number,
  licenseeDefaultLanguage: (typeof ORGANIZATION_LANGUAGES)[number] = "en",
) {
  assert.ok(result);
  assert.deepEqual(Object.keys(result).sort(), [
    "authorId",
    "licenseeDefaultLanguage",
  ]);
  assert.equal(result.authorId, authorId);
  assert.equal(result.licenseeDefaultLanguage, licenseeDefaultLanguage);
}

function settingsOrganizations(calls: QueryCall[]): string[] {
  return calls
    .filter((call) => call.table === GETOBLIC_DIRECTORY_SETTINGS_TABLE)
    .map((call) => String(call.filters.organization_id));
}

function managedClientFixture(
  ownCompanyAuthor: number | null = OWN_COMPANY_AUTHOR,
  clientAuthor: number | null = CLIENT_AUTHOR,
): AuthorFixture {
  return {
    licensees: [licensee(LIC_A, OWN_A), licensee(LIC_B, OWN_B)],
    relationships: [
      { licensee_account_id: LIC_A, organization_id: CLIENT },
    ],
    settings: [
      settings(OWN_A, ownCompanyAuthor),
      settings(CLIENT, clientAuthor),
      settings(OWN_B, OTHER_LICENSEE_AUTHOR),
    ],
  };
}

afterEach(() => {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  (supabaseAdmin as any).from = originalFrom;
});

describe("GetOblic Funnel URL contract", () => {
  it("builds exactly three claim.getoblic.com URLs for a valid author, listing, and name", () => {
    const businessName = "North & West = Clinic";
    const presentation = buildGetOblicFunnelPresentation({
      authorId: OWN_COMPANY_AUTHOR,
      contactId: 9001,
      businessName: `  ${businessName}  `,
      licenseeDefaultLanguage: "en",
    });
    assert.ok(presentation);
    assert.deepEqual(Object.keys(presentation).sort(), [
      "aiAgentsHref",
      "calendarHref",
      "virtualPhoneHref",
    ]);

    const hrefs = [
      presentation.aiAgentsHref,
      presentation.virtualPhoneHref,
      presentation.calendarHref,
    ];
    const paths = [
      FUNNEL_PATHS.aiAgents,
      FUNNEL_PATHS.virtualPhone,
      FUNNEL_PATHS.calendar,
    ];
    assert.equal(new Set(hrefs).size, 3);

    hrefs.forEach((href, index) => {
      const url = new URL(href);
      assert.equal(url.origin, "https://claim.getoblic.com");
      assert.equal(url.pathname, paths[index]);
      assert.equal(url.searchParams.get("author_id"), String(OWN_COMPANY_AUTHOR));
      assert.equal(url.searchParams.get("contact_id"), "9001");
      assert.equal(url.searchParams.get("business_name"), businessName);
      assert.deepEqual([...url.searchParams.keys()], [
        "author_id",
        "contact_id",
        "business_name",
      ]);
      assert.match(href, /%26/);
      assert.match(href, /%3D/);
      assert.doesNotMatch(href, /North & West/);
      assert.ok(href.includes("+") || href.includes("%20"));
      assert.equal(href.includes(" "), false);
    });
  });

  it("fails closed with no partial URLs for invalid author, contact, or business name", () => {
    const valid = {
      authorId: OWN_COMPANY_AUTHOR,
      contactId: 9001,
      businessName: "Acme Clinic",
      licenseeDefaultLanguage: "en" as const,
    };
    const invalidAuthors = [0, -1, 1.5, Number.NaN, "42", "42.5", null, undefined];
    const invalidContacts = [0, -3, 2.2, "9001", null, undefined];
    const invalidNames = ["", "   ", null, undefined, 12];

    for (const authorId of invalidAuthors) {
      assert.equal(
        buildGetOblicFunnelPresentation({ ...valid, authorId }),
        null,
        `author ${String(authorId)}`,
      );
    }
    for (const contactId of invalidContacts) {
      assert.equal(
        buildGetOblicFunnelPresentation({ ...valid, contactId }),
        null,
        `contact ${String(contactId)}`,
      );
    }
    for (const businessName of invalidNames) {
      assert.equal(
        buildGetOblicFunnelPresentation({ ...valid, businessName }),
        null,
        `name ${String(businessName)}`,
      );
    }
  });

  it("ignores caller-controlled origins and base URLs", () => {
    const input = {
      authorId: OWN_COMPANY_AUTHOR,
      contactId: 9001,
      businessName: "Acme Clinic",
      licenseeDefaultLanguage: "en" as const,
      baseUrl: "https://evil.example/steal",
      origin: "https://evil.example",
    };
    const presentation = buildGetOblicFunnelPresentation(input);
    assert.ok(presentation);
    for (const href of Object.values(presentation)) {
      assert.equal(new URL(href).origin, "https://claim.getoblic.com");
      assert.doesNotMatch(href, /evil\.example/);
    }

    const source = read("lib/prospects/getOblicFunnelPresentation.ts");
    assert.match(source, /new URL\(/);
    assert.match(source, /searchParams\.set\("author_id"/);
    assert.match(source, /searchParams\.set\("contact_id"/);
    assert.match(source, /searchParams\.set\("business_name"/);
    assert.match(source, /licenseeDefaultLanguage/);
    assert.match(source, /language === "fr"/);
    assert.doesNotMatch(source, /searchParams\.set\("language"\)|searchParams\.set\("locale"\)/);
    assert.doesNotMatch(source, /getTenantLocalization|organizations\.language|Accept-Language/);
    assert.doesNotMatch(source, /baseUrl|input\.origin|evil\.example/);
    assert.doesNotMatch(source, /\?author_id=|replace\(\s*["']\s["']/);
  });

  it("uses French claim paths only when licenseeDefaultLanguage is fr", () => {
    const businessName = "North & West = Clinic";
    for (const language of ORGANIZATION_LANGUAGES) {
      const presentation = buildGetOblicFunnelPresentation({
        authorId: OWN_COMPANY_AUTHOR,
        contactId: 9001,
        businessName,
        licenseeDefaultLanguage: language,
      });
      assert.ok(presentation, language);
      const expected = language === "fr" ? FRENCH_FUNNEL_PATHS : FUNNEL_PATHS;
      const hrefs = [
        presentation.aiAgentsHref,
        presentation.virtualPhoneHref,
        presentation.calendarHref,
      ];
      const paths = [expected.aiAgents, expected.virtualPhone, expected.calendar];
      hrefs.forEach((href, index) => {
        const url = new URL(href);
        assert.equal(url.origin, "https://claim.getoblic.com", language);
        assert.equal(url.pathname, paths[index], language);
        assert.deepEqual([...url.searchParams.keys()], [
          "author_id",
          "contact_id",
          "business_name",
        ]);
        assert.equal(url.searchParams.get("author_id"), String(OWN_COMPANY_AUTHOR));
        assert.equal(url.searchParams.get("contact_id"), "9001");
        assert.equal(url.searchParams.get("business_name"), businessName);
        assert.equal(url.searchParams.get("language"), null);
        assert.equal(url.searchParams.get("locale"), null);
        assert.match(href, /%26/);
        assert.match(href, /%3D/);
      });
    }
  });

  it("requires relationship_status linked and ignores link author and raw listing fallbacks", () => {
    assert.equal(
      readLinkedGetOblicFunnelContactId({
        relationship_status: "linked",
        wordpress_listing_id: 9001,
        wordpress_author_id: LINK_AUTHOR,
      } as { relationship_status: string; wordpress_listing_id: number }),
      9001,
    );
    for (const relationship_status of [
      "claiming",
      "remote_missing",
      "released",
      "available",
    ]) {
      assert.equal(
        readLinkedGetOblicFunnelContactId({
          relationship_status,
          wordpress_listing_id: 9001,
        }),
        null,
        relationship_status,
      );
    }
    assert.equal(readLinkedGetOblicFunnelContactId(null), null);
    assert.equal(
      readLinkedGetOblicFunnelContactId({
        relationship_status: "linked",
        wordpress_listing_id: 0,
      }),
      null,
    );

    const source = read("lib/prospects/getOblicFunnelPresentation.ts");
    const reader = source.slice(
      source.indexOf("export function readLinkedGetOblicFunnelContactId"),
      source.indexOf("function readBusinessName"),
    );
    assert.match(reader, /relationship_status !== "linked"/);
    assert.doesNotMatch(reader, /wordpress_author_id|raw_json|external_contact_id/);
  });
});

describe("Licensee Own Company GetOblic author authority", () => {
  it("resolves a managed client through the controlling Licensee Own Company author", async () => {
    const { calls } = installFixture(managedClientFixture());
    const author = await resolveLicenseeOwnCompanyGetOblicAuthorId(CLIENT);
    assertResolvedAuthor(author, OWN_COMPANY_AUTHOR);
    assert.notEqual(author?.authorId, CLIENT_AUTHOR);
    assert.notEqual(author?.authorId, OTHER_LICENSEE_AUTHOR);
    assert.notEqual(author?.authorId, LINK_AUTHOR);
    assert.notEqual(author?.authorId, INVENTORY_POOL_AUTHOR);
    assert.deepEqual(settingsOrganizations(calls), [OWN_A]);
    assert.equal(
      calls.some((call) => call.table === "athena_getoblic_listing_links"),
      false,
    );
    const settingsCall = calls.find(
      (call) => call.table === GETOBLIC_DIRECTORY_SETTINGS_TABLE,
    );
    assert.equal(settingsCall?.filters.organization_id, OWN_A);
    assert.match(settingsCall?.columns ?? "", /wordpress_author_id/);
    assert.doesNotMatch(
      settingsCall?.columns ?? "",
      /getoblic_account_email|password|webhook/i,
    );
  });

  it("resolves the Own Company tenant through the same Licensee-owned author", async () => {
    const { calls } = installFixture({
      licensees: [licensee(LIC_A, OWN_A), licensee(LIC_B, OWN_B)],
      relationships: [{ licensee_account_id: LIC_A, organization_id: OWN_A }],
      settings: [
        settings(OWN_A, OWN_COMPANY_AUTHOR),
        settings(CLIENT, CLIENT_AUTHOR),
        settings(OWN_B, OTHER_LICENSEE_AUTHOR),
      ],
    });
    const author = await resolveLicenseeOwnCompanyGetOblicAuthorId(OWN_A);
    assertResolvedAuthor(author, OWN_COMPANY_AUTHOR);
    assert.deepEqual(settingsOrganizations(calls), [OWN_A]);
    assert.ok(
      calls.findIndex((call) => call.table === "licensee_sub_accounts") <
        calls.findIndex((call) => call.table === GETOBLIC_DIRECTORY_SETTINGS_TABLE),
    );
  });

  it("fails closed when the controlling Licensee, Own Company, or author is missing", async () => {
    const missingLicensee = installFixture({
      licensees: [licensee(LIC_A, OWN_A)],
      relationships: [],
      settings: [settings(CLIENT, CLIENT_AUTHOR), settings(OWN_A, OWN_COMPANY_AUTHOR)],
    });
    assert.equal(await resolveLicenseeOwnCompanyGetOblicAuthorId(CLIENT), null);
    assert.deepEqual(settingsOrganizations(missingLicensee.calls), []);

    const ambiguous = installFixture({
      licensees: [licensee(LIC_A, OWN_A), licensee(LIC_B, OWN_B)],
      relationships: [
        { licensee_account_id: LIC_A, organization_id: CLIENT },
        { licensee_account_id: LIC_B, organization_id: CLIENT },
      ],
      settings: [settings(OWN_A, OWN_COMPANY_AUTHOR), settings(OWN_B, OTHER_LICENSEE_AUTHOR)],
    });
    assert.equal(await resolveLicenseeOwnCompanyGetOblicAuthorId(CLIENT), null);
    assert.deepEqual(settingsOrganizations(ambiguous.calls), []);

    const missingOwnCompany = installFixture({
      licensees: [licensee(LIC_A, null)],
      relationships: [{ licensee_account_id: LIC_A, organization_id: CLIENT }],
      settings: [settings(CLIENT, CLIENT_AUTHOR)],
    });
    assert.equal(await resolveLicenseeOwnCompanyGetOblicAuthorId(CLIENT), null);
    assert.deepEqual(settingsOrganizations(missingOwnCompany.calls), []);

    const missingSettings = installFixture({
      licensees: [licensee(LIC_A, OWN_A)],
      relationships: [{ licensee_account_id: LIC_A, organization_id: CLIENT }],
      settings: [settings(CLIENT, INVENTORY_POOL_AUTHOR)],
    });
    assert.equal(await resolveLicenseeOwnCompanyGetOblicAuthorId(CLIENT), null);
    assert.deepEqual(settingsOrganizations(missingSettings.calls), [OWN_A]);

    const missingAuthor = installFixture(
      managedClientFixture(null, INVENTORY_POOL_AUTHOR),
    );
    assert.equal(await resolveLicenseeOwnCompanyGetOblicAuthorId(CLIENT), null);
    assert.deepEqual(settingsOrganizations(missingAuthor.calls), [OWN_A]);

    for (const invalidAuthor of [0, -5, 1.5]) {
      const fixture = installFixture(managedClientFixture(invalidAuthor, CLIENT_AUTHOR));
      assert.equal(
        await resolveLicenseeOwnCompanyGetOblicAuthorId(CLIENT),
        null,
        `author ${invalidAuthor}`,
      );
      assert.deepEqual(settingsOrganizations(fixture.calls), [OWN_A]);
    }
  });

  it("does not leak another Licensee's GetOblic settings", async () => {
    const isolated = installFixture(managedClientFixture());
    assertResolvedAuthor(
      await resolveLicenseeOwnCompanyGetOblicAuthorId(CLIENT),
      OWN_COMPANY_AUTHOR,
    );
    assert.deepEqual(settingsOrganizations(isolated.calls), [OWN_A]);
    assert.equal(
      isolated.calls.some(
        (call) =>
          call.table === GETOBLIC_DIRECTORY_SETTINGS_TABLE &&
          (call.filters.organization_id === CLIENT ||
            call.filters.organization_id === OWN_B),
      ),
      false,
    );

    const ambiguousOwnCompany = installFixture({
      licensees: [licensee(LIC_A, OWN_A), licensee(LIC_B, OWN_A)],
      relationships: [{ licensee_account_id: LIC_A, organization_id: CLIENT }],
      settings: [
        settings(OWN_A, OWN_COMPANY_AUTHOR),
        settings(OWN_B, OTHER_LICENSEE_AUTHOR),
        settings(CLIENT, CLIENT_AUTHOR),
      ],
    });
    assert.equal(
      await resolveLicenseeOwnCompanyGetOblicAuthorId(CLIENT),
      null,
    );
    assert.deepEqual(settingsOrganizations(ambiguousOwnCompany.calls), []);

    const lookupFailed = installFixture({
      ...managedClientFixture(),
      relationshipLookupError: true,
    });
    assert.equal(await resolveLicenseeOwnCompanyGetOblicAuthorId(CLIENT), null);

    const ownCompanyFailed = installFixture({
      ...managedClientFixture(),
      ownCompanyLookupError: true,
    });
    assert.equal(await resolveLicenseeOwnCompanyGetOblicAuthorId(CLIENT), null);
    assert.deepEqual(settingsOrganizations(ownCompanyFailed.calls), []);
    assert.equal(await resolveLicenseeOwnCompanyGetOblicAuthorId("  "), null);
    void lookupFailed;
  });

  it("composes the controlling Licensee and Own Company helpers without client-author fallback", () => {
    const author = read("services/prospects/getOblicFunnelAuthor.ts");
    const identity = read("services/licensee/licenseeIdentity.ts");
    const helper = identity.slice(
      identity.indexOf(
        "export async function listControllingLicenseeAccountsForOrganization",
      ),
    );

    assert.match(author, /listControllingLicenseeAccountsForOrganization\(organization\)/);
    assert.match(author, /getLicenseeAccountsByOwnCompanyOrganizationId\(ownCompanyId\)/);
    assert.match(author, /getGetOblicDirectorySettings\(ownCompanyId\)/);
    assert.match(author, /licenseeDefaultLanguage: licensee\.default_language/);
    assert.match(
      identity,
      /default_language: resolveOrganizationLanguageValue\(data\.default_language\)/,
    );
    assert.doesNotMatch(author, /resolveOrganizationLanguageValue|parseOrganizationLanguage/);
    assert.doesNotMatch(author, /from\("organizations"\)|organizations\.language/);
    assert.doesNotMatch(author, /getTenantLocalization|getLicenseeAccountByUserId/);
    assert.doesNotMatch(author, /getGetOblicDirectorySettings\(organizationId\)/);
    assert.doesNotMatch(author, /getGetOblicDirectorySettings\(organization\)/);
    assert.doesNotMatch(author, /GETOBLIC_INVENTORY_POOL_AUTHOR_ID|271519816/);
    assert.doesNotMatch(author, /wordpress_listing_id|raw_json|link\.wordpress_author_id/);
    assert.doesNotMatch(author, /getoblic_account_email|password|webhook|monthly_allowance/i);
    assert.match(helper, /from\("licensee_sub_accounts"\)/);
    assert.match(helper, /\.eq\("organization_id", id\)/);
    assert.match(helper, /getLicenseeAccountById\(licenseeAccountId\)/);
    assert.doesNotMatch(helper, /\.maybeSingle\(/);
    assert.doesNotMatch(helper, /athena_getoblic_directory_settings|wordpress_author_id/);
  });

  it("uses the controlling Licensee language and ignores the client tenant language", async () => {
    const frenchControlling = installFixture({
      ...managedClientFixture(),
      licensees: [licensee(LIC_A, OWN_A, "fr"), licensee(LIC_B, OWN_B, "en")],
      organizations: [{ id: CLIENT, language: "en" }],
    });
    const french = await resolveLicenseeOwnCompanyGetOblicAuthorId(CLIENT);
    assertResolvedAuthor(french, OWN_COMPANY_AUTHOR, "fr");
    assert.ok(french);
    assert.equal(
      frenchControlling.calls.some((call) => call.table === "organizations"),
      false,
    );
    assert.equal(
      frenchControlling.calls.filter((call) => call.table === "licensee_accounts").length,
      2,
    );
    const frenchPresentation = buildGetOblicFunnelPresentation({
      authorId: french.authorId,
      contactId: 9001,
      businessName: "Acme Clinic",
      licenseeDefaultLanguage: french.licenseeDefaultLanguage,
    });
    assert.ok(frenchPresentation);
    assert.equal(
      new URL(frenchPresentation.aiAgentsHref).pathname,
      FRENCH_FUNNEL_PATHS.aiAgents,
    );
    assert.equal(
      new URL(frenchPresentation.virtualPhoneHref).pathname,
      FRENCH_FUNNEL_PATHS.virtualPhone,
    );
    assert.equal(
      new URL(frenchPresentation.calendarHref).pathname,
      FRENCH_FUNNEL_PATHS.calendar,
    );

    const englishControlling = installFixture({
      ...managedClientFixture(),
      licensees: [licensee(LIC_A, OWN_A, "en"), licensee(LIC_B, OWN_B, "fr")],
      organizations: [{ id: CLIENT, language: "fr" }],
    });
    const english = await resolveLicenseeOwnCompanyGetOblicAuthorId(CLIENT);
    assertResolvedAuthor(english, OWN_COMPANY_AUTHOR, "en");
    assert.ok(english);
    assert.equal(
      englishControlling.calls.some((call) => call.table === "organizations"),
      false,
    );
    const englishPresentation = buildGetOblicFunnelPresentation({
      authorId: english.authorId,
      contactId: 9001,
      businessName: "Acme Clinic",
      licenseeDefaultLanguage: english.licenseeDefaultLanguage,
    });
    assert.ok(englishPresentation);
    assert.equal(
      new URL(englishPresentation.aiAgentsHref).pathname,
      FUNNEL_PATHS.aiAgents,
    );
    assert.equal(
      new URL(englishPresentation.virtualPhoneHref).pathname,
      FUNNEL_PATHS.virtualPhone,
    );
    assert.equal(
      new URL(englishPresentation.calendarHref).pathname,
      FUNNEL_PATHS.calendar,
    );
  });

  it("maps an invalid stored Licensee language through the existing account mapper to en", async () => {
    const { calls } = installFixture({
      ...managedClientFixture(),
      licensees: [licensee(LIC_A, OWN_A, "xx"), licensee(LIC_B, OWN_B, "fr")],
      organizations: [{ id: CLIENT, language: "fr" }],
    });
    const author = await resolveLicenseeOwnCompanyGetOblicAuthorId(CLIENT);
    assertResolvedAuthor(author, OWN_COMPANY_AUTHOR, "en");
    assert.ok(author);
    assert.equal(calls.some((call) => call.table === "organizations"), false);
    const presentation = buildGetOblicFunnelPresentation({
      authorId: author.authorId,
      contactId: 9001,
      businessName: "Acme Clinic",
      licenseeDefaultLanguage: author.licenseeDefaultLanguage,
    });
    assert.ok(presentation);
    assert.equal(new URL(presentation.aiAgentsHref).pathname, FUNNEL_PATHS.aiAgents);
  });
});

describe("GetOblic Funnel Prospect Detail wiring", () => {
  it("builds hrefs on the server and renders external hero links", () => {
    const page = read("app/prospects/[id]/page.tsx");
    const controls = read("components/prospects/GetOblicFunnelControls.tsx");
    const buildAt = page.indexOf("buildGetOblicFunnelPresentation({");
    const buildCall = page.slice(buildAt, buildAt + 560);

    assert.match(page, /resolveLicenseeOwnCompanyGetOblicAuthorId\(organizationId\)/);
    assert.match(buildCall, /authorId: licenseeOwnCompanyAuthor\.authorId/);
    assert.match(
      buildCall,
      /licenseeDefaultLanguage: licenseeOwnCompanyAuthor\.licenseeDefaultLanguage/,
    );
    assert.doesNotMatch(buildCall, /licenseeDefaultLanguage:\s*language\b/);
    assert.doesNotMatch(buildCall, /getTenantLocalization/);
    assert.doesNotMatch(page, /getLicenseeAccountByUserId/);
    assert.match(buildCall, /readLinkedGetOblicFunnelContactId\(activeGetOblicLink\)/);
    assert.match(buildCall, /businessName: prospect\.business_name\.trim\(\)/);
    assert.doesNotMatch(buildCall, /raw_json|wordpress_author_id|external_contact_id/);
    assert.doesNotMatch(page, /wordpress_author_id/);
    assert.doesNotMatch(page, /raw_json\.wordpress_listing_id/);
    assert.doesNotMatch(page, /activeGetOblicLink\?\.wordpress_listing_id/);
    assert.doesNotMatch(page, /getGetOblicDirectorySettings/);
    assert.doesNotMatch(page, /monthly_allowance|getoblic_account_email|webhook/i);
    assert.match(page, /funnelAction=/);
    assert.match(page, /funnelGroupLabel=\{copy\.detail\.getoblicFunnel\}/);
    assert.ok(
      page.indexOf("directoryAction=") < page.indexOf("funnelAction="),
    );

    assert.match(controls, /target="_blank"/);
    assert.match(controls, /rel="noopener noreferrer"/);
    assert.match(controls, /PROSPECT_UTILITY_CYAN_ACTION/);
    assert.match(controls, /ExternalLink/);
    assert.doesNotMatch(controls, /disabled|claim\.getoblic\.com|author_id|URLSearchParams/);

    const html = renderToStaticMarkup(
      createElement(GetOblicFunnelControls, {
        aiAgentsHref:
          "https://claim.getoblic.com/business-portfolio-ai-agent-page?author_id=42&contact_id=9001&business_name=Acme",
        virtualPhoneHref:
          "https://claim.getoblic.com/business-portfolio-virtual-line-page?author_id=42&contact_id=9001&business_name=Acme",
        calendarHref:
          "https://claim.getoblic.com/business-portfolio-booking-page?author_id=42&contact_id=9001&business_name=Acme",
        aiAgentsLabel: en.prospects.detail.getoblicFunnelAiAgents,
        virtualPhoneLabel: en.prospects.detail.getoblicFunnelVirtualPhone,
        calendarLabel: en.prospects.detail.getoblicFunnelCalendar,
      }),
    );
    assert.equal((html.match(/target="_blank"/g) ?? []).length, 3);
    assert.equal((html.match(/rel="noopener noreferrer"/g) ?? []).length, 3);
    assert.equal((html.match(/lucide-external-link/g) ?? []).length, 3);
    assert.match(html, /AI Agents/);
    assert.match(html, /Virtual Phone/);
    assert.match(html, /Calendar/);
    assert.match(html, new RegExp(PROSPECT_UTILITY_CYAN_ACTION.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")));
    assert.ok(PROSPECT_UTILITY_CYAN_ACTION.includes(PROSPECT_HEADER_ACTION_BASE));
    assert.match(html, /data-prospect-header-action="getoblic-funnel-ai-agents"/);
    assert.match(html, /data-prospect-header-action="getoblic-funnel-virtual-phone"/);
    assert.match(html, /data-prospect-header-action="getoblic-funnel-calendar"/);
    assert.doesNotMatch(html, /<button|disabled=""/);
  });

  it("keeps the six-language GetOblic Funnel labels", () => {
    const dictionaries = { en, fr, es, it: itMessages, de, pt };
    for (const language of ORGANIZATION_LANGUAGES) {
      const detail = dictionaries[language].prospects.detail;
      const expected = FUNNEL_LABELS[language];
      assert.equal(detail.getoblicFunnel, expected.getoblicFunnel);
      assert.equal(detail.getoblicFunnelAiAgents, expected.getoblicFunnelAiAgents);
      assert.equal(detail.getoblicFunnelVirtualPhone, expected.getoblicFunnelVirtualPhone);
      assert.equal(detail.getoblicFunnelCalendar, expected.getoblicFunnelCalendar);
      assert.match(detail.getoblicFunnel, /GetOblic/);
    }
  });
});
