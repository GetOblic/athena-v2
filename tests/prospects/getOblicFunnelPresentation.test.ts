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
import { ProspectDetailHeader } from "../../components/prospects/ProspectDetailHeader";
import { validateDestinationUrl } from "../../lib/getoblic-links/validation";
import { supabaseAdmin } from "../../lib/supabaseAdmin";
import {
  buildGetOblicFunnelCallHref,
  buildGetOblicFunnelClaimHref,
  buildGetOblicFunnelPresentation,
  readAuthorizedGetOblicFunnelListingId,
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
    getoblicFunnelCallYourAi: "Call your AI",
    getoblicFunnelClaimYourAi: "Claim your AI",
    getoblicFunnelViewListing: "View GetOblic Listing",
  },
  fr: {
    getoblicFunnel: "Tunnel GetOblic",
    getoblicFunnelAiAgents: "Agents IA",
    getoblicFunnelVirtualPhone: "Téléphone virtuel",
    getoblicFunnelCalendar: "Calendrier",
    getoblicFunnelCallYourAi: "Appelez votre IA",
    getoblicFunnelClaimYourAi: "Activez votre IA",
    getoblicFunnelViewListing: "Voir le listing GetOblic",
  },
  es: {
    getoblicFunnel: "Embudo GetOblic",
    getoblicFunnelAiAgents: "Agentes de IA",
    getoblicFunnelVirtualPhone: "Teléfono virtual",
    getoblicFunnelCalendar: "Calendario",
    getoblicFunnelCallYourAi: "Llama a tu IA",
    getoblicFunnelClaimYourAi: "Activa tu IA",
    getoblicFunnelViewListing: "Ver el listing GetOblic",
  },
  it: {
    getoblicFunnel: "Imbuto GetOblic",
    getoblicFunnelAiAgents: "Agenti IA",
    getoblicFunnelVirtualPhone: "Telefono virtuale",
    getoblicFunnelCalendar: "Calendario",
    getoblicFunnelCallYourAi: "Chiama la tua IA",
    getoblicFunnelClaimYourAi: "Attiva la tua IA",
    getoblicFunnelViewListing: "Vedi il listing GetOblic",
  },
  de: {
    getoblicFunnel: "GetOblic-Trichter",
    getoblicFunnelAiAgents: "KI-Agenten",
    getoblicFunnelVirtualPhone: "Virtuelles Telefon",
    getoblicFunnelCalendar: "Kalender",
    getoblicFunnelCallYourAi: "Ruf deine KI an",
    getoblicFunnelClaimYourAi: "Aktiviere deine KI",
    getoblicFunnelViewListing: "GetOblic-Listing ansehen",
  },
  pt: {
    getoblicFunnel: "Funil GetOblic",
    getoblicFunnelAiAgents: "Agentes de IA",
    getoblicFunnelVirtualPhone: "Telefone virtual",
    getoblicFunnelCalendar: "Calendário",
    getoblicFunnelCallYourAi: "Ligue para sua IA",
    getoblicFunnelClaimYourAi: "Ative sua IA",
    getoblicFunnelViewListing: "Ver o listing GetOblic",
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

  it("fails closed when the controlling Licensee or Own Company is missing", async () => {
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
  });

  it("keeps Licensee language when the Own Company author mapping is missing or invalid", async () => {
    const missingSettings = installFixture({
      licensees: [licensee(LIC_A, OWN_A, "es")],
      relationships: [{ licensee_account_id: LIC_A, organization_id: CLIENT }],
      settings: [settings(CLIENT, INVENTORY_POOL_AUTHOR)],
    });
    const unconfigured = await resolveLicenseeOwnCompanyGetOblicAuthorId(CLIENT);
    assert.ok(unconfigured);
    assert.equal(unconfigured.authorId, null);
    assert.equal(unconfigured.licenseeDefaultLanguage, "es");
    assert.deepEqual(settingsOrganizations(missingSettings.calls), [OWN_A]);
    assert.equal(
      buildGetOblicFunnelCallHref({
        listingId: 946970,
        licenseeDefaultLanguage: unconfigured?.licenseeDefaultLanguage,
      }),
      "tel:+18666658001,946970#",
    );
    assert.equal(
      buildGetOblicFunnelClaimHref({
        authorId: unconfigured?.authorId,
        listingId: 946970,
        businessName: "Clinique Paris-Bercy",
        licenseeDefaultLanguage: unconfigured?.licenseeDefaultLanguage,
      }),
      null,
    );

    const missingAuthor = installFixture({
      ...managedClientFixture(null, INVENTORY_POOL_AUTHOR),
      licensees: [licensee(LIC_A, OWN_A, "fr"), licensee(LIC_B, OWN_B, "en")],
    });
    const french = await resolveLicenseeOwnCompanyGetOblicAuthorId(CLIENT);
    assert.ok(french);
    assert.equal(french.authorId, null);
    assert.equal(french.licenseeDefaultLanguage, "fr");
    assert.deepEqual(settingsOrganizations(missingAuthor.calls), [OWN_A]);
    assert.equal(
      buildGetOblicFunnelCallHref({
        listingId: 946970,
        licenseeDefaultLanguage: french.licenseeDefaultLanguage,
      }),
      "tel:+33162045206,946970#",
    );
    assert.equal(
      buildGetOblicFunnelClaimHref({
        authorId: french.authorId,
        listingId: 946970,
        businessName: "Clinique Paris-Bercy",
        licenseeDefaultLanguage: french.licenseeDefaultLanguage,
      }),
      null,
    );
    assert.equal(
      buildGetOblicFunnelPresentation({
        authorId: french.authorId,
        contactId: 946970,
        businessName: "Clinique Paris-Bercy",
        licenseeDefaultLanguage: french.licenseeDefaultLanguage,
      }),
      null,
    );

    for (const invalidAuthor of [0, -5, 1.5]) {
      const fixture = installFixture(managedClientFixture(invalidAuthor, CLIENT_AUTHOR));
      const resolved = await resolveLicenseeOwnCompanyGetOblicAuthorId(CLIENT);
      assert.ok(resolved, `author ${invalidAuthor}`);
      assert.equal(resolved.authorId, null, `author ${invalidAuthor}`);
      assert.equal(resolved.licenseeDefaultLanguage, "en", `author ${invalidAuthor}`);
      assert.equal(
        buildGetOblicFunnelCallHref({
          listingId: 946970,
          licenseeDefaultLanguage: resolved?.licenseeDefaultLanguage,
        }),
        "tel:+18666658001,946970#",
        `author ${invalidAuthor}`,
      );
      assert.equal(
        buildGetOblicFunnelClaimHref({
          authorId: resolved?.authorId,
          listingId: 946970,
          businessName: "Acme Clinic",
          licenseeDefaultLanguage: resolved?.licenseeDefaultLanguage,
        }),
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
    assert.equal(
      buildGetOblicFunnelCallHref({
        listingId: 946970,
        licenseeDefaultLanguage: author.licenseeDefaultLanguage,
      }),
      "tel:+18666658001,946970#",
    );
    assert.equal(
      new URL(
        buildGetOblicFunnelClaimHref({
          authorId: author.authorId,
          listingId: 946970,
          businessName: "Acme Clinic",
          licenseeDefaultLanguage: author.licenseeDefaultLanguage,
        }) ?? "",
      ).pathname,
      "/business-created-page",
    );
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
      assert.equal(detail.getoblicFunnelCallYourAi, expected.getoblicFunnelCallYourAi);
      assert.equal(detail.getoblicFunnelClaimYourAi, expected.getoblicFunnelClaimYourAi);
      assert.equal(
        detail.getoblicFunnelViewListing,
        expected.getoblicFunnelViewListing,
      );
      assert.match(detail.getoblicFunnel, /GetOblic/);
    }
  });
});

