import "./licenseeAuthTestEnv";

import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { afterEach, describe, it } from "node:test";
import { supabaseAdmin } from "../../lib/supabaseAdmin";
import {
  LicenseeAccessError,
  getLicenseeAccountsByOwnCompanyOrganizationId,
} from "../../services/licensee/licenseeIdentity";
import { GetOblicDirectoryError } from "../../services/getoblicDirectory/getoblicDirectoryErrors";
import {
  releaseGetOblicListing,
  type ReleaseGetOblicListingWordpressPort,
} from "../../services/getoblicDirectory/getoblicDirectoryReleaseService";
import { GETOBLIC_INVENTORY_POOL_AUTHOR_ID } from "../../services/getoblicDirectory/getoblicDirectoryTypes";
import {
  LicenseeProspectClientConversionError,
  promoteLicenseeProspectToClient,
  reverseLicenseeProspectClientConversion,
} from "../../services/licensee/licenseeProspectClientConversion";
import {
  buildProvisionalClientAccountEmailCandidates,
  collisionLocalPartFallback,
  emptyLocalPartFallback,
  normalizeProvisionalEmailLocalPart,
  stableShortProspectId,
} from "../../services/licensee/provisionalClientAccountEmail";

const ROOT = process.cwd();

function read(relativePath: string): string {
  return readFileSync(join(ROOT, relativePath), "utf8");
}

const MASTER_USER_ID = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
const TENANT_OWNER_USER_ID = "a1a1a1a1-a1a1-4a1a-8a1a-a1a1a1a1a1a1";
const TENANT_OWNER_2_USER_ID = "a2a2a2a2-a2a2-4a2a-8a2a-a2a2a2a2a2a2";
const LICENSEE_ACCOUNT_ID = "11111111-1111-4111-8111-111111111111";
const OWN_COMPANY_ORG_ID = "33333333-3333-4333-8333-333333333333";
const OWN_COMPANY_REL_ID = "55555555-5555-4555-8555-555555555555";
const PROSPECT_A = "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb";
const PROSPECT_B = "cccccccc-cccc-4ccc-8ccc-cccccccccccc";
const MASTER_B_USER_ID = "dddddddd-dddd-4ddd-8ddd-dddddddddddd";
const TENANT_B_OWNER_USER_ID = "b1b1b1b1-b1b1-4b1b-8b1b-b1b1b1b1b1b1";
const LICENSEE_B_ID = "22222222-2222-4222-8222-222222222222";
const MANAGED_CLIENT_ORG = "44444444-4444-4444-8444-444444444444";
const MANAGED_REL_ID = "66666666-6666-4666-8666-666666666666";
const UNRELATED_ORG = "77777777-7777-4777-8777-777777777777";
const UNRELATED_USER = "88888888-8888-4888-8888-888888888888";
const PLAIN_ORG = "99999999-9999-4999-8999-999999999999";
const PARTIAL_CLIENT_ORG = "abababab-abab-4aba-8aba-abababababab";
const PARTIAL_CLIENT_USER = "acacacac-acac-4aca-8aca-acacacacacac";
const PARTIAL_CLIENT_REL = "adadadad-adad-4ada-8ada-adadadadadad";
const OTHER_LICENSEE_ORG = "aeaeaeae-aeae-4aea-8aea-aeaeaeaeaeae";
const OTHER_LICENSEE_REL = "afafafaf-afaf-4afa-8afa-afafafafafaf";
const MASTER_EMAIL = "master-a@example.com";
const NOW = "2026-09-15T12:00:00.000Z";

type OrganizationRow = {
  id: string;
  name: string;
  slug: string;
  language?: string;
};

type MembershipRow = {
  user_id: string;
  organization_id: string;
  role: string;
};

type LicenseeRow = {
  id: string;
  user_id: string;
  email: string;
  own_company_organization_id: string | null;
  default_language?: string;
};

type RelationshipRow = {
  id: string;
  licensee_account_id: string;
  organization_id: string;
};

type ConversionRow = {
  id: string;
  prospect_id: string;
  source_organization_id: string;
  client_organization_id: string;
  licensee_account_id: string;
  licensee_sub_account_id: string | null;
  status: string;
  client_account_email: string;
  converted_at: string;
  converted_by_user_id: string | null;
  restored_at: string | null;
  restored_by_user_id: string | null;
  created_at: string;
  updated_at: string;
};

type ProspectRow = {
  id: string;
  organization_id: string;
  business_name: string;
  email: string | null;
  lifecycle_status: string;
  website_intelligence: Record<string, unknown> | null;
  [key: string]: unknown;
};

type IntentRow = {
  prospect_id: string;
  source_organization_id: string;
  licensee_account_id: string;
  intended_client_account_email: string;
  created_by_user_id: string | null;
  created_at: string;
};

type GetOblicLinkRow = {
  id: string;
  organization_id: string;
  prospect_id: string;
  wordpress_listing_id: number;
  google_id_snapshot: string | null;
  google_id_is_matchable: boolean;
  relationship_origin: string;
  relationship_status: string;
  wordpress_author_id: number | null;
  allocated_at: string | null;
  last_verified_at: string | null;
  last_remote_error: string | null;
  last_remote_error_at: string | null;
  kb_push_status: string;
  kb_last_pushed_executive_version_id: string | null;
  kb_last_content_sha256: string | null;
  kb_last_pushed_at: string | null;
  kb_last_push_error: string | null;
  kb_last_push_error_at: string | null;
  created_by_user_id: string | null;
  created_via_licensee_account_id: string | null;
  created_at: string;
  updated_at: string;
  released_at: string | null;
};

type Fixture = {
  organizations: Record<string, OrganizationRow>;
  memberships: MembershipRow[];
  licenseeByUserId: Record<string, LicenseeRow>;
  relationships: RelationshipRow[];
  conversions: ConversionRow[];
  intents: IntentRow[];
  prospects: ProspectRow[];
  getoblicLinks: GetOblicLinkRow[];
  directorySettings: Array<{
    organization_id: string;
    monthly_allowance: number;
    wordpress_author_id: number | null;
    created_at: string;
    updated_at: string;
    updated_by_user_id: string | null;
  }>;
  accessStatusByUserId: Record<string, "active" | "deactivated" | undefined>;
  superAdminsByUserId: Record<string, { id: string; user_id: string }>;
  authUsersByEmail: Record<string, { id: string; email: string }>;
  conversionInsertFailures: Array<{ code: string; message: string }>;
  intentDeleteFailures: Array<{ code?: string; message: string }>;
};

type CallLog = {
  tables: string[];
  inserts: Array<{ table: string; values: Record<string, unknown> }>;
  updates: Array<{
    table: string;
    values: Record<string, unknown>;
    filters: Record<string, string>;
  }>;
  deletes: Array<{ table: string; filters: Record<string, string> }>;
};

const originalFrom = supabaseAdmin.from.bind(supabaseAdmin);
const originalCreateUser = supabaseAdmin.auth.admin.createUser.bind(
  supabaseAdmin.auth.admin,
);
const originalFetch = globalThis.fetch;

function cloneProspect(row: ProspectRow): ProspectRow {
  return {
    ...row,
    website_intelligence: row.website_intelligence
      ? { ...row.website_intelligence }
      : null,
  };
}

function makeProspect(partial: Partial<ProspectRow> & Pick<ProspectRow, "id" | "business_name">): ProspectRow {
  return {
    organization_id: OWN_COMPANY_ORG_ID,
    email: "contact@joesplumbing.com",
    lifecycle_status: "Qualified",
    website_intelligence: { summary: "do not copy" },
    created_at: NOW,
    updated_at: NOW,
    user_id: null,
    community_id: null,
    linked_discussion_id: null,
    status: "Ready",
    ...partial,
  };
}

function makeIntent(
  partial: Partial<IntentRow> & Pick<IntentRow, "prospect_id">,
): IntentRow {
  return {
    source_organization_id: OWN_COMPANY_ORG_ID,
    licensee_account_id: LICENSEE_ACCOUNT_ID,
    intended_client_account_email: "joesplumbing@getoblic.com",
    created_by_user_id: MASTER_USER_ID,
    created_at: NOW,
    ...partial,
  };
}

function promoteInput(
  prospectId = PROSPECT_A,
  actingUserId = TENANT_OWNER_USER_ID,
) {
  return {
    prospectId,
    sourceOrganizationId: OWN_COMPANY_ORG_ID,
    actingUserId,
  };
}

function reverseInput(prospectId = PROSPECT_A) {
  return {
    prospectId,
    sourceOrganizationId: OWN_COMPANY_ORG_ID,
    masterUserId: MASTER_USER_ID,
  };
}

