import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, it } from "node:test";
import {
  LICENSEE_HANDOFF_CLEAR_STORAGE_KEYS,
  LICENSEE_HANDOFF_CLEAR_STORAGE_PREFIXES,
} from "../../services/licensee/licenseeHandoffStorageKeys";
import {
  buildLicenseeOriginCookieValue,
  parseLicenseeOriginCookieValue,
} from "../../services/licensee/licenseeOriginCookie";

const ROOT = process.cwd();

function read(relativePath: string): string {
  return readFileSync(join(ROOT, relativePath), "utf8");
}

/**
 * Retained spike-era contracts now mapped onto production V1 modules.
 */
describe("V20 Master Account — handoff contracts (production)", () => {
  it("installed Supabase admin primitives include createUser and generateLink", () => {
    const adminTypes = read(
      "node_modules/@supabase/auth-js/dist/module/GoTrueAdminApi.d.ts",
    );
    assert.match(adminTypes, /createUser\(attributes: AdminUserAttributes\)/);
    assert.match(adminTypes, /generateLink\(params: GenerateLinkParams\)/);
    assert.match(adminTypes, /will not send a confirmation email/);
    assert.match(
      adminTypes,
      /Generates email links and OTPs to be sent via a custom email provider/,
    );
    assert.match(adminTypes, /email_confirm: true/);

    const types = read(
      "node_modules/@supabase/auth-js/dist/module/lib/types.d.ts",
    );
    assert.match(types, /email_confirm\?: boolean/);
    assert.match(types, /type: 'invite' \| 'magiclink'/);
    assert.match(types, /hashed_token: string/);
    assert.match(types, /token_hash: string/);
    assert.match(types, /type: EmailOtpType/);
    assert.match(types, /'magiclink'/);
  });

  it("package versions match investigated SSR stack", () => {
    const pkg = JSON.parse(read("package.json")) as {
      dependencies: Record<string, string>;
    };
    assert.equal(pkg.dependencies["@supabase/supabase-js"], "^2.110.0");
    assert.equal(pkg.dependencies["@supabase/ssr"], "^0.12.0");
  });

  it("Master auto-provision exclusion is centralized in organizationService", () => {
    const service = read("services/organizationService.ts");
    assert.match(service, /isLicenseeMasterUser/);
    assert.match(service, /LicenseeMasterProvisionBlockedError/);
    assert.match(service, /provisionTenantForAuthenticatedUser/);
    assert.match(service, /requireCurrentOrganizationContext/);
    assert.match(service, /organizationName/);
  });

  it("auth callback never provisions Master into an organization", () => {
    const callback = read("app/auth/callback/route.ts");
    assert.match(callback, /isLicenseeMasterUser/);
    assert.match(callback, /\/licensee/);
    assert.match(callback, /provisionTenantForAuthenticatedUser/);
  });

  it("ordinary /login keeps shouldCreateUser false and is unchanged in intent", () => {
    const login = read("app/login/page.tsx");
    assert.match(login, /shouldCreateUser:\s*false/);
    assert.match(login, /signInWithOtp/);
    assert.match(login, /verifyOtp/);
    assert.doesNotMatch(login, /licensee_accounts/);
    assert.doesNotMatch(login, /provisionTenantForAuthenticatedUser/);
  });

  it("handoff requires relationship authorization before session establishment", () => {
    const handoff = read("services/licensee/licenseeSessionHandoff.ts");
    const identity = read("services/licensee/licenseeIdentity.ts");
    assert.match(identity, /resolveAuthorizedSubAccountHandoff/);
    assert.match(identity, /licensee_sub_accounts/);
    assert.match(identity, /organization_members/);
    assert.match(identity, /getUserById/);
    assert.match(handoff, /resolveAuthorizedSubAccountHandoff/);
    assert.match(handoff, /generateLink/);
    assert.match(handoff, /type:\s*"magiclink"/);
    assert.match(handoff, /verifyOtp/);
    assert.match(handoff, /token_hash/);
    assert.doesNotMatch(handoff, /access_token/);
    assert.doesNotMatch(handoff, /refresh_token/);
  });

  it("signed Master-origin cookie round-trips without auth tokens", () => {
    process.env.ATHENA_LICENSEE_HANDOFF_SECRET = "v20-spike-test-secret";
    const value = buildLicenseeOriginCookieValue({
      masterUserId: "11111111-1111-1111-1111-111111111111",
      licenseeAccountId: "22222222-2222-2222-2222-222222222222",
      organizationId: "33333333-3333-3333-3333-333333333333",
      nowMs: Date.now(),
    });
    const parsed = parseLicenseeOriginCookieValue(value);
    assert.ok(parsed);
    assert.equal(parsed.masterUserId, "11111111-1111-1111-1111-111111111111");
    assert.equal(
      parsed.licenseeAccountId,
      "22222222-2222-2222-2222-222222222222",
    );
    assert.equal(
      parsed.organizationId,
      "33333333-3333-3333-3333-333333333333",
    );
    assert.equal(parseLicenseeOriginCookieValue(value + "tamper"), null);
    assert.equal(parseLicenseeOriginCookieValue("not.a.cookie"), null);
  });

  it("production handoff route is not spike-gated", () => {
    const route = read("app/api/licensee/handoff/route.ts");
    assert.match(route, /handoffMasterToSubAccount/);
    assert.match(route, /requireCurrentOrganizationContext/);
    assert.match(route, /activeOrgOverrideUsed:\s*false/);
    assert.doesNotMatch(route, /spikeEnabled|HANDOFF_SPIKE\s*===\s*"1"/);
  });

  it("minimum schema migration matches approved contract", () => {
    const migration = read(
      "supabase/migrations/20260807000001_create_licensee_master_accounts.sql",
    );
    assert.match(migration, /create table if not exists licensee_accounts/);
    assert.match(migration, /create table if not exists licensee_sub_accounts/);
    assert.match(migration, /user_id uuid not null unique/);
    assert.match(migration, /email text not null unique/);
    assert.match(
      migration,
      /constraint licensee_sub_accounts_licensee_org_unique unique \(licensee_account_id, organization_id\)/,
    );
    assert.doesNotMatch(migration, /business_name/);
    assert.doesNotMatch(migration, /brand_logo/);
    assert.doesNotMatch(migration, /billing/);
  });

  it("handoff storage clear list covers known unsafe keys/prefixes", () => {
    assert.deepEqual(LICENSEE_HANDOFF_CLEAR_STORAGE_KEYS, [
      "athena:getting-started-conversation:v1",
    ]);
    assert.ok(
      LICENSEE_HANDOFF_CLEAR_STORAGE_PREFIXES.includes(
        "athena:identity-conversation:v1:",
      ),
    );
    assert.ok(
      LICENSEE_HANDOFF_CLEAR_STORAGE_PREFIXES.includes(
        "athena:persona-conversation:v1:",
      ),
    );
    assert.ok(
      LICENSEE_HANDOFF_CLEAR_STORAGE_PREFIXES.includes(
        "athena:prospect-conversation:v1:",
      ),
    );
    assert.ok(
      LICENSEE_HANDOFF_CLEAR_STORAGE_PREFIXES.includes("athena-regeneration:"),
    );
    assert.ok(
      LICENSEE_HANDOFF_CLEAR_STORAGE_PREFIXES.includes(
        "athena:getoblic-links:v1:",
      ),
    );
  });

  it("organization_members_user_id_unique remains the tenant model", () => {
    const migration = read(
      "supabase/migrations/20260709000001_create_organizations.sql",
    );
    assert.match(
      migration,
      /constraint organization_members_user_id_unique unique \(user_id\)/,
    );
  });
});