const LINKED_FUNNEL_HREFS = {
  aiAgentsHref:
    "https://claim.getoblic.com/business-portfolio-ai-agent-page?author_id=42&contact_id=946970&business_name=Acme",
  virtualPhoneHref:
    "https://claim.getoblic.com/business-portfolio-virtual-line-page?author_id=42&contact_id=946970&business_name=Acme",
  calendarHref:
    "https://claim.getoblic.com/business-portfolio-booking-page?author_id=42&contact_id=946970&business_name=Acme",
} as const;

const CALL_HREF_FR = "tel:+33162045206,946970#";
const CALL_HREF_DEFAULT = "tel:+18666658001,946970#";

function funnelActions(html: string): string[] {
  return [...html.matchAll(/data-prospect-header-action="([^"]+)"/g)].map(
    (match) => match[1] ?? "",
  );
}

function renderFunnelHeader(funnelAction: ReturnType<typeof createElement>) {
  return renderToStaticMarkup(
    createElement(ProspectDetailHeader, {
      backLabel: "Prospects",
      eyebrow: "Prospect",
      title: "Clinique Paris-Bercy",
      intelligenceLabel: "Ready",
      intelligenceStatus: "Ready",
      ready: true,
      hasDiscussion: false,
      askAthenaLabel: "Ask Athena",
      addObservationLabel: "Add observation",
      editProfileLabel: "Edit profile",
      openWebsiteLabel: "Open website",
      completenessScore: createElement("span", null, "0"),
      generateActions: null,
      researchAction: null,
      lifecycleAction: null,
      directoryAction: null,
      intelligenceGroupLabel: "Intelligence",
      prospectToolsLabel: "Prospect Tools",
      directoryGroupLabel: "GetOblic Directory",
      funnelGroupLabel: en.prospects.detail.getoblicFunnel,
      showAskAthena: false,
      showEditProfile: false,
      showAddObservation: false,
      funnelAction,
    }),
  );
}