function installFixture(fixture: Fixture): CallLog {
  const calls: CallLog = { tables: [], inserts: [], updates: [], deletes: [] };
  let orgSeq = 0;
  let relSeq = 0;
  let conversionSeq = 0;

  const rowsFor = (table: string): Record<string, unknown>[] => {
    if (table === "organizations") {
      return Object.values(fixture.organizations);
    }
    if (table === "organization_members") {
      return fixture.memberships as unknown as Record<string, unknown>[];
    }
    if (table === "licensee_accounts") {
      return Object.values(fixture.licenseeByUserId);
    }
    if (table === "licensee_sub_accounts") {
      return fixture.relationships as unknown as Record<string, unknown>[];
    }
    if (table === "licensee_prospect_client_conversions") {
      return fixture.conversions as unknown as Record<string, unknown>[];
    }
    if (table === "licensee_prospect_client_provisioning_intents") {
      return fixture.intents as unknown as Record<string, unknown>[];
    }
    if (table === "prospects") {
      return fixture.prospects as unknown as Record<string, unknown>[];
    }
    if (table === "athena_getoblic_listing_links") {
      return fixture.getoblicLinks as unknown as Record<string, unknown>[];
    }
    if (table === "athena_getoblic_directory_settings") {
      return fixture.directorySettings as unknown as Record<string, unknown>[];
    }
    if (table === "account_access_status") {
      return Object.entries(fixture.accessStatusByUserId)
        .filter(([, status]) => status)
        .map(([user_id, status]) => ({ user_id, status }));
    }
    if (table === "getoblic_super_admins") {
      return Object.values(fixture.superAdminsByUserId);
    }
    return [];
  };

  const matches = (
    row: Record<string, unknown>,
    filters: Record<string, unknown>,
    nullFilters: Set<string>,
  ) => {
    for (const [column, expected] of Object.entries(filters)) {
      if (Array.isArray(expected)) {
        if (!expected.includes(row[column])) {
          return false;
        }
      } else if (row[column] !== expected) {
        return false;
      }
    }
    for (const column of nullFilters) {
      if (row[column] != null) {
        return false;
      }
    }
    return true;
  };

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  (supabaseAdmin as any).from = (table: string) => {
    calls.tables.push(table);
    const filters: Record<string, unknown> = {};
    const nullFilters = new Set<string>();
    let pendingInsert: Record<string, unknown> | null = null;
    let pendingUpdate: Record<string, unknown> | null = null;
    let pendingDelete = false;
    let countHead = false;
    let insertError: { code: string; message: string } | null = null;

    const matchingRows = () =>
      rowsFor(table).filter((row) => matches(row, filters, nullFilters));

    const applyInsert = (values: Record<string, unknown>) => {
      if (table === "organizations") {
        orgSeq += 1;
        const id = `created-org-${orgSeq}`;
        const row: OrganizationRow = {
          id,
          name: String(values.name || ""),
          slug: String(values.slug || ""),
        };
        if ("language" in values) {
          row.language = String(values.language);
        }
        fixture.organizations[id] = row;
        values.id = id;
        return row;
      }
      if (table === "organization_members") {
        const row: MembershipRow = {
          user_id: String(values.user_id),
          organization_id: String(values.organization_id),
          role: String(values.role || "owner"),
        };
        fixture.memberships.push(row);
        return row;
      }
      if (table === "licensee_sub_accounts") {
        const duplicate = fixture.relationships.find(
          (row) =>
            row.licensee_account_id === values.licensee_account_id &&
            row.organization_id === values.organization_id,
        );
        if (duplicate) {
          insertError = {
            code: "23505",
            message: "duplicate relationship",
          };
          return null;
        }
        relSeq += 1;
        const row: RelationshipRow = {
          id: `created-rel-${relSeq}`,
          licensee_account_id: String(values.licensee_account_id),
          organization_id: String(values.organization_id),
        };
        fixture.relationships.push(row);
        return row;
      }
      if (table === "licensee_prospect_client_provisioning_intents") {
        const email = String(values.intended_client_account_email || "")
          .trim()
          .toLowerCase();
        const prospectConflict = fixture.intents.find(
          (row) => row.prospect_id === values.prospect_id,
        );
        const emailConflict = fixture.intents.find(
          (row) =>
            row.intended_client_account_email.trim().toLowerCase() === email,
        );
        if (prospectConflict || emailConflict) {
          insertError = { code: "23505", message: "duplicate intent" };
          return null;
        }
        const row: IntentRow = {
          prospect_id: String(values.prospect_id),
          source_organization_id: String(values.source_organization_id),
          licensee_account_id: String(values.licensee_account_id),
          intended_client_account_email: email,
          created_by_user_id: values.created_by_user_id
            ? String(values.created_by_user_id)
            : null,
          created_at: String(values.created_at || NOW),
        };
        fixture.intents.push(row);
        return row;
      }
      if (table === "licensee_prospect_client_conversions") {
        if (fixture.conversionInsertFailures.length > 0) {
          insertError = fixture.conversionInsertFailures.shift()!;
          return null;
        }
        const conflict = fixture.conversions.find(
          (row) =>
            row.prospect_id === values.prospect_id ||
            row.client_organization_id === values.client_organization_id ||
            row.client_account_email === values.client_account_email,
        );
        if (conflict) {
          insertError = { code: "23505", message: "duplicate conversion" };
          return null;
        }
        conversionSeq += 1;
        const timestamp = String(values.created_at || NOW);
        const row: ConversionRow = {
          id: `conversion-${conversionSeq}`,
          prospect_id: String(values.prospect_id),
          source_organization_id: String(values.source_organization_id),
          client_organization_id: String(values.client_organization_id),
          licensee_account_id: String(values.licensee_account_id),
          licensee_sub_account_id: values.licensee_sub_account_id
            ? String(values.licensee_sub_account_id)
            : null,
          status: String(values.status),
          client_account_email: String(values.client_account_email),
          converted_at: String(values.converted_at || timestamp),
          converted_by_user_id: values.converted_by_user_id
            ? String(values.converted_by_user_id)
            : null,
          restored_at: values.restored_at ? String(values.restored_at) : null,
          restored_by_user_id: values.restored_by_user_id
            ? String(values.restored_by_user_id)
            : null,
          created_at: timestamp,
          updated_at: String(values.updated_at || timestamp),
        };
        fixture.conversions.push(row);
        return row;
      }
      return values;
    };

    const applyUpdate = () => {
      if (!pendingUpdate) {
        return matchingRows()[0] ?? null;
      }
      const matched = matchingRows();
      for (const row of matched) {
        Object.assign(row, pendingUpdate);
      }
      return matched[0] ?? null;
    };

    const applyDelete = () => {
      if (table === "licensee_prospect_client_provisioning_intents") {
        if (fixture.intentDeleteFailures.length > 0) {
          return { error: fixture.intentDeleteFailures.shift()! };
        }
        const index = fixture.intents.findIndex((row) =>
          matches(
            row as unknown as Record<string, unknown>,
            filters,
            nullFilters,
          ),
        );
        if (index >= 0) {
          fixture.intents.splice(index, 1);
        }
      }
      if (table === "licensee_sub_accounts") {
        const index = fixture.relationships.findIndex((row) =>
          matches(
            row as unknown as Record<string, unknown>,
            filters,
            nullFilters,
          ),
        );
        if (index >= 0) {
          fixture.relationships.splice(index, 1);
        }
      }
      if (table === "organizations") {
        for (const row of matchingRows()) {
          delete fixture.organizations[String(row.id)];
        }
      }
      return { error: null };
    };

    const finishRead = () => {
      const matched = matchingRows();
      if (countHead) {
        return { data: null, count: matched.length, error: null };
      }
      return { data: matched, count: matched.length, error: null };
    };

    const builder = {
      select(_columns?: string, options?: { count?: string; head?: boolean }) {
        countHead = Boolean(options?.head && options.count === "exact");
        return builder;
      },
      eq(column: string, value: string) {
        filters[column] = value;
        return builder;
      },
      in(column: string, values: unknown[]) {
        filters[column] = values;
        return builder;
      },
      is(column: string, value: null) {
        if (value === null) {
          nullFilters.add(column);
        }
        return builder;
      },
      insert(values: Record<string, unknown>) {
        pendingInsert = values;
        const inserted = applyInsert(values);
        calls.inserts.push({ table, values: { ...values } });
        return builder;
      },
      update(values: Record<string, unknown>) {
        pendingUpdate = values;
        calls.updates.push({
          table,
          values: { ...values },
          filters: Object.fromEntries(
            Object.entries(filters).map(([key, value]) => [key, String(value)]),
          ),
        });
        return builder;
      },
      delete() {
        pendingDelete = true;
        return builder;
      },
      async maybeSingle() {
        if (pendingDelete) {
          calls.deletes.push({ table, filters: { ...filters } });
          applyDelete();
          return { data: null, error: null };
        }
        if (pendingUpdate) {
          return { data: applyUpdate(), error: null };
        }
        if (pendingInsert) {
          if (insertError) {
            return { data: null, error: insertError };
          }
          const inserted = matchingRows()[0] ?? pendingInsert;
          return { data: inserted, error: null };
        }
        const matched = matchingRows();
        return { data: matched[0] ?? null, error: null };
      },
      async single() {
        if (pendingInsert && insertError) {
          return { data: null, error: insertError };
        }
        if (pendingInsert) {
          if (table === "organizations") {
            const created = Object.values(fixture.organizations).at(-1);
            return {
              data: created ?? null,
              error: created ? null : { message: "insert failed" },
            };
          }
          if (table === "licensee_prospect_client_conversions") {
            const created = fixture.conversions.at(-1);
            return {
              data: created ?? null,
              error: created ? null : { message: "insert failed" },
            };
          }
          if (table === "licensee_prospect_client_provisioning_intents") {
            const created = fixture.intents.at(-1);
            return {
              data: created ?? pendingInsert,
              error: created ? null : { message: "insert failed" },
            };
          }
        }
        if (pendingUpdate) {
          const updated = applyUpdate();
          return {
            data: updated,
            error: updated ? null : { message: "update failed" },
          };
        }
        const matched = matchingRows();
        return {
          data: matched[0] ?? null,
          error: matched[0] ? null : { message: "not found" },
        };
      },
      then(
        onFulfilled?: (value: { data: unknown; count?: number; error: unknown }) => unknown,
        onRejected?: (reason: unknown) => unknown,
      ) {
        if (pendingDelete) {
          calls.deletes.push({ table, filters: { ...filters } });
          return Promise.resolve(applyDelete()).then(onFulfilled, onRejected);
        }
        if (pendingInsert) {
          return Promise.resolve({
            data: insertError ? null : pendingInsert,
            error: insertError,
          }).then(onFulfilled, onRejected);
        }
        if (pendingUpdate) {
          return Promise.resolve({
            data: applyUpdate(),
            error: null,
          }).then(onFulfilled, onRejected);
        }
        return Promise.resolve(finishRead()).then(onFulfilled, onRejected);
      },
    };

    return builder;
  };

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  (supabaseAdmin.auth.admin as any).createUser = async (attrs: {
    email?: string;
  }) => {
    const email = String(attrs.email || "").trim().toLowerCase();
    const existing = fixture.authUsersByEmail[email];
    if (existing) {
      return {
        data: { user: null },
        error: { message: "User already registered" },
      };
    }
    const created = { id: `created-user-${email}`, email };
    fixture.authUsersByEmail[email] = created;
    return { data: { user: created }, error: null };
  };

  globalThis.fetch = (async (input: RequestInfo | URL) => {
    const url = new URL(String(input));
    if (url.pathname.endsWith("/auth/v1/admin/users")) {
      const email = (url.searchParams.get("email") || "").trim().toLowerCase();
      const user = fixture.authUsersByEmail[email];
      return new Response(JSON.stringify({ users: user ? [user] : [] }), {
        status: 200,
        headers: { "Content-Type": "application/json" },
      });
    }
    return new Response("not mocked", { status: 404 });
  }) as typeof fetch;

  return calls;
}

function restoreMocks() {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  (supabaseAdmin as any).from = originalFrom;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  (supabaseAdmin.auth.admin as any).createUser = originalCreateUser;
  globalThis.fetch = originalFetch;
}

function makeGetOblicProvenance(wordpressListingId = 1000): Record<string, unknown> {
  return {
    origin: "getoblic_directory",
    wordpress_listing_id: wordpressListingId,
  };
}

function makeGetOblicLink(
  partial: Partial<GetOblicLinkRow> &
    Pick<GetOblicLinkRow, "organization_id" | "prospect_id" | "relationship_status">,
): GetOblicLinkRow {
  return {
    id: partial.id ?? "link-1",
    wordpress_listing_id: partial.wordpress_listing_id ?? 1000,
    google_id_snapshot: partial.google_id_snapshot ?? null,
    google_id_is_matchable: partial.google_id_is_matchable ?? false,
    relationship_origin: partial.relationship_origin ?? "linked_existing",
    wordpress_author_id: partial.wordpress_author_id ?? 42,
    allocated_at: partial.allocated_at ?? NOW,
    last_verified_at: partial.last_verified_at ?? null,
    last_remote_error: partial.last_remote_error ?? null,
    last_remote_error_at: partial.last_remote_error_at ?? null,
    kb_push_status: partial.kb_push_status ?? "never",
    kb_last_pushed_executive_version_id: null,
    kb_last_content_sha256: null,
    kb_last_pushed_at: null,
    kb_last_push_error: null,
    kb_last_push_error_at: null,
    created_by_user_id: null,
    created_via_licensee_account_id: null,
    created_at: NOW,
    updated_at: NOW,
    released_at: partial.released_at ?? null,
    ...partial,
  };
}

function ownCompanyFixture(overrides: Partial<Fixture> = {}): Fixture {
  return {
    organizations: {
      [OWN_COMPANY_ORG_ID]: {
        id: OWN_COMPANY_ORG_ID,
        name: "Licensee Own Company",
        slug: "licensee-own-company",
      },
    },
    memberships: [],
    licenseeByUserId: {
      [MASTER_USER_ID]: {
        id: LICENSEE_ACCOUNT_ID,
        user_id: MASTER_USER_ID,
        email: MASTER_EMAIL,
        own_company_organization_id: OWN_COMPANY_ORG_ID,
      },
    },
    relationships: [
      {
        id: OWN_COMPANY_REL_ID,
        licensee_account_id: LICENSEE_ACCOUNT_ID,
        organization_id: OWN_COMPANY_ORG_ID,
      },
    ],
    conversions: [],
    intents: [],
    conversionInsertFailures: [],
    intentDeleteFailures: [],
    getoblicLinks: [],
    directorySettings: [],
    prospects: [
      makeProspect({
        id: PROSPECT_A,
        business_name: "Joe's Plumbing",
      }),
    ],
    accessStatusByUserId: {
      [MASTER_USER_ID]: "active",
    },
    superAdminsByUserId: {},
    authUsersByEmail: {},
    ...overrides,
  };
}

afterEach(() => {
  restoreMocks();
});

describe("provisional @getoblic.com identity normalization", () => {
  it("normalizes the frozen product examples", () => {
    assert.equal(normalizeProvisionalEmailLocalPart("Joe's Plumbing"), "joesplumbing");
    assert.equal(
      normalizeProvisionalEmailLocalPart("ACME Dental Center"),
      "acmedentalcenter",
    );
    assert.equal(normalizeProvisionalEmailLocalPart("Chez René"), "chezrene");
  });

  it("handles uppercase, punctuation, repeated spaces, and whitespace", () => {
    assert.equal(
      normalizeProvisionalEmailLocalPart("  JOE'S   PLUMBING  "),
      "joesplumbing",
    );
    assert.equal(
      normalizeProvisionalEmailLocalPart("ACME, Dental & Center!!!"),
      "acmedentalcenter",
    );
    assert.equal(
      normalizeProvisionalEmailLocalPart("Joe’s Plumbing"),
      "joesplumbing",
    );
  });

  it("transliterates accented Latin characters", () => {
    assert.equal(normalizeProvisionalEmailLocalPart("Café Réñe"), "caferene");
    assert.equal(normalizeProvisionalEmailLocalPart("Ångström"), "angstrom");
  });

  it("uses a deterministic prospect-id fallback when the name is empty", () => {
    assert.equal(normalizeProvisionalEmailLocalPart("   "), "");
    assert.equal(normalizeProvisionalEmailLocalPart("!!!"), "");
    assert.equal(normalizeProvisionalEmailLocalPart("日本語"), "");
    assert.equal(emptyLocalPartFallback(PROSPECT_A), `prospect${PROSPECT_A.slice(0, 8)}`);

    const empty = buildProvisionalClientAccountEmailCandidates({
      businessName: "@@@",
      prospectId: PROSPECT_A,
    });
    assert.equal(empty.primary, `prospect${PROSPECT_A.slice(0, 8)}@getoblic.com`);
    assert.equal(
      empty.fallback,
      `prospect${PROSPECT_A.replace(/-/g, "")}@getoblic.com`,
    );
  });

  it("builds deterministic primary and collision fallback identities", () => {
    const candidates = buildProvisionalClientAccountEmailCandidates({
      businessName: "Joe's Plumbing",
      prospectId: PROSPECT_A,
    });
    assert.equal(candidates.primary, "joesplumbing@getoblic.com");
    assert.equal(
      candidates.fallback,
      `joesplumbing-${stableShortProspectId(PROSPECT_A)}@getoblic.com`,
    );
    assert.equal(
      collisionLocalPartFallback("joesplumbing", PROSPECT_A),
      `joesplumbing-${PROSPECT_A.slice(0, 8)}`,
    );
    assert.deepEqual(
      buildProvisionalClientAccountEmailCandidates({
        businessName: "Joe's Plumbing",
        prospectId: PROSPECT_A,
      }),
      candidates,
    );
  });
});

