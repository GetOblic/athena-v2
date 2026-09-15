/**
 * Phase 3 — Licensee dashboard conversion-managed actions.
 * Presentation and request-boundary checks. No DB I/O except mocked reads.
 */

import "./licenseeAuthTestEnv";

import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { afterEach, describe, it } from "node:test";
import { supabaseAdmin } from "../../lib/supabaseAdmin";
import {
  RESTORE_TO_PROSPECT_LIFECYCLE_ACTION,
  licenseeSubAccountRemovalKind,
  restoreToProspectUserMessage,
} from "../../components/licensee/LicenseeDashboardClient";
import { listActiveConvertedClientOrganizationIds } from "../../services/licensee/licenseeProspectClientConversionReads";

const ROOT = process.cwd();

function read(relativePath: string): string {
  return readFileSync(join(ROOT, relativePath), "utf8");
}

const OWN_COMPANY_ORG_ID = "33333333-3333-4333-8333-333333333333";
const CLIENT_ORG_ID = "44444444-4444-4444-8444-444444444444";
const MANUAL_ORG_ID = "77777777-7777-4777-8777-777777777777";
const OTHER_ORG_ID = "99999999-9999-4999-8999-999999999999";

const originalFrom = supabaseAdmin.from.bind(supabaseAdmin);