describe("GetOblic Funnel Call and Claim CTAs", () => {
  it("keeps the existing three CTAs on their linked-only contract", () => {
    const linked = readLinkedGetOblicFunnelContactId({
      relationship_status: "linked",
      wordpress_listing_id: 946970,
    });
    const presentation = buildGetOblicFunnelPresentation({
      authorId: OWN_COMPANY_AUTHOR,
      contactId: linked,
      businessName: "Clinique Paris-Bercy",
      licenseeDefaultLanguage: "en",
    });
    assert.equal(linked, 946970);
    assert.ok(presentation);
    assert.deepEqual(Object.keys(presentation).sort(), [
      "aiAgentsHref",
      "calendarHref",
      "virtualPhoneHref",
    ]);
    assert.equal(
      new URL(presentation.aiAgentsHref).pathname,
      FUNNEL_PATHS.aiAgents,
    );
    assert.equal(
      new URL(presentation.virtualPhoneHref).pathname,
      FUNNEL_PATHS.virtualPhone,
    );
    assert.equal(
      new URL(presentation.calendarHref).pathname,
      FUNNEL_PATHS.calendar,
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
          wordpress_listing_id: 946970,
        }),
        null,
        relationship_status,
      );
      assert.equal(
        buildGetOblicFunnelPresentation({
          authorId: OWN_COMPANY_AUTHOR,
          contactId: readLinkedGetOblicFunnelContactId({
            relationship_status,
            wordpress_listing_id: 946970,
          }),
          businessName: "Clinique Paris-Bercy",
          licenseeDefaultLanguage: "fr",
        }),
        null,
        relationship_status,
      );
    }
  });

  it("shows all five CTAs for a linked Prospect and only the two new CTAs when unclaimed is authorized", () => {
    const businessName = "Clinique Paris-Bercy";
    const linkedListingId = readAuthorizedGetOblicFunnelListingId({
      mode: "linked_owner",
      wordpressListingId: 946970,
    });
    const linkedContactId = readLinkedGetOblicFunnelContactId({
      relationship_status: "linked",
      wordpress_listing_id: linkedListingId,
    });
    const linkedExisting = buildGetOblicFunnelPresentation({
      authorId: 123456789,
      contactId: linkedContactId,
      businessName,
      licenseeDefaultLanguage: "fr",
    });
    const linkedCall = buildGetOblicFunnelCallHref({
      listingId: linkedListingId,
      licenseeDefaultLanguage: "fr",
    });
    const linkedClaim = buildGetOblicFunnelClaimHref({
      authorId: 123456789,
      listingId: linkedListingId,
      businessName,
      licenseeDefaultLanguage: "fr",
    });
    assert.ok(linkedExisting);
    assert.equal(linkedCall, CALL_HREF_FR);
    assert.equal(
      linkedClaim,
      "https://claim.getoblic.com/business-demo-compte-ia-page?author_id=123456789&contact_id=946970&business_name=Clinique+Paris-Bercy",
    );

    assert.equal(
      readLinkedGetOblicFunnelContactId({
        relationship_status: "available",
        wordpress_listing_id: 946970,
      }),
      null,
    );
    assert.equal(
      buildGetOblicFunnelPresentation({
        authorId: 123456789,
        contactId: null,
        businessName,
        licenseeDefaultLanguage: "en",
      }),
      null,
    );
    const unclaimedListingId = readAuthorizedGetOblicFunnelListingId({
      mode: "unclaimed_authorized",
      wordpressListingId: 946970,
    });
    assert.equal(unclaimedListingId, 946970);
    assert.equal(
      buildGetOblicFunnelCallHref({
        listingId: unclaimedListingId,
        licenseeDefaultLanguage: "en",
      }),
      CALL_HREF_DEFAULT,
    );
    assert.equal(
      buildGetOblicFunnelClaimHref({
        authorId: 123456789,
        listingId: unclaimedListingId,
        businessName,
        licenseeDefaultLanguage: "en",
      }),
      "https://claim.getoblic.com/business-created-page?author_id=123456789&contact_id=946970&business_name=Clinique+Paris-Bercy",
    );
  });

  it("hides the new CTAs for unauthorized, revoked, and non-authorized ownership modes", () => {
    for (const mode of [
      "claiming",
      "remote_missing",
      "released",
      "available",
      "unauthorized",
    ]) {
      assert.equal(
        readAuthorizedGetOblicFunnelListingId({
          mode,
          wordpressListingId: 946970,
        }),
        null,
        mode,
      );
    }
    assert.equal(readAuthorizedGetOblicFunnelListingId(null), null);
    assert.equal(readAuthorizedGetOblicFunnelListingId(undefined), null);
    assert.equal(
      buildGetOblicFunnelCallHref({
        listingId: readAuthorizedGetOblicFunnelListingId(null),
        licenseeDefaultLanguage: "fr",
      }),
      null,
    );
    assert.equal(
      buildGetOblicFunnelClaimHref({
        authorId: 123456789,
        listingId: null,
        businessName: "Clinique Paris-Bercy",
        licenseeDefaultLanguage: "fr",
      }),
      null,
    );
  });

  it("fails closed on an invalid listing id, a missing author, or a blank business name", () => {
    const unsafeListingIds = [
      0,
      -1,
      1.5,
      Number.NaN,
      Number.POSITIVE_INFINITY,
      Number.MAX_SAFE_INTEGER + 1,
      "946970",
      "946970#",
      null,
      undefined,
      "1 OR 1",
    ];
    for (const listingId of unsafeListingIds) {
      assert.equal(
        readAuthorizedGetOblicFunnelListingId({
          mode: "linked_owner",
          wordpressListingId: listingId,
        }),
        null,
        `listing ${String(listingId)}`,
      );
      assert.equal(
        readAuthorizedGetOblicFunnelListingId({
          mode: "unclaimed_authorized",
          wordpressListingId: listingId,
        }),
        null,
        `unclaimed listing ${String(listingId)}`,
      );
      assert.equal(
        buildGetOblicFunnelCallHref({
          listingId,
          licenseeDefaultLanguage: "en",
        }),
        null,
        `call ${String(listingId)}`,
      );
      assert.equal(
        buildGetOblicFunnelClaimHref({
          authorId: 123456789,
          listingId,
          businessName: "Clinique Paris-Bercy",
          licenseeDefaultLanguage: "en",
        }),
        null,
        `claim ${String(listingId)}`,
      );
    }

    assert.equal(
      buildGetOblicFunnelCallHref({
        listingId: 946970,
        licenseeDefaultLanguage: "en",
      }),
      CALL_HREF_DEFAULT,
    );
    for (const authorId of [0, -1, 1.5, "123456789", null, undefined]) {
      assert.equal(
        buildGetOblicFunnelClaimHref({
          authorId,
          listingId: 946970,
          businessName: "Clinique Paris-Bercy",
          licenseeDefaultLanguage: "fr",
        }),
        null,
        `author ${String(authorId)}`,
      );
    }
    for (const businessName of ["", "   ", null, undefined]) {
      assert.equal(
        buildGetOblicFunnelClaimHref({
          authorId: 123456789,
          listingId: 946970,
          businessName,
          licenseeDefaultLanguage: "en",
        }),
        null,
        `name ${String(businessName)}`,
      );
      assert.equal(
        buildGetOblicFunnelCallHref({
          listingId: 946970,
          licenseeDefaultLanguage: "en",
        }),
        CALL_HREF_DEFAULT,
        `call still open for ${String(businessName)}`,
      );
    }
    assert.equal(
      buildGetOblicFunnelCallHref({
        listingId: 946970,
        licenseeDefaultLanguage: null,
      }),
      null,
    );
    assert.equal(
      buildGetOblicFunnelClaimHref({
        authorId: 123456789,
        listingId: 946970,
        businessName: "Clinique Paris-Bercy",
        licenseeDefaultLanguage: "xx",
      }),
      null,
    );
  });

  it("formats the telephone extension and claim destination from Licensee language", () => {
    assert.equal(
      buildGetOblicFunnelCallHref({
        listingId: 946970,
        licenseeDefaultLanguage: "fr",
      }),
      CALL_HREF_FR,
    );
    for (const language of ORGANIZATION_LANGUAGES.filter((code) => code !== "fr")) {
      assert.equal(
        buildGetOblicFunnelCallHref({
          listingId: 946970,
          licenseeDefaultLanguage: language,
        }),
        CALL_HREF_DEFAULT,
        language,
      );
      const claim = buildGetOblicFunnelClaimHref({
        authorId: 123456789,
        listingId: 946970,
        businessName: "Clinique Paris-Bercy",
        licenseeDefaultLanguage: language,
      });
      assert.equal(
        claim,
        "https://claim.getoblic.com/business-created-page?author_id=123456789&contact_id=946970&business_name=Clinique+Paris-Bercy",
        language,
      );
    }

    const names = [
      "Clinique Paris-Bercy",
      "Café André",
      "North & West = Clinic",
    ];
    for (const businessName of names) {
      const href = buildGetOblicFunnelClaimHref({
        authorId: 123456789,
        listingId: 946970,
        businessName: `  ${businessName}  `,
        licenseeDefaultLanguage: "fr",
      });
      assert.ok(href, businessName);
      assert.equal(href.split("?").length, 2, businessName);
      assert.equal(href.includes(" "), false, businessName);
      const url = new URL(href);
      assert.equal(url.origin, "https://claim.getoblic.com");
      assert.equal(url.pathname, "/business-demo-compte-ia-page");
      assert.deepEqual([...url.searchParams.keys()], [
        "author_id",
        "contact_id",
        "business_name",
      ]);
      assert.equal(url.searchParams.get("author_id"), "123456789");
      assert.equal(url.searchParams.get("contact_id"), "946970");
      assert.equal(url.searchParams.get("business_name"), businessName);
      assert.equal(url.hash, "");
    }
    const punctuated = buildGetOblicFunnelClaimHref({
      authorId: 123456789,
      listingId: 946970,
      businessName: "North & West = Clinic",
      licenseeDefaultLanguage: "de",
    });
    assert.ok(punctuated);
    assert.match(punctuated, /%26/);
    assert.match(punctuated, /%3D/);
    assert.match(punctuated, /\+/);
    assert.doesNotMatch(punctuated, /North & West/);
    const accented = buildGetOblicFunnelClaimHref({
      authorId: 123456789,
      listingId: 946970,
      businessName: "Café André",
      licenseeDefaultLanguage: "pt",
    });
    assert.ok(accented);
    assert.match(accented, /Caf%C3%A9\+Andr%C3%A9/);

    assert.throws(
      () => validateDestinationUrl(CALL_HREF_FR),
      /valid HTTP or HTTPS URL/i,
    );
    const presentation = read("lib/prospects/getOblicFunnelPresentation.ts");
    assert.match(presentation, /tel:\$\{telephone\},\$\{listingId\}#/);
    assert.match(presentation, /\+33162045206/);
    assert.match(presentation, /\+18666658001/);
    assert.doesNotMatch(presentation, /validateDestinationUrl/);
    assert.doesNotMatch(
      presentation,
      /business-demo-compte-ia-page|business-created-page/,
    );
  });

  it("renders Call without target=_blank and keeps partial funnel eligibility", () => {
    const html = renderToStaticMarkup(
      createElement(GetOblicFunnelControls, {
        ...LINKED_FUNNEL_HREFS,
        callHref: CALL_HREF_FR,
        claimHref:
          "https://claim.getoblic.com/business-demo-compte-ia-page?author_id=123456789&contact_id=946970&business_name=Clinique+Paris-Bercy",
        aiAgentsLabel: en.prospects.detail.getoblicFunnelAiAgents,
        virtualPhoneLabel: en.prospects.detail.getoblicFunnelVirtualPhone,
        calendarLabel: en.prospects.detail.getoblicFunnelCalendar,
        callLabel: en.prospects.detail.getoblicFunnelCallYourAi,
        claimLabel: en.prospects.detail.getoblicFunnelClaimYourAi,
      }),
    );
    assert.deepEqual(funnelActions(html), [
      "getoblic-funnel-ai-agents",
      "getoblic-funnel-virtual-phone",
      "getoblic-funnel-calendar",
      "getoblic-funnel-call-your-ai",
      "getoblic-funnel-claim-your-ai",
    ]);
    assert.equal((html.match(/target="_blank"/g) ?? []).length, 4);
    assert.equal((html.match(/rel="noopener noreferrer"/g) ?? []).length, 4);
    assert.equal((html.match(/lucide-external-link/g) ?? []).length, 4);
    assert.match(html, /lucide-phone/);
    const callAnchor = html
      .split("<a ")
      .find((anchor) => anchor.includes("getoblic-funnel-call-your-ai"));
    assert.ok(callAnchor);
    assert.match(callAnchor, /href="tel:\+33162045206,946970#"/);
    assert.doesNotMatch(callAnchor, /target="_blank"|rel="noopener noreferrer"/);
    const claimAnchor = html
      .split("<a ")
      .find((anchor) => anchor.includes("getoblic-funnel-claim-your-ai"));
    assert.ok(claimAnchor);
    assert.match(claimAnchor, /target="_blank"/);
    assert.match(claimAnchor, /rel="noopener noreferrer"/);

    const partial = renderToStaticMarkup(
      createElement(GetOblicFunnelControls, {
        callHref: CALL_HREF_DEFAULT,
        claimHref: null,
        aiAgentsHref: null,
        virtualPhoneHref: null,
        calendarHref: null,
        aiAgentsLabel: en.prospects.detail.getoblicFunnelAiAgents,
        virtualPhoneLabel: en.prospects.detail.getoblicFunnelVirtualPhone,
        calendarLabel: en.prospects.detail.getoblicFunnelCalendar,
        callLabel: en.prospects.detail.getoblicFunnelCallYourAi,
        claimLabel: en.prospects.detail.getoblicFunnelClaimYourAi,
      }),
    );
    assert.deepEqual(funnelActions(partial), ["getoblic-funnel-call-your-ai"]);
    assert.doesNotMatch(partial, /target="_blank"|Claim your AI|AI Agents/);
    const header = renderFunnelHeader(
      createElement(GetOblicFunnelControls, {
        callHref: CALL_HREF_DEFAULT,
        claimHref:
          "https://claim.getoblic.com/business-created-page?author_id=42&contact_id=946970&business_name=Acme",
        callLabel: en.prospects.detail.getoblicFunnelCallYourAi,
        claimLabel: en.prospects.detail.getoblicFunnelClaimYourAi,
      }),
    );
    assert.match(header, /data-prospect-header-actions="funnel"/);
    assert.match(header, new RegExp(en.prospects.detail.getoblicFunnel));
    assert.deepEqual(
      funnelActions(header).filter((action) => action.startsWith("getoblic-funnel-")),
      ["getoblic-funnel-call-your-ai", "getoblic-funnel-claim-your-ai"],
    );
    assert.doesNotMatch(header, /data-prospect-header-actions="directory"/);
    const omitted = renderFunnelHeader(createElement("span", null));
    assert.match(omitted, /data-prospect-header-actions="funnel"/);
    const hidden = renderToStaticMarkup(
      createElement(ProspectDetailHeader, {
        backLabel: "Prospects",
        eyebrow: "Prospect",
        title: "Clinique Paris-Bercy",
        intelligenceLabel: "Ready",
        intelligenceStatus: "Ready",
        ready: true,
        hasDiscussion: false,
        askAthenaLabel: "Ask Athena",
        addObservationLabel: "Add observation",
        editProfileLabel: "Edit profile",
        openWebsiteLabel: "Open website",
        completenessScore: createElement("span", null, "0"),
        generateActions: null,
        researchAction: null,
        lifecycleAction: null,
        intelligenceGroupLabel: "Intelligence",
        prospectToolsLabel: "Prospect Tools",
        directoryGroupLabel: "GetOblic Directory",
        funnelGroupLabel: en.prospects.detail.getoblicFunnel,
        showEditProfile: false,
        funnelAction: null,
      }),
    );
    assert.doesNotMatch(hidden, /data-prospect-header-actions="funnel"/);
    assert.doesNotMatch(hidden, /GetOblic Funnel/);
  });

  it("keeps Prospect Detail closed when outbound authorization is refused", () => {
    const page = read("app/prospects/[id]/page.tsx");
    const controls = read("components/prospects/GetOblicFunnelControls.tsx");
    const resolveAt = page.indexOf("resolveGetOblicOutboundContentTarget");
    const catchAt = page.indexOf("catch (error)", resolveAt);
    assert.ok(resolveAt > 0);
    assert.ok(catchAt > resolveAt);
    assert.match(
      page.slice(resolveAt, catchAt + 320),
      /authorizedGetOblicListingId = null/,
    );
    assert.match(page, /readLinkedGetOblicFunnelContactId\(activeGetOblicLink\)/);
    assert.match(page, /showGetOblicFunnel/);
    assert.match(page, /funnelAction=\{[\s\S]*?showGetOblicFunnel \?/);
    assert.doesNotMatch(page, /prospect\.phone/);
    assert.doesNotMatch(page, /validateDestinationUrl/);
    assert.doesNotMatch(page, /activeGetOblicLink\?\.wordpress_listing_id/);

    const callAt = page.indexOf("buildGetOblicFunnelCallHref({");
    const claimAt = page.indexOf("buildGetOblicFunnelClaimHref({");
    assert.ok(callAt > 0);
    assert.ok(claimAt > callAt);
    assert.doesNotMatch(
      page.slice(callAt, claimAt),
      /authorId|prospect\.phone|validateDestinationUrl/,
    );
    assert.match(
      page.slice(claimAt, claimAt + 420),
      /authorId: licenseeOwnCompanyAuthor\?\.authorId/,
    );

    const telephone = controls.slice(
      controls.indexOf("isTelHref(callHref)"),
      controls.indexOf("isHttpsHref(claimHref)"),
    );
    assert.doesNotMatch(telephone, /target="_blank"/);
    assert.match(controls, /target="_blank"/);
    assert.match(controls, /rel="noopener noreferrer"/);
  });
});