describe("promoteLicenseeProspectToClient", () => {
  it("converts an Own Company Prospect without moving it or using prospect.email", async () => {
    const fixture = ownCompanyFixture();
    const before = cloneProspect(fixture.prospects[0]);
    const calls = installFixture(fixture);

    const result = await promoteLicenseeProspectToClient(promoteInput());

    assert.equal(result.alreadyActive, false);
    assert.equal(result.reattached, false);
    assert.equal(result.clientAccountEmail, "joesplumbing@getoblic.com");
    assert.equal(result.conversion.status, "active");
    assert.equal(result.conversion.prospectId, PROSPECT_A);
    assert.equal(result.conversion.sourceOrganizationId, OWN_COMPANY_ORG_ID);
    assert.equal(result.conversion.licenseeAccountId, LICENSEE_ACCOUNT_ID);
    assert.equal(result.conversion.clientOrganizationId, result.clientOrganizationId);
    assert.ok(result.conversion.licenseeSubAccountId);
    assert.equal(result.conversion.convertedByUserId, TENANT_OWNER_USER_ID);
    assert.notEqual(TENANT_OWNER_USER_ID, MASTER_USER_ID);
    assert.equal(fixture.licenseeByUserId[TENANT_OWNER_USER_ID], undefined);
    assert.equal(result.conversion.restoredAt, null);

    const clientOrg = fixture.organizations[result.clientOrganizationId];
    assert.equal(clientOrg?.name, "Joe's Plumbing");
    assert.ok(
      fixture.relationships.some(
        (row) =>
          row.licensee_account_id === LICENSEE_ACCOUNT_ID &&
          row.organization_id === result.clientOrganizationId,
      ),
    );
    assert.ok(fixture.authUsersByEmail["joesplumbing@getoblic.com"]);
    assert.equal(
      fixture.authUsersByEmail["contact@joesplumbing.com"],
      undefined,
    );

    assert.deepEqual(fixture.prospects[0], before);
    assert.equal(fixture.prospects[0].organization_id, OWN_COMPANY_ORG_ID);
    assert.equal(fixture.prospects[0].lifecycle_status, "Qualified");
    assert.equal(fixture.prospects[0].email, "contact@joesplumbing.com");

    assert.equal(
      calls.updates.filter((row) => row.table === "prospects").length,
      0,
    );
    assert.equal(
      calls.inserts.filter((row) =>
        [
          "athena_identity",
          "discussions",
          "athena_executive_intelligence_versions",
          "athena_getoblic_listing_links",
          "athena_getoblic_listing_allocation_events",
          "athena_getoblic_directory_settings",
        ].includes(row.table),
      ).length,
      0,
    );
    assert.ok(
      !calls.tables.includes("athena_getoblic_listing_links"),
    );
    assert.ok(
      !calls.tables.includes("athena_getoblic_listing_allocation_events"),
    );
  });

  it("is idempotent when an active conversion already exists", async () => {
    const fixture = ownCompanyFixture();
    const calls = installFixture(fixture);

    const first = await promoteLicenseeProspectToClient(promoteInput());
    const authCreates = Object.keys(fixture.authUsersByEmail).length;
    const orgCreates = calls.inserts.filter((row) => row.table === "organizations").length;

    const second = await promoteLicenseeProspectToClient(promoteInput());

    assert.equal(second.alreadyActive, true);
    assert.equal(second.clientOrganizationId, first.clientOrganizationId);
    assert.equal(second.clientAccountEmail, first.clientAccountEmail);
    assert.equal(fixture.conversions.length, 1);
    assert.equal(Object.keys(fixture.authUsersByEmail).length, authCreates);
    assert.equal(
      calls.inserts.filter((row) => row.table === "organizations").length,
      orgCreates,
    );
  });

  it("rejects a plain non-Licensee tenant, managed sibling, ambiguous relationship, and inactive Master", async () => {
    const plain = ownCompanyFixture({
      relationships: [],
      licenseeByUserId: {
        [MASTER_USER_ID]: {
          id: LICENSEE_ACCOUNT_ID,
          user_id: MASTER_USER_ID,
          email: MASTER_EMAIL,
          own_company_organization_id: OWN_COMPANY_ORG_ID,
        },
      },
      prospects: [
        makeProspect({
          id: PROSPECT_A,
          organization_id: PLAIN_ORG,
          business_name: "Joe's Plumbing",
        }),
      ],
    });
    installFixture(plain);
    await assert.rejects(
      () =>
        promoteLicenseeProspectToClient({
          prospectId: PROSPECT_A,
          sourceOrganizationId: PLAIN_ORG,
          actingUserId: TENANT_OWNER_USER_ID,
        }),
      (error: unknown) =>
        error instanceof LicenseeProspectClientConversionError &&
        error.code === "SOURCE_NOT_OWN_COMPANY",
    );
    restoreMocks();

    const managed = ownCompanyFixture({
      organizations: {
        [OWN_COMPANY_ORG_ID]: {
          id: OWN_COMPANY_ORG_ID,
          name: "Own",
          slug: "own",
        },
        [MANAGED_CLIENT_ORG]: {
          id: MANAGED_CLIENT_ORG,
          name: "Managed Client",
          slug: "managed",
        },
      },
      relationships: [
        {
          id: OWN_COMPANY_REL_ID,
          licensee_account_id: LICENSEE_ACCOUNT_ID,
          organization_id: OWN_COMPANY_ORG_ID,
        },
        {
          id: MANAGED_REL_ID,
          licensee_account_id: LICENSEE_ACCOUNT_ID,
          organization_id: MANAGED_CLIENT_ORG,
        },
      ],
      prospects: [
        makeProspect({
          id: PROSPECT_A,
          organization_id: MANAGED_CLIENT_ORG,
          business_name: "Joe's Plumbing",
        }),
      ],
    });
    installFixture(managed);
    await assert.rejects(
      () =>
        promoteLicenseeProspectToClient({
          prospectId: PROSPECT_A,
          sourceOrganizationId: MANAGED_CLIENT_ORG,
          actingUserId: TENANT_OWNER_USER_ID,
        }),
      (error: unknown) =>
        error instanceof LicenseeProspectClientConversionError &&
        error.code === "SOURCE_NOT_OWN_COMPANY",
    );
    restoreMocks();

    const ambiguous = ownCompanyFixture({
      relationships: [
        {
          id: OWN_COMPANY_REL_ID,
          licensee_account_id: LICENSEE_ACCOUNT_ID,
          organization_id: OWN_COMPANY_ORG_ID,
        },
        {
          id: "rel-ambiguous-b",
          licensee_account_id: LICENSEE_B_ID,
          organization_id: OWN_COMPANY_ORG_ID,
        },
      ],
    });
    installFixture(ambiguous);
    await assert.rejects(
      () =>
        promoteLicenseeProspectToClient(promoteInput()),
      (error: unknown) =>
        error instanceof LicenseeProspectClientConversionError &&
        error.code === "AMBIGUOUS_LICENSEE_RELATIONSHIP",
    );
    restoreMocks();

    const inactive = ownCompanyFixture({
      accessStatusByUserId: {
        [MASTER_USER_ID]: "deactivated",
      },
    });
    installFixture(inactive);
    await assert.rejects(
      () =>
        promoteLicenseeProspectToClient(promoteInput()),
      (error: unknown) => error instanceof LicenseeAccessError,
    );
  });

  it("rejects a missing Prospect in the supplied source organization", async () => {
    const fixture = ownCompanyFixture();
    installFixture(fixture);
    await assert.rejects(
      () =>
        promoteLicenseeProspectToClient(promoteInput(PROSPECT_B)),
      (error: unknown) =>
        error instanceof LicenseeProspectClientConversionError &&
        error.code === "PROSPECT_NOT_FOUND",
    );
  });

  it("continues first conversion with the same email after auth user creation and no membership", async () => {
    const fixture = ownCompanyFixture({
      authUsersByEmail: {
        "joesplumbing@getoblic.com": {
          id: "orphaned-auth-user",
          email: "joesplumbing@getoblic.com",
        },
      },
    });
    installFixture(fixture);

    const result = await promoteLicenseeProspectToClient(promoteInput());

    assert.equal(result.clientAccountEmail, "joesplumbing@getoblic.com");
    assert.equal(
      fixture.authUsersByEmail["joesplumbing@getoblic.com"]?.id,
      "orphaned-auth-user",
    );
    assert.ok(fixture.organizations[result.clientOrganizationId]);
    assert.ok(
      fixture.memberships.some(
        (row) =>
          row.user_id === "orphaned-auth-user" &&
          row.organization_id === result.clientOrganizationId,
      ),
    );
  });

  it("uses a prospect-id identity when the business name normalizes to empty", async () => {
    const fixture = ownCompanyFixture({
      prospects: [
        makeProspect({
          id: PROSPECT_A,
          business_name: "!",
        }),
      ],
    });
    installFixture(fixture);

    const result = await promoteLicenseeProspectToClient(promoteInput());

    assert.equal(
      result.clientAccountEmail,
      `prospect${PROSPECT_A.slice(0, 8)}@getoblic.com`,
    );
    assert.equal(
      fixture.organizations[result.clientOrganizationId]?.name,
      `Prospect ${PROSPECT_A.slice(0, 8)}`,
    );
  });

  it("falls back when the primary identity is rejected as the Master email", async () => {
    const fixture = ownCompanyFixture({
      licenseeByUserId: {
        [MASTER_USER_ID]: {
          id: LICENSEE_ACCOUNT_ID,
          user_id: MASTER_USER_ID,
          email: "joesplumbing@getoblic.com",
          own_company_organization_id: OWN_COMPANY_ORG_ID,
        },
      },
    });
    installFixture(fixture);

    const result = await promoteLicenseeProspectToClient(promoteInput());

    assert.equal(
      result.clientAccountEmail,
      `joesplumbing-${PROSPECT_A.slice(0, 8)}@getoblic.com`,
    );
    assert.equal(result.conversion.status, "active");
  });
});

describe("provisional email collision safety", () => {
  it("uses the simple normalized address when unused", async () => {
    const fixture = ownCompanyFixture();
    installFixture(fixture);
    const result = await promoteLicenseeProspectToClient(promoteInput());
    assert.equal(result.clientAccountEmail, "joesplumbing@getoblic.com");
  });

  it("does not attach an unrelated tenant that already owns the normalized email", async () => {
    const fixture = ownCompanyFixture({
      organizations: {
        [OWN_COMPANY_ORG_ID]: {
          id: OWN_COMPANY_ORG_ID,
          name: "Own",
          slug: "own",
        },
        [UNRELATED_ORG]: {
          id: UNRELATED_ORG,
          name: "Unrelated Joe",
          slug: "unrelated-joe",
        },
      },
      memberships: [
        {
          user_id: UNRELATED_USER,
          organization_id: UNRELATED_ORG,
          role: "owner",
        },
      ],
      authUsersByEmail: {
        "joesplumbing@getoblic.com": {
          id: UNRELATED_USER,
          email: "joesplumbing@getoblic.com",
        },
      },
    });
    const calls = installFixture(fixture);

    const result = await promoteLicenseeProspectToClient(promoteInput());

    assert.equal(
      result.clientAccountEmail,
      `joesplumbing-${PROSPECT_A.slice(0, 8)}@getoblic.com`,
    );
    assert.notEqual(result.clientOrganizationId, UNRELATED_ORG);
    assert.equal(
      fixture.relationships.some(
        (row) => row.organization_id === UNRELATED_ORG,
      ),
      false,
    );
    assert.equal(
      calls.inserts.filter(
        (row) =>
          row.table === "licensee_sub_accounts" &&
          row.values.organization_id === UNRELATED_ORG,
      ).length,
      0,
    );
  });

  it("selects the same deterministic fallback on retry", async () => {
    const unrelated = {
      organizations: {
        [OWN_COMPANY_ORG_ID]: {
          id: OWN_COMPANY_ORG_ID,
          name: "Own",
          slug: "own",
        },
        [UNRELATED_ORG]: {
          id: UNRELATED_ORG,
          name: "Unrelated Joe",
          slug: "unrelated-joe",
        },
      },
      memberships: [
        {
          user_id: UNRELATED_USER,
          organization_id: UNRELATED_ORG,
          role: "owner",
        },
      ],
      authUsersByEmail: {
        "joesplumbing@getoblic.com": {
          id: UNRELATED_USER,
          email: "joesplumbing@getoblic.com",
        },
      },
    };

    const firstFixture = ownCompanyFixture(unrelated);
    installFixture(firstFixture);
    const first = await promoteLicenseeProspectToClient(promoteInput());
    restoreMocks();

    const secondFixture = ownCompanyFixture({
      ...unrelated,
      conversions: firstFixture.conversions.map((row) => ({ ...row })),
      organizations: {
        ...unrelated.organizations,
        [first.clientOrganizationId]:
          firstFixture.organizations[first.clientOrganizationId],
      },
      memberships: [
        ...unrelated.memberships,
        ...firstFixture.memberships.filter(
          (row) => row.organization_id === first.clientOrganizationId,
        ),
      ],
      authUsersByEmail: { ...firstFixture.authUsersByEmail },
      relationships: firstFixture.relationships.map((row) => ({ ...row })),
    });
    installFixture(secondFixture);
    const second = await promoteLicenseeProspectToClient(promoteInput());

    assert.equal(first.clientAccountEmail, second.clientAccountEmail);
    assert.equal(
      second.clientAccountEmail,
      `joesplumbing-${PROSPECT_A.slice(0, 8)}@getoblic.com`,
    );
    assert.equal(second.alreadyActive, true);
  });

  it("does not share a client tenant across two same-name Prospects", async () => {
    const fixture = ownCompanyFixture({
      prospects: [
        makeProspect({ id: PROSPECT_A, business_name: "Joe's Plumbing" }),
        makeProspect({ id: PROSPECT_B, business_name: "Joe's Plumbing" }),
      ],
    });
    installFixture(fixture);

    const first = await promoteLicenseeProspectToClient(promoteInput());
    const second = await promoteLicenseeProspectToClient(promoteInput(PROSPECT_B));

    assert.equal(first.clientAccountEmail, "joesplumbing@getoblic.com");
    assert.equal(
      second.clientAccountEmail,
      `joesplumbing-${PROSPECT_B.slice(0, 8)}@getoblic.com`,
    );
    assert.notEqual(first.clientOrganizationId, second.clientOrganizationId);
    assert.equal(fixture.conversions.length, 2);
  });
});