function installConversionRows(
  rows: Array<{
    client_organization_id: string;
    status: string;
  }>,
) {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  (supabaseAdmin as any).from = (table: string) => {
    const filters: {
      status?: string;
      inColumn?: string;
      inValues?: string[];
    } = {};
    const builder = {
      select() {
        return builder;
      },
      eq(column: string, value: string) {
        if (column === "status") {
          filters.status = value;
        }
        return builder;
      },
      in(column: string, values: string[]) {
        filters.inColumn = column;
        filters.inValues = values;
        return builder;
      },
      then(
        onFulfilled?: (value: { data: unknown; error: unknown }) => unknown,
        onRejected?: (reason: unknown) => unknown,
      ) {
        if (table !== "licensee_prospect_client_conversions") {
          return Promise.resolve({ data: [], error: null }).then(
            onFulfilled,
            onRejected,
          );
        }
        const data = rows.filter((row) => {
          if (filters.status && row.status !== filters.status) {
            return false;
          }
          if (
            filters.inColumn === "client_organization_id" &&
            filters.inValues &&
            !filters.inValues.includes(row.client_organization_id)
          ) {
            return false;
          }
          return true;
        });
        return Promise.resolve({ data, error: null }).then(
          onFulfilled,
          onRejected,
        );
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

describe("Licensee dashboard conversion-managed actions", () => {
  it("keeps Remove for manual sub-accounts", () => {
    assert.equal(
      licenseeSubAccountRemovalKind({
        isOwnCompany: false,
        conversionManaged: false,
      }),
      "remove",
    );
    const client = read("components/licensee/LicenseeDashboardClient.tsx");
    assert.match(client, />\s*Remove\s*</);
    assert.match(client, /removalKind === "restore"/);
  });

  it("hides Remove and shows Move back to prospect for conversion-managed clients", () => {
    assert.equal(
      licenseeSubAccountRemovalKind({
        isOwnCompany: false,
        conversionManaged: true,
      }),
      "restore",
    );
    const client = read("components/licensee/LicenseeDashboardClient.tsx");
    assert.match(client, /Move back to prospect/);
    assert.match(
      client,
      /removalKind === "restore" \? \([\s\S]*Move back to prospect[\s\S]*\) : \([\s\S]*Remove/,
    );
  });

  it("never exposes reversal on Own Company", () => {
    assert.equal(
      licenseeSubAccountRemovalKind({
        isOwnCompany: true,
        conversionManaged: true,
      }),
      "none",
    );
    assert.equal(
      licenseeSubAccountRemovalKind({
        isOwnCompany: true,
        conversionManaged: false,
      }),
      "none",
    );
    const page = read("app/licensee/page.tsx");
    const client = read("components/licensee/LicenseeDashboardClient.tsx");
    assert.match(page, /!item\.isOwnCompany &&/);
    assert.match(client, /if \(item\.isOwnCompany\) \{\s*return "none"/);
    assert.match(client, /Locked company identity/);
  });

  it("loads conversion-managed state once for the dashboard list", async () => {
    installConversionRows([
      { client_organization_id: CLIENT_ORG_ID, status: "active" },
      { client_organization_id: MANUAL_ORG_ID, status: "reversed" },
      { client_organization_id: OTHER_ORG_ID, status: "active" },
    ]);

    const ids = await listActiveConvertedClientOrganizationIds([
      CLIENT_ORG_ID,
      MANUAL_ORG_ID,
      OWN_COMPANY_ORG_ID,
    ]);
    assert.deepEqual([...ids], [CLIENT_ORG_ID]);

    const page = read("app/licensee/page.tsx");
    const client = read("components/licensee/LicenseeDashboardClient.tsx");
    const reads = read(
      "services/licensee/licenseeProspectClientConversionReads.ts",
    );
    assert.match(page, /listActiveConvertedClientOrganizationIds/);
    assert.match(page, /listLicenseeSubAccountsForMaster/);
    assert.match(
      reads,
      /export async function listActiveConvertedClientOrganizationIds/,
    );
    assert.match(reads, /\.in\("client_organization_id", ids\)/);
    assert.doesNotMatch(client, /listActiveConvertedClientOrganizationIds/);
    assert.doesNotMatch(client, /getActiveConversionForClientOrganization/);
    assert.doesNotMatch(client, /getActiveConversionForRelationshipId/);
    assert.doesNotMatch(client, /licensee_prospect_client_conversions/);
    assert.doesNotMatch(client, /getProspectClientConversionState/);
  });
});

describe("Licensee restore-to-prospect request boundary", () => {
  it("posts only relationshipId and keeps the card until server refresh", () => {
    const client = read("components/licensee/LicenseeDashboardClient.tsx");
    const start = client.indexOf("function confirmRestoreToProspect");
    const end = client.indexOf("return (", start);
    const restoreFn = client.slice(start, end);
    assert.match(
      restoreFn,
      /"\/api\/licensee\/sub-accounts\/restore-to-prospect"/,
    );
    assert.match(
      restoreFn,
      /JSON\.stringify\(\{\s*relationshipId: target\.relationshipId,\s*\}\)/,
    );
    assert.doesNotMatch(
      restoreFn,
      /prospectId|sourceOrganizationId|clientOrganizationId|licenseeAccountId|accountEmail/,
    );
    assert.match(restoreFn, /if \(!confirmRestore \|\| restorePending\)/);
    assert.match(client, /disabled=\{restorePending\}/);
    assert.match(restoreFn, /router\.refresh\(\)/);
    assert.doesNotMatch(
      restoreFn,
      /setItems\(\(current\) =>\s*current\.filter/,
    );
    assert.match(
      client,
      /Move \{businessName\} back to prospects\?/,
    );
    assert.match(
      client,
      /Its Athena account and data will[\s\S]*preserved/,
    );
  });

  it("styles Move back to prospect as a stronger secondary lifecycle action", () => {
    const client = read("components/licensee/LicenseeDashboardClient.tsx");
    const restoreStart = client.indexOf('removalKind === "restore"');
    const restoreButton = client.slice(
      restoreStart,
      client.indexOf("Remove", restoreStart),
    );
    assert.ok(
      RESTORE_TO_PROSPECT_LIFECYCLE_ACTION.includes(
        "border-[var(--athena-orange)]/45",
      ),
    );
    assert.ok(
      RESTORE_TO_PROSPECT_LIFECYCLE_ACTION.includes(
        "bg-[var(--athena-orange)]/12",
      ),
    );
    assert.ok(
      RESTORE_TO_PROSPECT_LIFECYCLE_ACTION.includes(
        "text-[var(--athena-orange)]",
      ),
    );
    assert.ok(RESTORE_TO_PROSPECT_LIFECYCLE_ACTION.includes("px-4"));
    assert.ok(RESTORE_TO_PROSPECT_LIFECYCLE_ACTION.includes("py-2.5"));
    assert.ok(RESTORE_TO_PROSPECT_LIFECYCLE_ACTION.includes("font-semibold"));
    assert.ok(RESTORE_TO_PROSPECT_LIFECYCLE_ACTION.includes("rounded-xl"));
    assert.ok(
      RESTORE_TO_PROSPECT_LIFECYCLE_ACTION.includes(
        "hover:bg-[var(--athena-orange)]/22",
      ),
    );
    assert.ok(!RESTORE_TO_PROSPECT_LIFECYCLE_ACTION.includes("red-"));
    assert.ok(!RESTORE_TO_PROSPECT_LIFECYCLE_ACTION.includes("rose-"));
    assert.ok(!RESTORE_TO_PROSPECT_LIFECYCLE_ACTION.includes("athena-danger"));
    assert.ok(
      !RESTORE_TO_PROSPECT_LIFECYCLE_ACTION.includes(
        "bg-[var(--athena-orange)] ",
      ),
    );
    assert.match(restoreButton, /RESTORE_TO_PROSPECT_LIFECYCLE_ACTION/);
    assert.match(restoreButton, /Move back to prospect/);
    assert.doesNotMatch(restoreButton, /Remove/);
    assert.doesNotMatch(restoreButton, /red-|rose-|athena-danger/);
    assert.match(
      client,
      /className="inline-flex items-center gap-2 rounded-xl border border-white\/10 px-3 py-2 text-sm text-white\/65/,
    );
    assert.match(
      client,
      /className="inline-flex items-center rounded-xl border border-white\/10 px-3 py-2 text-sm text-white\/55 transition hover:border-red-400\/30 hover:bg-red-500\/10 hover:text-red-100"/,
    );
    assert.match(
      client,
      /rounded-full bg-\[var\(--athena-orange\)\] px-7 py-3\.5[\s\S]*Open Athena/,
    );
  });

  it("maps restore failures without deleting the card locally", () => {
    assert.equal(
      restoreToProspectUserMessage(403),
      "Unable to move this client back to prospects from the current account.",
    );
    assert.equal(
      restoreToProspectUserMessage(409),
      "This client could not be moved back automatically. Please contact your administrator.",
    );
    assert.equal(
      restoreToProspectUserMessage(500),
      "Unable to move this client back to prospects right now.",
    );
    const client = read("components/licensee/LicenseeDashboardClient.tsx");
    const restoreFn = client.slice(client.indexOf("confirmRestoreToProspect"));
    assert.match(restoreFn, /restoreToProspectUserMessage\(response\.status\)/);
    assert.doesNotMatch(restoreFn, /payload\.error\?\.message/);
    assert.doesNotMatch(restoreFn, /setItems\(\(current\) =>\s*current\.filter/);
  });
});