describe("reverseLicenseeProspectClientConversion", () => {
  it("detaches only the Licensee relationship and retains the client identity", async () => {
    const fixture = ownCompanyFixture();
    const beforeProspect = cloneProspect(fixture.prospects[0]);
    const calls = installFixture(fixture);

    const promoted = await promoteLicenseeProspectToClient(promoteInput());
    const clientOrgId = promoted.clientOrganizationId;
    const authEmail = promoted.clientAccountEmail;
    const owner = fixture.memberships.find(
      (row) => row.organization_id === clientOrgId,
    );

    const reversed = await reverseLicenseeProspectClientConversion({
      prospectId: PROSPECT_A,
      sourceOrganizationId: OWN_COMPANY_ORG_ID,
      masterUserId: MASTER_USER_ID,
    });

    assert.equal(reversed.alreadyReversed, false);
    assert.equal(reversed.conversion.status, "reversed");
    assert.equal(reversed.conversion.licenseeSubAccountId, null);
    assert.equal(reversed.conversion.clientOrganizationId, clientOrgId);
    assert.equal(reversed.conversion.clientAccountEmail, authEmail);
    assert.equal(reversed.conversion.restoredByUserId, MASTER_USER_ID);
    assert.ok(reversed.conversion.restoredAt);

    assert.ok(fixture.organizations[clientOrgId]);
    assert.ok(fixture.authUsersByEmail[authEmail]);
    assert.ok(
      fixture.memberships.some(
        (row) =>
          row.organization_id === clientOrgId &&
          row.user_id === owner?.user_id &&
          row.role === "owner",
      ),
    );
    assert.equal(
      fixture.relationships.some(
        (row) => row.organization_id === clientOrgId,
      ),
      false,
    );
    assert.deepEqual(fixture.prospects[0], beforeProspect);
    assert.ok(
      calls.deletes.some((row) => row.table === "licensee_sub_accounts"),
    );
    assert.equal(
      calls.deletes.filter((row) => row.table === "organizations").length,
      0,
    );
  });

  it("is idempotent when reversing twice", async () => {
    const fixture = ownCompanyFixture();
    installFixture(fixture);
    await promoteLicenseeProspectToClient(promoteInput());
    const first = await reverseLicenseeProspectClientConversion({
      prospectId: PROSPECT_A,
      sourceOrganizationId: OWN_COMPANY_ORG_ID,
      masterUserId: MASTER_USER_ID,
    });
    const second = await reverseLicenseeProspectClientConversion({
      prospectId: PROSPECT_A,
      sourceOrganizationId: OWN_COMPANY_ORG_ID,
      masterUserId: MASTER_USER_ID,
    });

    assert.equal(first.conversion.status, "reversed");
    assert.equal(second.alreadyReversed, true);
    assert.equal(second.conversion.status, "reversed");
    assert.equal(second.clientOrganizationId, first.clientOrganizationId);
    assert.equal(second.clientAccountEmail, first.clientAccountEmail);
    assert.equal(fixture.conversions.length, 1);
  });

  it("rejects reverse from the wrong Licensee and refuses Own Company detach", async () => {
    const fixture = ownCompanyFixture({
      licenseeByUserId: {
        [MASTER_USER_ID]: {
          id: LICENSEE_ACCOUNT_ID,
          user_id: MASTER_USER_ID,
          email: MASTER_EMAIL,
          own_company_organization_id: OWN_COMPANY_ORG_ID,
        },
        [MASTER_B_USER_ID]: {
          id: LICENSEE_B_ID,
          user_id: MASTER_B_USER_ID,
          email: "master-b@example.com",
          own_company_organization_id: MANAGED_CLIENT_ORG,
        },
      },
      organizations: {
        [OWN_COMPANY_ORG_ID]: {
          id: OWN_COMPANY_ORG_ID,
          name: "Own A",
          slug: "own-a",
        },
        [MANAGED_CLIENT_ORG]: {
          id: MANAGED_CLIENT_ORG,
          name: "Own B",
          slug: "own-b",
        },
      },
      relationships: [
        {
          id: OWN_COMPANY_REL_ID,
          licensee_account_id: LICENSEE_ACCOUNT_ID,
          organization_id: OWN_COMPANY_ORG_ID,
        },
        {
          id: MANAGED_REL_ID,
          licensee_account_id: LICENSEE_B_ID,
          organization_id: MANAGED_CLIENT_ORG,
        },
      ],
      accessStatusByUserId: {
        [MASTER_USER_ID]: "active",
        [MASTER_B_USER_ID]: "active",
      },
    });
    installFixture(fixture);
    await promoteLicenseeProspectToClient(promoteInput());

    await assert.rejects(
      () =>
        reverseLicenseeProspectClientConversion({
          prospectId: PROSPECT_A,
          sourceOrganizationId: OWN_COMPANY_ORG_ID,
          masterUserId: MASTER_B_USER_ID,
        }),
      (error: unknown) =>
        error instanceof LicenseeProspectClientConversionError &&
        error.code === "WRONG_LICENSEE",
    );

    fixture.conversions[0].client_organization_id = OWN_COMPANY_ORG_ID;
    await assert.rejects(
      () =>
        reverseLicenseeProspectClientConversion({
          prospectId: PROSPECT_A,
          sourceOrganizationId: OWN_COMPANY_ORG_ID,
          masterUserId: MASTER_USER_ID,
        }),
      (error: unknown) =>
        error instanceof LicenseeProspectClientConversionError &&
        error.code === "OWN_COMPANY_CANNOT_DETACH",
    );
  });
});

describe("re-conversion after reversal", () => {
  it("reattaches the same client organization and stored email", async () => {
    const fixture = ownCompanyFixture();
    const calls = installFixture(fixture);

    const first = await promoteLicenseeProspectToClient(promoteInput());
    const orgInsertsAfterFirst = calls.inserts.filter(
      (row) => row.table === "organizations",
    ).length;
    const authCountAfterFirst = Object.keys(fixture.authUsersByEmail).length;

    await reverseLicenseeProspectClientConversion({
      prospectId: PROSPECT_A,
      sourceOrganizationId: OWN_COMPANY_ORG_ID,
      masterUserId: MASTER_USER_ID,
    });

    const again = await promoteLicenseeProspectToClient(promoteInput());

    assert.equal(again.reattached, true);
    assert.equal(again.alreadyActive, false);
    assert.equal(again.conversion.status, "active");
    assert.equal(again.clientOrganizationId, first.clientOrganizationId);
    assert.equal(again.clientAccountEmail, first.clientAccountEmail);
    assert.equal(again.conversion.restoredAt, null);
    assert.equal(again.conversion.restoredByUserId, null);
    assert.ok(again.conversion.licenseeSubAccountId);
    assert.equal(fixture.conversions.length, 1);
    assert.equal(Object.keys(fixture.authUsersByEmail).length, authCountAfterFirst);
    assert.equal(
      calls.inserts.filter((row) => row.table === "organizations").length,
      orgInsertsAfterFirst,
    );
  });

  it("reuses the stored email rather than generating another one", async () => {
    const fixture = ownCompanyFixture();
    installFixture(fixture);
    const first = await promoteLicenseeProspectToClient(promoteInput());
    await reverseLicenseeProspectClientConversion({
      prospectId: PROSPECT_A,
      sourceOrganizationId: OWN_COMPANY_ORG_ID,
      masterUserId: MASTER_USER_ID,
    });

    fixture.prospects[0].business_name = "Completely Different Name";

    const again = await promoteLicenseeProspectToClient(promoteInput());

    assert.equal(again.clientAccountEmail, first.clientAccountEmail);
    assert.equal(again.clientAccountEmail, "joesplumbing@getoblic.com");
    assert.notEqual(again.clientAccountEmail, "completelydifferentname@getoblic.com");
  });
});

describe("provisioning intent creation", () => {
  it("writes the intent before provisioning and consumes it after durable conversion", async () => {
    const fixture = ownCompanyFixture();
    const calls = installFixture(fixture);

    const result = await promoteLicenseeProspectToClient(promoteInput());

    const intentInsert = calls.inserts.find(
      (row) => row.table === "licensee_prospect_client_provisioning_intents",
    );
    const orgInsertIndex = calls.inserts.findIndex(
      (row) => row.table === "organizations",
    );
    const intentInsertIndex = calls.inserts.findIndex(
      (row) => row.table === "licensee_prospect_client_provisioning_intents",
    );
    const conversionInsertIndex = calls.inserts.findIndex(
      (row) => row.table === "licensee_prospect_client_conversions",
    );
    const relationshipInsertIndex = calls.inserts.findIndex(
      (row) =>
        row.table === "licensee_sub_accounts" &&
        row.values.organization_id === result.clientOrganizationId,
    );

    assert.ok(intentInsert);
    assert.equal(intentInsert.values.prospect_id, PROSPECT_A);
    assert.equal(intentInsert.values.source_organization_id, OWN_COMPANY_ORG_ID);
    assert.equal(intentInsert.values.licensee_account_id, LICENSEE_ACCOUNT_ID);
    assert.equal(
      intentInsert.values.intended_client_account_email,
      "joesplumbing@getoblic.com",
    );
    assert.equal(intentInsert.values.created_by_user_id, TENANT_OWNER_USER_ID);
    assert.ok(intentInsertIndex >= 0 && orgInsertIndex >= 0);
    assert.ok(intentInsertIndex < orgInsertIndex);
    assert.ok(relationshipInsertIndex >= 0 && conversionInsertIndex >= 0);
    assert.ok(relationshipInsertIndex < conversionInsertIndex);
    assert.equal(result.clientAccountEmail, "joesplumbing@getoblic.com");
    assert.equal(fixture.intents.length, 0);
    assert.equal(fixture.conversions.length, 1);
    assert.ok(
      calls.deletes.some(
        (row) =>
          row.table === "licensee_prospect_client_provisioning_intents" &&
          row.filters.prospect_id === PROSPECT_A,
      ),
    );
  });
});

describe("partial-provision recovery", () => {
  it("recovers the already provisioned tenant after a non-unique conversion INSERT failure", async () => {
    const fixture = ownCompanyFixture({
      conversionInsertFailures: [
        { code: "40001", message: "could not serialize access" },
      ],
    });
    const calls = installFixture(fixture);

    await assert.rejects(
      () => promoteLicenseeProspectToClient(promoteInput()),
      (error: unknown) =>
        error instanceof LicenseeProspectClientConversionError &&
        error.code === "CONVERSION_WRITE_FAILED",
    );

    assert.equal(fixture.intents.length, 1);
    assert.equal(
      fixture.intents[0].intended_client_account_email,
      "joesplumbing@getoblic.com",
    );
    assert.equal(fixture.intents[0].prospect_id, PROSPECT_A);
    assert.equal(fixture.conversions.length, 0);
    const clientRelationships = fixture.relationships.filter(
      (row) => row.organization_id !== OWN_COMPANY_ORG_ID,
    );
    assert.equal(clientRelationships.length, 1);
    const partialOrgId = clientRelationships[0].organization_id;
    assert.ok(fixture.organizations[partialOrgId]);
    assert.ok(fixture.authUsersByEmail["joesplumbing@getoblic.com"]);
    const orgCountAfterFailure = Object.keys(fixture.organizations).length;

    const retry = await promoteLicenseeProspectToClient(promoteInput());

    assert.equal(retry.clientAccountEmail, "joesplumbing@getoblic.com");
    assert.equal(retry.clientOrganizationId, partialOrgId);
    assert.equal(retry.conversion.status, "active");
    assert.equal(Object.keys(fixture.organizations).length, orgCountAfterFailure);
    assert.equal(
      fixture.relationships.filter(
        (row) => row.organization_id !== OWN_COMPANY_ORG_ID,
      ).length,
      1,
    );
    assert.equal(
      fixture.authUsersByEmail["joesplumbing@getoblic.com"]?.id,
      `created-user-joesplumbing@getoblic.com`,
    );
    assert.equal(
      Object.keys(fixture.authUsersByEmail).some((email) =>
        email.startsWith("joesplumbing-"),
      ),
      false,
    );
    assert.equal(fixture.conversions.length, 1);
    assert.equal(fixture.intents.length, 0);
    assert.equal(
      calls.inserts.filter((row) => row.table === "organizations").length,
      1,
    );
  });

  it("continues provisioning with the reserved email when only the auth user exists", async () => {
    const fixture = ownCompanyFixture({
      intents: [makeIntent({ prospect_id: PROSPECT_A })],
      authUsersByEmail: {
        "joesplumbing@getoblic.com": {
          id: "orphaned-auth-user",
          email: "joesplumbing@getoblic.com",
        },
      },
    });
    const calls = installFixture(fixture);

    const result = await promoteLicenseeProspectToClient(promoteInput());

    assert.equal(result.clientAccountEmail, "joesplumbing@getoblic.com");
    assert.equal(
      fixture.authUsersByEmail["joesplumbing@getoblic.com"]?.id,
      "orphaned-auth-user",
    );
    assert.ok(fixture.organizations[result.clientOrganizationId]);
    assert.ok(
      fixture.memberships.some(
        (row) =>
          row.user_id === "orphaned-auth-user" &&
          row.organization_id === result.clientOrganizationId,
      ),
    );
    assert.equal(
      calls.inserts.filter(
        (row) =>
          row.table === "licensee_prospect_client_provisioning_intents",
      ).length,
      0,
    );
    assert.equal(
      Object.keys(fixture.authUsersByEmail).some((email) =>
        email.startsWith("joesplumbing-"),
      ),
      false,
    );
    assert.equal(fixture.intents.length, 0);
  });
});

describe("unrelated same-Licensee collision", () => {
  it("does not recover a manually created same-Licensee tenant that owns the primary email", async () => {
    const fixture = ownCompanyFixture({
      organizations: {
        [OWN_COMPANY_ORG_ID]: {
          id: OWN_COMPANY_ORG_ID,
          name: "Own",
          slug: "own",
        },
        [UNRELATED_ORG]: {
          id: UNRELATED_ORG,
          name: "Manual Joe",
          slug: "manual-joe",
        },
      },
      memberships: [
        {
          user_id: UNRELATED_USER,
          organization_id: UNRELATED_ORG,
          role: "owner",
        },
      ],
      authUsersByEmail: {
        "joesplumbing@getoblic.com": {
          id: UNRELATED_USER,
          email: "joesplumbing@getoblic.com",
        },
      },
      relationships: [
        {
          id: OWN_COMPANY_REL_ID,
          licensee_account_id: LICENSEE_ACCOUNT_ID,
          organization_id: OWN_COMPANY_ORG_ID,
        },
        {
          id: MANAGED_REL_ID,
          licensee_account_id: LICENSEE_ACCOUNT_ID,
          organization_id: UNRELATED_ORG,
        },
      ],
    });
    const calls = installFixture(fixture);

    const result = await promoteLicenseeProspectToClient(promoteInput());

    assert.equal(
      result.clientAccountEmail,
      `joesplumbing-${PROSPECT_A.slice(0, 8)}@getoblic.com`,
    );
    assert.notEqual(result.clientOrganizationId, UNRELATED_ORG);
    assert.ok(fixture.organizations[UNRELATED_ORG]);
    assert.ok(
      fixture.relationships.some(
        (row) =>
          row.id === MANAGED_REL_ID &&
          row.organization_id === UNRELATED_ORG &&
          row.licensee_account_id === LICENSEE_ACCOUNT_ID,
      ),
    );
    assert.equal(
      fixture.conversions.some(
        (row) => row.client_organization_id === UNRELATED_ORG,
      ),
      false,
    );
    assert.equal(
      calls.inserts.filter(
        (row) =>
          row.table === "licensee_sub_accounts" &&
          row.values.organization_id === UNRELATED_ORG,
      ).length,
      0,
    );
    assert.ok(fixture.organizations[result.clientOrganizationId]);
  });
});

describe("irreconcilable intended identity", () => {
  it("never recovers or attaches a candidate tenant that belongs to another Licensee", async () => {
    const fixture = ownCompanyFixture({
      intents: [makeIntent({ prospect_id: PROSPECT_A })],
      organizations: {
        [OWN_COMPANY_ORG_ID]: {
          id: OWN_COMPANY_ORG_ID,
          name: "Own A",
          slug: "own-a",
        },
        [OTHER_LICENSEE_ORG]: {
          id: OTHER_LICENSEE_ORG,
          name: "Other Licensee Joe",
          slug: "other-joe",
        },
      },
      memberships: [
        {
          user_id: PARTIAL_CLIENT_USER,
          organization_id: OTHER_LICENSEE_ORG,
          role: "owner",
        },
      ],
      authUsersByEmail: {
        "joesplumbing@getoblic.com": {
          id: PARTIAL_CLIENT_USER,
          email: "joesplumbing@getoblic.com",
        },
      },
      licenseeByUserId: {
        [MASTER_USER_ID]: {
          id: LICENSEE_ACCOUNT_ID,
          user_id: MASTER_USER_ID,
          email: MASTER_EMAIL,
          own_company_organization_id: OWN_COMPANY_ORG_ID,
        },
        [MASTER_B_USER_ID]: {
          id: LICENSEE_B_ID,
          user_id: MASTER_B_USER_ID,
          email: "master-b@example.com",
          own_company_organization_id: MANAGED_CLIENT_ORG,
        },
      },
      relationships: [
        {
          id: OWN_COMPANY_REL_ID,
          licensee_account_id: LICENSEE_ACCOUNT_ID,
          organization_id: OWN_COMPANY_ORG_ID,
        },
        {
          id: OTHER_LICENSEE_REL,
          licensee_account_id: LICENSEE_B_ID,
          organization_id: OTHER_LICENSEE_ORG,
        },
      ],
    });
    const calls = installFixture(fixture);

    await assert.rejects(
      () => promoteLicenseeProspectToClient(promoteInput()),
      (error: unknown) =>
        error instanceof LicenseeProspectClientConversionError &&
        error.code === "OTHER_LICENSEE",
    );

    assert.equal(fixture.conversions.length, 0);
    assert.equal(fixture.intents.length, 1);
    assert.equal(
      fixture.relationships.some(
        (row) =>
          row.organization_id === OTHER_LICENSEE_ORG &&
          row.licensee_account_id === LICENSEE_ACCOUNT_ID,
      ),
      false,
    );
    assert.equal(
      calls.inserts.filter((row) => row.table === "organizations").length,
      0,
    );
    assert.equal(
      calls.inserts.filter(
        (row) =>
          row.table === "licensee_sub_accounts" &&
          row.values.organization_id === OTHER_LICENSEE_ORG,
      ).length,
      0,
    );
  });

  it("fails closed when the intended-email org is already mapped to another Prospect", async () => {
    const fixture = ownCompanyFixture({
      intents: [makeIntent({ prospect_id: PROSPECT_A })],
      organizations: {
        [OWN_COMPANY_ORG_ID]: {
          id: OWN_COMPANY_ORG_ID,
          name: "Own",
          slug: "own",
        },
        [PARTIAL_CLIENT_ORG]: {
          id: PARTIAL_CLIENT_ORG,
          name: "Already Converted",
          slug: "already-converted",
        },
      },
      memberships: [
        {
          user_id: PARTIAL_CLIENT_USER,
          organization_id: PARTIAL_CLIENT_ORG,
          role: "owner",
        },
      ],
      authUsersByEmail: {
        "joesplumbing@getoblic.com": {
          id: PARTIAL_CLIENT_USER,
          email: "joesplumbing@getoblic.com",
        },
      },
      relationships: [
        {
          id: OWN_COMPANY_REL_ID,
          licensee_account_id: LICENSEE_ACCOUNT_ID,
          organization_id: OWN_COMPANY_ORG_ID,
        },
        {
          id: PARTIAL_CLIENT_REL,
          licensee_account_id: LICENSEE_ACCOUNT_ID,
          organization_id: PARTIAL_CLIENT_ORG,
        },
      ],
      conversions: [
        {
          id: "conversion-other",
          prospect_id: PROSPECT_B,
          source_organization_id: OWN_COMPANY_ORG_ID,
          client_organization_id: PARTIAL_CLIENT_ORG,
          licensee_account_id: LICENSEE_ACCOUNT_ID,
          licensee_sub_account_id: PARTIAL_CLIENT_REL,
          status: "active",
          client_account_email: "otherprospect@getoblic.com",
          converted_at: NOW,
          converted_by_user_id: MASTER_USER_ID,
          restored_at: null,
          restored_by_user_id: null,
          created_at: NOW,
          updated_at: NOW,
        },
      ],
      prospects: [
        makeProspect({ id: PROSPECT_A, business_name: "Joe's Plumbing" }),
        makeProspect({ id: PROSPECT_B, business_name: "Other Prospect" }),
      ],
    });
    installFixture(fixture);

    await assert.rejects(
      () => promoteLicenseeProspectToClient(promoteInput()),
      (error: unknown) =>
        error instanceof LicenseeProspectClientConversionError &&
        error.code === "CONFLICTING_CONVERSION",
    );
    assert.equal(fixture.conversions.length, 1);
    assert.equal(fixture.conversions[0].prospect_id, PROSPECT_B);
    assert.equal(fixture.intents[0].prospect_id, PROSPECT_A);
  });

  it("fails closed when the intended-email org is related to multiple Licensees", async () => {
    const fixture = ownCompanyFixture({
      intents: [makeIntent({ prospect_id: PROSPECT_A })],
      organizations: {
        [OWN_COMPANY_ORG_ID]: {
          id: OWN_COMPANY_ORG_ID,
          name: "Own",
          slug: "own",
        },
        [PARTIAL_CLIENT_ORG]: {
          id: PARTIAL_CLIENT_ORG,
          name: "Ambiguous Joe",
          slug: "ambiguous-joe",
        },
      },
      memberships: [
        {
          user_id: PARTIAL_CLIENT_USER,
          organization_id: PARTIAL_CLIENT_ORG,
          role: "owner",
        },
      ],
      authUsersByEmail: {
        "joesplumbing@getoblic.com": {
          id: PARTIAL_CLIENT_USER,
          email: "joesplumbing@getoblic.com",
        },
      },
      licenseeByUserId: {
        [MASTER_USER_ID]: {
          id: LICENSEE_ACCOUNT_ID,
          user_id: MASTER_USER_ID,
          email: MASTER_EMAIL,
          own_company_organization_id: OWN_COMPANY_ORG_ID,
        },
        [MASTER_B_USER_ID]: {
          id: LICENSEE_B_ID,
          user_id: MASTER_B_USER_ID,
          email: "master-b@example.com",
          own_company_organization_id: MANAGED_CLIENT_ORG,
        },
      },
      relationships: [
        {
          id: OWN_COMPANY_REL_ID,
          licensee_account_id: LICENSEE_ACCOUNT_ID,
          organization_id: OWN_COMPANY_ORG_ID,
        },
        {
          id: PARTIAL_CLIENT_REL,
          licensee_account_id: LICENSEE_ACCOUNT_ID,
          organization_id: PARTIAL_CLIENT_ORG,
        },
        {
          id: OTHER_LICENSEE_REL,
          licensee_account_id: LICENSEE_B_ID,
          organization_id: PARTIAL_CLIENT_ORG,
        },
      ],
    });
    installFixture(fixture);

    await assert.rejects(
      () => promoteLicenseeProspectToClient(promoteInput()),
      (error: unknown) =>
        error instanceof LicenseeProspectClientConversionError &&
        error.code === "AMBIGUOUS_LICENSEE_RELATIONSHIP",
    );
    assert.equal(fixture.conversions.length, 0);
    assert.equal(fixture.intents.length, 1);
  });
});

describe("intent reservation collisions", () => {
  it("selects the deterministic fallback when another Prospect intent reserved the primary email", async () => {
    const fixture = ownCompanyFixture({
      intents: [
        makeIntent({
          prospect_id: PROSPECT_B,
          intended_client_account_email: "joesplumbing@getoblic.com",
        }),
      ],
      prospects: [
        makeProspect({ id: PROSPECT_A, business_name: "Joe's Plumbing" }),
        makeProspect({ id: PROSPECT_B, business_name: "Joe's Plumbing" }),
      ],
    });
    installFixture(fixture);

    const result = await promoteLicenseeProspectToClient(promoteInput());

    assert.equal(
      result.clientAccountEmail,
      `joesplumbing-${PROSPECT_A.slice(0, 8)}@getoblic.com`,
    );
    assert.equal(result.conversion.prospectId, PROSPECT_A);
    assert.equal(fixture.intents.length, 1);
    assert.equal(fixture.intents[0].prospect_id, PROSPECT_B);
    assert.equal(
      fixture.intents[0].intended_client_account_email,
      "joesplumbing@getoblic.com",
    );
    assert.equal(
      fixture.conversions[0].client_account_email,
      `joesplumbing-${PROSPECT_A.slice(0, 8)}@getoblic.com`,
    );
  });

  it("fails closed when the same Prospect intent is bound to a different Licensee or source org", async () => {
    const otherLicensee = ownCompanyFixture({
      intents: [
        makeIntent({
          prospect_id: PROSPECT_A,
          licensee_account_id: LICENSEE_B_ID,
        }),
      ],
    });
    installFixture(otherLicensee);
    await assert.rejects(
      () => promoteLicenseeProspectToClient(promoteInput()),
      (error: unknown) =>
        error instanceof LicenseeProspectClientConversionError &&
        error.code === "CONFLICTING_PROVISIONING_INTENT",
    );
    assert.equal(otherLicensee.conversions.length, 0);
    restoreMocks();

    const otherSource = ownCompanyFixture({
      intents: [
        makeIntent({
          prospect_id: PROSPECT_A,
          source_organization_id: PLAIN_ORG,
        }),
      ],
    });
    installFixture(otherSource);
    await assert.rejects(
      () => promoteLicenseeProspectToClient(promoteInput()),
      (error: unknown) =>
        error instanceof LicenseeProspectClientConversionError &&
        error.code === "CONFLICTING_PROVISIONING_INTENT",
    );
    assert.equal(otherSource.conversions.length, 0);
  });
});

describe("stale intent after successful conversion", () => {
  it("returns the existing conversion, does not provision, and safely cleans a matching stale intent", async () => {
    const fixture = ownCompanyFixture();
    const calls = installFixture(fixture);
    const first = await promoteLicenseeProspectToClient(promoteInput());
    const orgInsertsAfterFirst = calls.inserts.filter(
      (row) => row.table === "organizations",
    ).length;
    const authCountAfterFirst = Object.keys(fixture.authUsersByEmail).length;

    fixture.intents.push(
      makeIntent({
        prospect_id: PROSPECT_A,
        intended_client_account_email: first.clientAccountEmail,
      }),
    );
    assert.equal(fixture.intents.length, 1);

    const second = await promoteLicenseeProspectToClient(promoteInput());

    assert.equal(second.alreadyActive, true);
    assert.equal(second.clientOrganizationId, first.clientOrganizationId);
    assert.equal(second.clientAccountEmail, first.clientAccountEmail);
    assert.equal(fixture.conversions.length, 1);
    assert.equal(fixture.intents.length, 0);
    assert.equal(Object.keys(fixture.authUsersByEmail).length, authCountAfterFirst);
    assert.equal(
      calls.inserts.filter((row) => row.table === "organizations").length,
      orgInsertsAfterFirst,
    );
  });

  it("does not fail a successful conversion when post-success intent cleanup fails", async () => {
    const fixture = ownCompanyFixture({
      intentDeleteFailures: [{ message: "intent delete failed" }],
    });
    const calls = installFixture(fixture);

    const result = await promoteLicenseeProspectToClient(promoteInput());

    assert.equal(result.conversion.status, "active");
    assert.equal(result.clientAccountEmail, "joesplumbing@getoblic.com");
    assert.equal(fixture.conversions.length, 1);
    assert.equal(fixture.intents.length, 1);
    assert.equal(
      fixture.intents[0].intended_client_account_email,
      result.clientAccountEmail,
    );
    assert.ok(
      calls.deletes.some(
        (row) => row.table === "licensee_prospect_client_provisioning_intents",
      ),
    );
  });
});

describe("reversed conversion ignores first-provision intent", () => {
  it("reuses the stored client org and email without writing a new first-provision intent", async () => {
    const fixture = ownCompanyFixture();
    const calls = installFixture(fixture);

    const first = await promoteLicenseeProspectToClient(promoteInput());
    const intentInsertsAfterFirst = calls.inserts.filter(
      (row) => row.table === "licensee_prospect_client_provisioning_intents",
    ).length;
    const orgInsertsAfterFirst = calls.inserts.filter(
      (row) => row.table === "organizations",
    ).length;

    await reverseLicenseeProspectClientConversion(reverseInput());

    const again = await promoteLicenseeProspectToClient(promoteInput());

    assert.equal(again.reattached, true);
    assert.equal(again.clientOrganizationId, first.clientOrganizationId);
    assert.equal(again.clientAccountEmail, first.clientAccountEmail);
    assert.equal(fixture.conversions.length, 1);
    assert.equal(fixture.intents.length, 0);
    assert.equal(
      calls.inserts.filter(
        (row) => row.table === "licensee_prospect_client_provisioning_intents",
      ).length,
      intentInsertsAfterFirst,
    );
    assert.equal(
      calls.inserts.filter((row) => row.table === "organizations").length,
      orgInsertsAfterFirst,
    );
  });
});

describe("GetOblic ownership conversion guard", () => {
  it("allows conversion when a GetOblic Prospect has an active claim", async () => {
    const fixture = ownCompanyFixture({
      prospects: [
        makeProspect({
          id: PROSPECT_A,
          business_name: "Joe's Plumbing",
          source: "getoblic",
          raw_json: makeGetOblicProvenance(1000),
        }),
      ],
      getoblicLinks: [
        makeGetOblicLink({
          organization_id: OWN_COMPANY_ORG_ID,
          prospect_id: PROSPECT_A,
          wordpress_listing_id: 1000,
          relationship_status: "linked",
        }),
      ],
    });
    installFixture(fixture);

    const result = await promoteLicenseeProspectToClient(promoteInput());
    assert.equal(result.alreadyActive, false);
    assert.equal(result.conversion.status, "active");
    assert.equal(result.clientAccountEmail, "joesplumbing@getoblic.com");
  });

  it("rejects conversion for a released-only GetOblic Prospect", async () => {
    const fixture = ownCompanyFixture({
      prospects: [
        makeProspect({
          id: PROSPECT_A,
          business_name: "Joe's Plumbing",
          source: "getoblic",
          raw_json: makeGetOblicProvenance(1000),
        }),
      ],
      getoblicLinks: [
        makeGetOblicLink({
          organization_id: OWN_COMPANY_ORG_ID,
          prospect_id: PROSPECT_A,
          wordpress_listing_id: 1000,
          relationship_status: "released",
          released_at: NOW,
        }),
      ],
    });
    installFixture(fixture);

    await assert.rejects(
      () => promoteLicenseeProspectToClient(promoteInput()),
      (error: unknown) => {
        assert.ok(error instanceof LicenseeProspectClientConversionError);
        assert.equal(error.code, "GETOBLIC_OWNERSHIP_REQUIRED");
        return true;
      },
    );
    assert.equal(fixture.conversions.length, 0);
    assert.equal(fixture.intents.length, 0);
  });

  it("rejects reconversion of a historical released GetOblic Prospect", async () => {
    const fixture = ownCompanyFixture({
      prospects: [
        makeProspect({
          id: PROSPECT_A,
          business_name: "Joe's Plumbing",
          source: "getoblic",
          raw_json: makeGetOblicProvenance(1000),
        }),
      ],
      getoblicLinks: [
        makeGetOblicLink({
          organization_id: OWN_COMPANY_ORG_ID,
          prospect_id: PROSPECT_A,
          wordpress_listing_id: 1000,
          relationship_status: "released",
          released_at: NOW,
        }),
      ],
    });
    installFixture(fixture);

    const first = await (async () => {
      fixture.getoblicLinks[0]!.relationship_status = "linked";
      fixture.getoblicLinks[0]!.released_at = null;
      const converted = await promoteLicenseeProspectToClient(promoteInput());
      await reverseLicenseeProspectClientConversion(reverseInput());
      fixture.getoblicLinks[0]!.relationship_status = "released";
      fixture.getoblicLinks[0]!.released_at = NOW;
      return converted;
    })();

    await assert.rejects(
      () => promoteLicenseeProspectToClient(promoteInput()),
      (error: unknown) => {
        assert.ok(error instanceof LicenseeProspectClientConversionError);
        assert.equal(error.code, "GETOBLIC_OWNERSHIP_REQUIRED");
        return true;
      },
    );
    assert.equal(fixture.conversions[0]?.status, "reversed");
    assert.equal(fixture.conversions[0]?.client_organization_id, first.clientOrganizationId);
  });

  it("reattaches the same client after the same Licensee reclaims the listing", async () => {
    const fixture = ownCompanyFixture({
      prospects: [
        makeProspect({
          id: PROSPECT_A,
          business_name: "Joe's Plumbing",
          source: "getoblic",
          raw_json: makeGetOblicProvenance(1000),
        }),
      ],
      getoblicLinks: [
        makeGetOblicLink({
          organization_id: OWN_COMPANY_ORG_ID,
          prospect_id: PROSPECT_A,
          wordpress_listing_id: 1000,
          relationship_status: "linked",
        }),
      ],
    });
    installFixture(fixture);

    const first = await promoteLicenseeProspectToClient(promoteInput());
    await reverseLicenseeProspectClientConversion(reverseInput());
    fixture.getoblicLinks[0]!.relationship_status = "released";
    fixture.getoblicLinks[0]!.released_at = NOW;

    fixture.getoblicLinks[0]!.relationship_status = "linked";
    fixture.getoblicLinks[0]!.released_at = null;

    const again = await promoteLicenseeProspectToClient(promoteInput());
    assert.equal(again.reattached, true);
    assert.equal(again.clientOrganizationId, first.clientOrganizationId);
    assert.equal(again.clientAccountEmail, first.clientAccountEmail);
    assert.equal(fixture.conversions.length, 1);
  });

  it("leaves manual Prospect conversion unchanged when no GetOblic claim exists", async () => {
    const fixture = ownCompanyFixture();
    const calls = installFixture(fixture);

    const result = await promoteLicenseeProspectToClient(promoteInput());
    assert.equal(result.conversion.status, "active");
    assert.ok(!calls.tables.includes("athena_getoblic_listing_links"));
  });
});

describe("Prospect → Client language inheritance", () => {
  it("first conversion uses the Licensee Master default language", async () => {
    const fixture = ownCompanyFixture();
    fixture.licenseeByUserId[MASTER_USER_ID]!.default_language = "fr";
    const calls = installFixture(fixture);

    const result = await promoteLicenseeProspectToClient(promoteInput());

    assert.equal(result.alreadyActive, false);
    assert.equal(result.reattached, false);
    const orgInserts = calls.inserts.filter((row) => row.table === "organizations");
    assert.equal(orgInserts.length, 1);
    assert.equal(orgInserts[0]?.values.language, "fr");
    assert.equal(fixture.organizations[result.clientOrganizationId]?.language, "fr");
    assert.equal(
      calls.updates.filter((row) => row.table === "organizations").length,
      0,
    );
  });

  it("reversal and reactivation preserve the existing client organization language", async () => {
    const fixture = ownCompanyFixture();
    fixture.licenseeByUserId[MASTER_USER_ID]!.default_language = "fr";
    const calls = installFixture(fixture);

    const first = await promoteLicenseeProspectToClient(promoteInput());
    assert.equal(fixture.organizations[first.clientOrganizationId]?.language, "fr");
    fixture.licenseeByUserId[MASTER_USER_ID]!.default_language = "de";

    await reverseLicenseeProspectClientConversion(reverseInput());
    const orgInsertsAfterFirst = calls.inserts.filter(
      (row) => row.table === "organizations",
    ).length;

    const again = await promoteLicenseeProspectToClient(promoteInput());
    assert.equal(again.reattached, true);
    assert.equal(again.clientOrganizationId, first.clientOrganizationId);
    assert.equal(fixture.organizations[first.clientOrganizationId]?.language, "fr");
    assert.equal(
      calls.inserts.filter((row) => row.table === "organizations").length,
      orgInsertsAfterFirst,
    );
    assert.equal(
      calls.updates.filter((row) => row.table === "organizations").length,
      0,
    );
  });

  it("idempotent active conversion does not mutate organization language", async () => {
    const fixture = ownCompanyFixture();
    fixture.licenseeByUserId[MASTER_USER_ID]!.default_language = "it";
    const calls = installFixture(fixture);

    const first = await promoteLicenseeProspectToClient(promoteInput());
    assert.equal(fixture.organizations[first.clientOrganizationId]?.language, "it");
    fixture.licenseeByUserId[MASTER_USER_ID]!.default_language = "pt";

    const second = await promoteLicenseeProspectToClient(promoteInput());
    assert.equal(second.alreadyActive, true);
    assert.equal(second.clientOrganizationId, first.clientOrganizationId);
    assert.equal(fixture.organizations[first.clientOrganizationId]?.language, "it");
    assert.equal(
      calls.inserts.filter((row) => row.table === "organizations").length,
      1,
    );
    assert.equal(
      calls.updates.filter((row) => row.table === "organizations").length,
      0,
    );
  });
});

describe("source contracts", () => {
  it("reuses canonical Licensee provisioning and never treats prospect.email as login", () => {
    const service = read("services/licensee/licenseeProspectClientConversion.ts");
    const helper = read("services/licensee/provisionalClientAccountEmail.ts");
    const migration = read(
      "supabase/migrations/20260915000001_create_licensee_prospect_client_conversions.sql",
    );

    assert.match(service, /createLicenseeSubAccount/);
    assert.match(service, /removeLicenseeSubAccountRelationship/);
    assert.match(service, /confirmLinkExisting:\s*false/);
    assert.match(service, /clientAccountEmail/);
    assert.match(helper, /getoblic\.com/);
    assert.match(helper, /normalize\("NFKD"\)/);
    assert.doesNotMatch(service, /accountEmail:\s*prospect\.email/);
    assert.doesNotMatch(service, /lifecycle_status:/);
    assert.doesNotMatch(service, /getoblicDirectory/);
    assert.doesNotMatch(service, /consume_getoblic|reserve_getoblic|released_at/);
    assert.match(service, /requireGetOblicOwnershipForConversion/);
    assert.match(service, /isGetOblicDerivedProspect/);
    assert.match(service, /organizationOwnsActiveGetOblicClaimForProspect/);
    assert.match(service, /GETOBLIC_OWNERSHIP_REQUIRED/);
    assert.match(migration, /client_account_email text not null/);
    assert.match(migration, /licensee_prospect_client_conversions_one_active_per_prospect/);
    assert.match(migration, /on delete restrict/);
    assert.doesNotMatch(migration, /enable row level security/);
  });

  it("keeps provisioning intent and durable conversion as distinct concepts", () => {
    const service = read("services/licensee/licenseeProspectClientConversion.ts");
    const migration = read(
      "supabase/migrations/20260915000001_create_licensee_prospect_client_conversions.sql",
    );

    assert.match(migration, /create table if not exists licensee_prospect_client_provisioning_intents/);
    assert.match(migration, /intended_client_account_email text not null/);
    assert.match(
      migration,
      /licensee_prospect_client_provisioning_intents_email_uidx/,
    );
    assert.match(migration, /lower\(intended_client_account_email\)/);
    assert.match(
      migration,
      /prospect_id uuid primary key/,
    );
    assert.doesNotMatch(migration, /status in \('active', 'reversed', 'pending'\)/);
    assert.doesNotMatch(migration, /alter table licensee_sub_accounts/);
    assert.doesNotMatch(service, /from\("licensee_sub_accounts"\)[\s\S]{0,120}prospect_id/);
    assert.match(service, /reserveProvisioningIntent|reserveSelectedProvisioningIntent/);
    assert.match(service, /tryConsumeProvisioningIntent/);
    assert.match(service, /classifyRecoverablePartialProvision/);
  });

  it("writes intent before provisioning and conversion only after the relationship exists", async () => {
    const fixture = ownCompanyFixture();
    const calls = installFixture(fixture);

    await promoteLicenseeProspectToClient(promoteInput());

    const tables = calls.inserts.map((row) => row.table);
    const intentAt = tables.indexOf(
      "licensee_prospect_client_provisioning_intents",
    );
    const orgAt = tables.indexOf("organizations");
    const relationshipAt = tables.indexOf("licensee_sub_accounts");
    const conversionAt = tables.indexOf("licensee_prospect_client_conversions");

    assert.ok(intentAt >= 0 && orgAt >= 0 && relationshipAt >= 0 && conversionAt >= 0);
    assert.ok(intentAt < orgAt);
    assert.ok(orgAt < relationshipAt);
    assert.ok(relationshipAt < conversionAt);
  });

  it("retains the intent when conversion write fails and consumes it only after a durable conversion exists", async () => {
    const fixture = ownCompanyFixture({
      conversionInsertFailures: [
        { code: "40001", message: "could not serialize access" },
      ],
    });
    installFixture(fixture);

    await assert.rejects(() => promoteLicenseeProspectToClient(promoteInput()));
    assert.equal(fixture.conversions.length, 0);
    assert.equal(fixture.intents.length, 1);

    await promoteLicenseeProspectToClient(promoteInput());
    assert.equal(fixture.conversions.length, 1);
    assert.equal(fixture.intents.length, 0);
  });

  it("checks durable conversion before the first-provision intent path", async () => {
    const fixture = ownCompanyFixture();
    const calls = installFixture(fixture);
    await promoteLicenseeProspectToClient(promoteInput());
    fixture.intents.push(makeIntent({ prospect_id: PROSPECT_A }));
    const orgInserts = calls.inserts.filter(
      (row) => row.table === "organizations",
    ).length;

    const second = await promoteLicenseeProspectToClient(promoteInput());

    assert.equal(second.alreadyActive, true);
    assert.equal(
      calls.inserts.filter((row) => row.table === "organizations").length,
      orgInserts,
    );
    assert.equal(fixture.intents.length, 0);
  });

  it("bypasses first-provision intent creation on re-conversion", async () => {
    const fixture = ownCompanyFixture();
    const calls = installFixture(fixture);
    await promoteLicenseeProspectToClient(promoteInput());
    const intentInserts = calls.inserts.filter(
      (row) => row.table === "licensee_prospect_client_provisioning_intents",
    ).length;
    await reverseLicenseeProspectClientConversion(reverseInput());
    await promoteLicenseeProspectToClient(promoteInput());

    assert.equal(
      calls.inserts.filter(
        (row) => row.table === "licensee_prospect_client_provisioning_intents",
      ).length,
      intentInserts,
    );
    assert.equal(fixture.intents.length, 0);
  });
});

const OWN_COMPANY_B_ORG_ID = "12121212-1212-4121-8121-121212121212";
const OWN_COMPANY_B_REL_ID = "13131313-1313-4131-8131-131313131313";

function successWordpress(
  authorId: number,
): ReleaseGetOblicListingWordpressPort & { calls: string[] } {
  const calls: string[] = [];
  let currentAuthor = authorId;
  return {
    calls,
    getListingById: async (id) => {
      calls.push(`getListing:${id}:${currentAuthor}`);
      return {
        wordpress_listing_id: id,
        status: "publish",
        title: "Listing",
        author_id: currentAuthor,
        google_id: null,
        google_place_url: null,
        knowledge_base: null,
      };
    },
    assignListingAuthor: async (listingId, userId) => {
      calls.push(`assignAuthor:${listingId}:${userId}`);
      currentAuthor = userId;
      return {
        wordpress_listing_id: listingId,
        wordpress_user_id: userId,
        changed: true,
      };
    },
  };
}

describe("GetOblic cross-Licensee and same-Licensee lifecycle", () => {
  it("rejects A release while ACTIVE, allows B a new Prospect/client, and reattaches A after reclaim", async () => {
    const fixture = ownCompanyFixture({
      organizations: {
        [OWN_COMPANY_ORG_ID]: {
          id: OWN_COMPANY_ORG_ID,
          name: "Licensee A",
          slug: "licensee-a",
        },
        [OWN_COMPANY_B_ORG_ID]: {
          id: OWN_COMPANY_B_ORG_ID,
          name: "Licensee B",
          slug: "licensee-b",
        },
      },
      licenseeByUserId: {
        [MASTER_USER_ID]: {
          id: LICENSEE_ACCOUNT_ID,
          user_id: MASTER_USER_ID,
          email: MASTER_EMAIL,
          own_company_organization_id: OWN_COMPANY_ORG_ID,
        },
        [MASTER_B_USER_ID]: {
          id: LICENSEE_B_ID,
          user_id: MASTER_B_USER_ID,
          email: "master-b@example.com",
          own_company_organization_id: OWN_COMPANY_B_ORG_ID,
        },
      },
      relationships: [
        {
          id: OWN_COMPANY_REL_ID,
          licensee_account_id: LICENSEE_ACCOUNT_ID,
          organization_id: OWN_COMPANY_ORG_ID,
        },
        {
          id: OWN_COMPANY_B_REL_ID,
          licensee_account_id: LICENSEE_B_ID,
          organization_id: OWN_COMPANY_B_ORG_ID,
        },
      ],
      accessStatusByUserId: {
        [MASTER_USER_ID]: "active",
        [MASTER_B_USER_ID]: "active",
      },
      prospects: [
        makeProspect({
          id: PROSPECT_A,
          organization_id: OWN_COMPANY_ORG_ID,
          business_name: "Joe's Plumbing",
          source: "getoblic",
          raw_json: makeGetOblicProvenance(1000),
        }),
      ],
      getoblicLinks: [
        makeGetOblicLink({
          organization_id: OWN_COMPANY_ORG_ID,
          prospect_id: PROSPECT_A,
          wordpress_listing_id: 1000,
          relationship_status: "linked",
          wordpress_author_id: 42,
        }),
      ],
      directorySettings: [
        {
          organization_id: OWN_COMPANY_ORG_ID,
          monthly_allowance: 5,
          wordpress_author_id: 42,
          created_at: NOW,
          updated_at: NOW,
          updated_by_user_id: null,
        },
        {
          organization_id: OWN_COMPANY_B_ORG_ID,
          monthly_allowance: 5,
          wordpress_author_id: 99,
          created_at: NOW,
          updated_at: NOW,
          updated_by_user_id: null,
        },
      ],
    });
    installFixture(fixture);

    const convertedA = await promoteLicenseeProspectToClient(promoteInput());
    assert.equal(convertedA.conversion.status, "active");
    assert.equal(convertedA.clientAccountEmail, "joesplumbing@getoblic.com");
    const clientOrgA = convertedA.clientOrganizationId;

    const wordpressWhileActive = successWordpress(42);
    await assert.rejects(
      () =>
        releaseGetOblicListing(
          {
            organizationId: OWN_COMPANY_ORG_ID,
            prospectId: PROSPECT_A,
            actorUserId: MASTER_USER_ID,
          },
          wordpressWhileActive,
        ),
      (error: unknown) => {
        assert.ok(error instanceof GetOblicDirectoryError);
        assert.equal(error.code, "GETOBLIC_RELEASE_ACTIVE_CONVERSION");
        return true;
      },
    );
    assert.equal(fixture.getoblicLinks[0]?.relationship_status, "linked");
    assert.deepEqual(wordpressWhileActive.calls, []);

    const reversedA = await reverseLicenseeProspectClientConversion(reverseInput());
    assert.equal(reversedA.conversion.status, "reversed");
    assert.equal(reversedA.clientOrganizationId, clientOrgA);
    assert.equal(
      fixture.relationships.some((row) => row.organization_id === clientOrgA),
      false,
    );

    const wordpressAfterReverse = successWordpress(42);
    const released = await releaseGetOblicListing(
      {
        organizationId: OWN_COMPANY_ORG_ID,
        prospectId: PROSPECT_A,
        actorUserId: MASTER_USER_ID,
      },
      wordpressAfterReverse,
    );
    assert.equal(released.outcome, "released");
    assert.equal(fixture.getoblicLinks[0]?.relationship_status, "released");
    assert.ok(wordpressAfterReverse.calls.length > 0);

    fixture.prospects.push(
      makeProspect({
        id: PROSPECT_B,
        organization_id: OWN_COMPANY_B_ORG_ID,
        business_name: "Joe's Plumbing",
        source: "getoblic",
        raw_json: makeGetOblicProvenance(1000),
      }),
    );
    fixture.getoblicLinks.push(
      makeGetOblicLink({
        id: "link-b",
        organization_id: OWN_COMPANY_B_ORG_ID,
        prospect_id: PROSPECT_B,
        wordpress_listing_id: 1000,
        relationship_status: "linked",
        wordpress_author_id: 99,
      }),
    );

    assert.notEqual(PROSPECT_B, PROSPECT_A);

    const convertedB = await promoteLicenseeProspectToClient({
      prospectId: PROSPECT_B,
      sourceOrganizationId: OWN_COMPANY_B_ORG_ID,
      actingUserId: TENANT_B_OWNER_USER_ID,
    });
    assert.equal(convertedB.conversion.status, "active");
    assert.notEqual(convertedB.clientOrganizationId, clientOrgA);
    assert.equal(
      convertedB.clientAccountEmail,
      `joesplumbing-${PROSPECT_B.slice(0, 8)}@getoblic.com`,
    );
    assert.notEqual(convertedB.clientAccountEmail, convertedA.clientAccountEmail);
    assert.equal(
      fixture.conversions.find((row) => row.prospect_id === PROSPECT_A)?.status,
      "reversed",
    );
    assert.ok(fixture.organizations[clientOrgA]);
    assert.ok(fixture.organizations[convertedB.clientOrganizationId]);
    assert.notEqual(
      fixture.authUsersByEmail[convertedB.clientAccountEmail]?.id,
      fixture.authUsersByEmail[convertedA.clientAccountEmail]?.id,
    );

    await assert.rejects(
      () => promoteLicenseeProspectToClient(promoteInput()),
      (error: unknown) => {
        assert.ok(error instanceof LicenseeProspectClientConversionError);
        assert.equal(error.code, "GETOBLIC_OWNERSHIP_REQUIRED");
        return true;
      },
    );

    fixture.getoblicLinks[0]!.relationship_status = "linked";
    fixture.getoblicLinks[0]!.released_at = null;

    const reattachedA = await promoteLicenseeProspectToClient(promoteInput());
    assert.equal(reattachedA.reattached, true);
    assert.equal(reattachedA.clientOrganizationId, clientOrgA);
    assert.equal(reattachedA.clientAccountEmail, convertedA.clientAccountEmail);
    assert.equal(
      fixture.conversions.filter((row) => row.prospect_id === PROSPECT_A).length,
      1,
    );
  });
});

describe("Phase 3C — Own Company tenant promotion authorization", () => {
  it("uses a tenant-shaped promotion contract and resolves Master internally", () => {
    const domain = read("services/licensee/licenseeProspectClientConversion.ts");
    const route = read("app/api/prospects/[id]/convert-to-client/route.ts");
    const restore = read(
      "app/api/licensee/sub-accounts/restore-to-prospect/route.ts",
    );
    const identity = read("services/licensee/licenseeIdentity.ts");

    assert.match(
      domain,
      /export type PromoteLicenseeProspectToClientInput = \{\n  prospectId: string;\n  sourceOrganizationId: string;\n  actingUserId: string;\n\}/,
    );
    assert.match(route, /actingUserId: userId/);
    assert.doesNotMatch(route, /masterUserId/);
    assert.doesNotMatch(route, /request\.json|_request\.json/);
    assert.match(domain, /createdByUserId: actingUserId/);
    assert.match(domain, /convertedByUserId: actingUserId/);
    assert.match(domain, /masterUserId: resolvedMasterUserId/);
    assert.match(domain, /requireLicenseeMasterAccount\(designated\.user_id\)/);
    assert.match(domain, /createLicenseeSubAccount/);
    assert.match(domain, /getLicenseeAccountsByOwnCompanyOrganizationId/);
    assert.doesNotMatch(domain, /requireLicenseeMasterAccount\(input\.actingUserId\)/);
    assert.doesNotMatch(domain, /requireLicenseeMasterAccount\(actingUserId\)/);
    const helperStart = identity.indexOf(
      "export async function getLicenseeAccountsByOwnCompanyOrganizationId",
    );
    const helperEnd = identity.indexOf(
      "export async function isLicenseeOwnCompanyOrganization",
    );
    assert.ok(helperStart >= 0 && helperEnd > helperStart);
    const writeHelper = identity.slice(helperStart, helperEnd);
    assert.doesNotMatch(writeHelper, /\.maybeSingle\(/);
    assert.doesNotMatch(writeHelper, /\.single\(/);
    assert.match(
      domain,
      /export type ReverseLicenseeProspectClientConversionInput = \{\n  prospectId: string;\n  sourceOrganizationId: string;\n  masterUserId: string;\n\}/,
    );
    assert.match(restore, /masterUserId: user\.id/);
    assert.match(restore, /createSupabaseServerClient/);
    assert.match(restore, /auth\.getUser/);
  });

  it("resolves 0, 1, and >1 Own Company Licensee matches without collapsing them", async () => {
    installFixture(ownCompanyFixture());
    const one = await getLicenseeAccountsByOwnCompanyOrganizationId(
      OWN_COMPANY_ORG_ID,
    );
    assert.equal(one.length, 1);
    assert.equal(one[0]?.id, LICENSEE_ACCOUNT_ID);
    restoreMocks();

    const fixture = ownCompanyFixture({
      licenseeByUserId: {
        [MASTER_USER_ID]: {
          id: LICENSEE_ACCOUNT_ID,
          user_id: MASTER_USER_ID,
          email: MASTER_EMAIL,
          own_company_organization_id: OWN_COMPANY_ORG_ID,
        },
        [MASTER_B_USER_ID]: {
          id: LICENSEE_B_ID,
          user_id: MASTER_B_USER_ID,
          email: "master-b@example.com",
          own_company_organization_id: OWN_COMPANY_ORG_ID,
        },
      },
    });
    installFixture(fixture);

    const none = await getLicenseeAccountsByOwnCompanyOrganizationId(PLAIN_ORG);
    const own = await getLicenseeAccountsByOwnCompanyOrganizationId(
      OWN_COMPANY_ORG_ID,
    );
    const empty = await getLicenseeAccountsByOwnCompanyOrganizationId("  ");

    assert.deepEqual(none, []);
    assert.equal(own.length, 2);
    assert.deepEqual(
      own.map((row) => row.id).sort(),
      [LICENSEE_ACCOUNT_ID, LICENSEE_B_ID].sort(),
    );
    assert.deepEqual(empty, []);
  });

  it("allows the Own Company tenant owner and stores that actor, not the Master", async () => {
    const fixture = ownCompanyFixture();
    const calls = installFixture(fixture);

    const result = await promoteLicenseeProspectToClient(promoteInput());

    assert.equal(result.conversion.status, "active");
    assert.equal(result.conversion.convertedByUserId, TENANT_OWNER_USER_ID);
    assert.notEqual(result.conversion.convertedByUserId, MASTER_USER_ID);
    const intent = calls.inserts.find(
      (row) => row.table === "licensee_prospect_client_provisioning_intents",
    );
    assert.equal(intent?.values.created_by_user_id, TENANT_OWNER_USER_ID);
    assert.ok(
      calls.inserts.some(
        (row) =>
          row.table === "licensee_sub_accounts" &&
          row.values.licensee_account_id === LICENSEE_ACCOUNT_ID &&
          row.values.organization_id === result.clientOrganizationId,
      ),
    );
    assert.equal(fixture.licenseeByUserId[TENANT_OWNER_USER_ID], undefined);
  });

  it("records the current acting tenant user on re-conversion", async () => {
    const fixture = ownCompanyFixture();
    installFixture(fixture);

    const first = await promoteLicenseeProspectToClient(promoteInput());
    assert.equal(first.conversion.convertedByUserId, TENANT_OWNER_USER_ID);
    await reverseLicenseeProspectClientConversion(reverseInput());

    const again = await promoteLicenseeProspectToClient(
      promoteInput(PROSPECT_A, TENANT_OWNER_2_USER_ID),
    );
    assert.equal(again.reattached, true);
    assert.equal(again.conversion.convertedByUserId, TENANT_OWNER_2_USER_ID);
    assert.notEqual(again.conversion.convertedByUserId, MASTER_USER_ID);
  });

  it("denies ordinary, managed, and sibling tenants before provisioning", async () => {
    const sibling = ownCompanyFixture({
      organizations: {
        [OWN_COMPANY_ORG_ID]: {
          id: OWN_COMPANY_ORG_ID,
          name: "Own",
          slug: "own",
        },
        [UNRELATED_ORG]: {
          id: UNRELATED_ORG,
          name: "Sibling",
          slug: "sibling",
        },
      },
      relationships: [
        {
          id: OWN_COMPANY_REL_ID,
          licensee_account_id: LICENSEE_ACCOUNT_ID,
          organization_id: OWN_COMPANY_ORG_ID,
        },
      ],
      prospects: [
        makeProspect({
          id: PROSPECT_A,
          organization_id: UNRELATED_ORG,
          business_name: "Joe's Plumbing",
        }),
      ],
    });
    installFixture(sibling);
    await assert.rejects(
      () =>
        promoteLicenseeProspectToClient({
          prospectId: PROSPECT_A,
          sourceOrganizationId: UNRELATED_ORG,
          actingUserId: TENANT_OWNER_USER_ID,
        }),
      (error: unknown) =>
        error instanceof LicenseeProspectClientConversionError &&
        error.code === "SOURCE_NOT_OWN_COMPANY",
    );
    assert.equal(sibling.conversions.length, 0);
    restoreMocks();

    const managed = ownCompanyFixture({
      organizations: {
        [OWN_COMPANY_ORG_ID]: {
          id: OWN_COMPANY_ORG_ID,
          name: "Own",
          slug: "own",
        },
        [MANAGED_CLIENT_ORG]: {
          id: MANAGED_CLIENT_ORG,
          name: "Managed Client",
          slug: "managed",
        },
      },
      relationships: [
        {
          id: OWN_COMPANY_REL_ID,
          licensee_account_id: LICENSEE_ACCOUNT_ID,
          organization_id: OWN_COMPANY_ORG_ID,
        },
        {
          id: MANAGED_REL_ID,
          licensee_account_id: LICENSEE_ACCOUNT_ID,
          organization_id: MANAGED_CLIENT_ORG,
        },
      ],
      prospects: [
        makeProspect({
          id: PROSPECT_A,
          organization_id: MANAGED_CLIENT_ORG,
          business_name: "Joe's Plumbing",
        }),
      ],
    });
    installFixture(managed);
    await assert.rejects(
      () =>
        promoteLicenseeProspectToClient({
          prospectId: PROSPECT_A,
          sourceOrganizationId: MANAGED_CLIENT_ORG,
          actingUserId: TENANT_OWNER_USER_ID,
        }),
      (error: unknown) =>
        error instanceof LicenseeProspectClientConversionError &&
        error.code === "SOURCE_NOT_OWN_COMPANY",
    );
    assert.equal(managed.conversions.length, 0);
  });

  it("denies Licensee B converting a Prospect that belongs to Licensee A", async () => {
    const fixture = ownCompanyFixture({
      organizations: {
        [OWN_COMPANY_ORG_ID]: {
          id: OWN_COMPANY_ORG_ID,
          name: "Licensee A",
          slug: "licensee-a",
        },
        [OWN_COMPANY_B_ORG_ID]: {
          id: OWN_COMPANY_B_ORG_ID,
          name: "Licensee B",
          slug: "licensee-b",
        },
      },
      licenseeByUserId: {
        [MASTER_USER_ID]: {
          id: LICENSEE_ACCOUNT_ID,
          user_id: MASTER_USER_ID,
          email: MASTER_EMAIL,
          own_company_organization_id: OWN_COMPANY_ORG_ID,
        },
        [MASTER_B_USER_ID]: {
          id: LICENSEE_B_ID,
          user_id: MASTER_B_USER_ID,
          email: "master-b@example.com",
          own_company_organization_id: OWN_COMPANY_B_ORG_ID,
        },
      },
      relationships: [
        {
          id: OWN_COMPANY_REL_ID,
          licensee_account_id: LICENSEE_ACCOUNT_ID,
          organization_id: OWN_COMPANY_ORG_ID,
        },
        {
          id: OWN_COMPANY_B_REL_ID,
          licensee_account_id: LICENSEE_B_ID,
          organization_id: OWN_COMPANY_B_ORG_ID,
        },
      ],
      accessStatusByUserId: {
        [MASTER_USER_ID]: "active",
        [MASTER_B_USER_ID]: "active",
      },
    });
    installFixture(fixture);

    await assert.rejects(
      () =>
        promoteLicenseeProspectToClient({
          prospectId: PROSPECT_A,
          sourceOrganizationId: OWN_COMPANY_B_ORG_ID,
          actingUserId: TENANT_B_OWNER_USER_ID,
        }),
      (error: unknown) =>
        error instanceof LicenseeProspectClientConversionError &&
        error.code === "PROSPECT_NOT_FOUND",
    );
    assert.equal(fixture.conversions.length, 0);
  });

  it("fails closed for missing or ambiguous Own Company Licensee designation", async () => {
    const missing = ownCompanyFixture({
      licenseeByUserId: {},
    });
    installFixture(missing);
    await assert.rejects(
      () => promoteLicenseeProspectToClient(promoteInput()),
      (error: unknown) =>
        error instanceof LicenseeProspectClientConversionError &&
        error.code === "SOURCE_NOT_OWN_COMPANY",
    );
    restoreMocks();

    const ambiguous = ownCompanyFixture({
      licenseeByUserId: {
        [MASTER_USER_ID]: {
          id: LICENSEE_ACCOUNT_ID,
          user_id: MASTER_USER_ID,
          email: MASTER_EMAIL,
          own_company_organization_id: OWN_COMPANY_ORG_ID,
        },
        [MASTER_B_USER_ID]: {
          id: LICENSEE_B_ID,
          user_id: MASTER_B_USER_ID,
          email: "master-b@example.com",
          own_company_organization_id: OWN_COMPANY_ORG_ID,
        },
      },
    });
    installFixture(ambiguous);
    await assert.rejects(
      () => promoteLicenseeProspectToClient(promoteInput()),
      (error: unknown) =>
        error instanceof LicenseeProspectClientConversionError &&
        error.code === "AMBIGUOUS_OWN_COMPANY_LICENSEE",
    );
    assert.equal(ambiguous.conversions.length, 0);
  });

  it("fails closed for a missing or ambiguous Own Company Licensee relationship", async () => {
    const missing = ownCompanyFixture({
      relationships: [],
    });
    installFixture(missing);
    await assert.rejects(
      () => promoteLicenseeProspectToClient(promoteInput()),
      (error: unknown) =>
        error instanceof LicenseeProspectClientConversionError &&
        error.code === "MISSING_LICENSEE_RELATIONSHIP",
    );
    restoreMocks();

    const mismatched = ownCompanyFixture({
      relationships: [
        {
          id: MANAGED_REL_ID,
          licensee_account_id: LICENSEE_B_ID,
          organization_id: OWN_COMPANY_ORG_ID,
        },
      ],
    });
    installFixture(mismatched);
    await assert.rejects(
      () => promoteLicenseeProspectToClient(promoteInput()),
      (error: unknown) =>
        error instanceof LicenseeProspectClientConversionError &&
        error.code === "WRONG_LICENSEE",
    );
  });

  it("fails closed when the resolved Master is deactivated", async () => {
    const fixture = ownCompanyFixture({
      accessStatusByUserId: {
        [MASTER_USER_ID]: "deactivated",
      },
    });
    installFixture(fixture);

    await assert.rejects(
      () => promoteLicenseeProspectToClient(promoteInput()),
      (error: unknown) => error instanceof LicenseeAccessError,
    );
    assert.equal(fixture.conversions.length, 0);
    assert.equal(fixture.intents.length, 0);
  });

  it("returns an existing active conversion only after Own Company authorization", async () => {
    const fixture = ownCompanyFixture();
    installFixture(fixture);
    const first = await promoteLicenseeProspectToClient(promoteInput());
    const second = await promoteLicenseeProspectToClient(
      promoteInput(PROSPECT_A, TENANT_OWNER_2_USER_ID),
    );
    assert.equal(second.alreadyActive, true);
    assert.equal(second.clientOrganizationId, first.clientOrganizationId);
    assert.equal(second.conversion.convertedByUserId, TENANT_OWNER_USER_ID);
    restoreMocks();

    const foreign = ownCompanyFixture({
      conversions: [
        {
          id: "existing-active",
          prospect_id: PROSPECT_A,
          source_organization_id: OWN_COMPANY_ORG_ID,
          client_organization_id: MANAGED_CLIENT_ORG,
          licensee_account_id: LICENSEE_ACCOUNT_ID,
          licensee_sub_account_id: MANAGED_REL_ID,
          status: "active",
          client_account_email: "joesplumbing@getoblic.com",
          converted_at: NOW,
          converted_by_user_id: MASTER_USER_ID,
          restored_at: null,
          restored_by_user_id: null,
          created_at: NOW,
          updated_at: NOW,
        },
      ],
    });
    installFixture(foreign);
    await assert.rejects(
      () =>
        promoteLicenseeProspectToClient({
          prospectId: PROSPECT_A,
          sourceOrganizationId: PLAIN_ORG,
          actingUserId: TENANT_OWNER_USER_ID,
        }),
      (error: unknown) =>
        error instanceof LicenseeProspectClientConversionError &&
        error.code === "PROSPECT_NOT_FOUND",
    );
  });
});
