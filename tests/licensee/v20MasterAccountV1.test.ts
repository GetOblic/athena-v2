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
import { clearLicenseeHandoffBrowserStorage } from "../../lib/licensee/clearHandoffBrowserStorage";

const ROOT = process.cwd();

function read(relativePath: string): string {
  return readFileSync(join(ROOT, relativePath), "utf8");
}

function pathExists(relativePath: string): boolean {
  try {
    readFileSync(join(ROOT, relativePath));
    return true;
  } catch {
    return false;
  }
}

describe("V20 Master Account — V1 contracts", () => {
  it("Master auth login uses OTP with shouldCreateUser false and authorizes licensee_accounts", () => {
    const login = read("app/licensee/login/page.tsx");
    assert.match(login, /shouldCreateUser:\s*false/);
    assert.match(login, /signInWithOtp/);
    assert.match(login, /verifyOtp/);
    assert.match(login, /isLicenseeMasterUser/);
    assert.match(login, /signOut/);
    assert.doesNotMatch(login, /provisionTenantForAuthenticatedUser/);
    assert.match(login, /licenseeMasterMarkerCookieWriteOptions/);
  });

  it("ordinary /login remains unchanged and shouldCreateUser false", () => {
    const login = read("app/login/page.tsx");
    assert.match(login, /shouldCreateUser:\s*false/);
    assert.match(login, /signInWithOtp/);
    assert.match(login, /verifyOtp/);
    assert.doesNotMatch(login, /licensee_accounts/);
    assert.doesNotMatch(login, /provisionTenantForAuthenticatedUser/);
  });

  it("Master auto-provision exclusion remains centralized", () => {
    const service = read("services/organizationService.ts");
    assert.match(service, /isLicenseeMasterUser/);
    assert.match(service, /LicenseeMasterProvisionBlockedError/);
    assert.match(service, /provisionTenantForAuthenticatedUser/);
    assert.match(service, /requireCurrentOrganizationContext/);
    assert.match(service, /organizationName/);
    assert.match(service, /redirect\("\/licensee"\)/);
  });

  it("auth callback never provisions Master and routes to /licensee", () => {
    const callback = read("app/auth/callback/route.ts");
    assert.match(callback, /isLicenseeMasterUser/);
    assert.match(callback, /\/licensee/);
    assert.match(callback, /provisionTenantForAuthenticatedUser/);
    assert.match(callback, /applyLicenseeMasterMarkerCookie/);
  });

  it("sub-account create service covers required email cases", () => {
    const service = read("services/licensee/licenseeSubAccounts.ts");
    const authLookup = read("services/licensee/licenseeAuthUserLookup.ts");
    assert.match(service, /createConfirmedAuthUser/);
    assert.match(authLookup, /email_confirm:\s*true/);
    assert.match(service, /provisionTenantForAuthenticatedUser/);
    assert.match(service, /organizationName:\s*businessName/);
    assert.match(service, /MASTER_EMAIL_REJECTED/);
    assert.match(service, /EXISTING_ACCOUNT_REQUIRES_CONFIRMATION/);
    assert.match(service, /AMBIGUOUS_MEMBERSHIP/);
    assert.match(service, /DUPLICATE_RELATIONSHIP/);
    assert.match(service, /confirmLinkExisting/);
    assert.match(service, /PROVISION_FAILED_AFTER_AUTH_CREATE/);
  });

  it("dashboard list returns relationship metadata plus optional existing identity snapshot", () => {
    const service = read("services/licensee/licenseeSubAccounts.ts");
    assert.match(service, /listLicenseeSubAccountsForMaster/);
    assert.match(service, /requireLicenseeMasterAccount/);
    assert.match(service, /brand_logo_storage_path/);
    assert.match(service, /createBrandLogoSignedUrl/);
    assert.match(service, /pinned_at/);
    assert.match(service, /resolveAccountSnapshot/);
    assert.match(service, /readIdentityExecutiveIntelligence/);
    assert.match(service, /from\("athena_identity"\)/);
    assert.match(service, /about_you/);
    assert.doesNotMatch(service, /generateIdentity|openai|anthropic|composePrompt/i);
    assert.match(service, /\.eq\("licensee_account_id", licenseeAccount\.id\)/);
  });

  it("pin/unpin updates only pinned fields and revalidates ownership", () => {
    const service = read("services/licensee/licenseeSubAccounts.ts");
    const route = read("app/api/licensee/sub-accounts/pin/route.ts");
    assert.match(service, /setLicenseeSubAccountPinned/);
    assert.match(service, /pinned:\s*input\.pinned/);
    assert.match(service, /pinned_at:\s*pinnedAt/);
    assert.match(service, /licensee_account_id !== licenseeAccount\.id/);
    assert.match(route, /setLicenseeSubAccountPinned/);
  });

  it("production handoff route replaces spike and uses proven architecture", () => {
    const route = read("app/api/licensee/handoff/route.ts");
    assert.match(route, /open_sub_account/);
    assert.match(route, /return_to_master/);
    assert.match(route, /handoffMasterToSubAccount/);
    assert.match(route, /restoreMasterFromOriginCookie/);
    assert.match(route, /requireCurrentOrganizationContext/);
    assert.match(route, /activeOrgOverrideUsed:\s*false/);
    assert.match(route, /applyLicenseeOriginCookie/);
    assert.match(route, /clearLicenseeOriginCookie/);
    assert.doesNotMatch(route, /spikeEnabled|HANDOFF_SPIKE\s*===\s*"1"/);
    assert.equal(pathExists("app/api/dev/v20-licensee-handoff/route.ts"), false);
  });

  it("handoff authorizes relationship before generateLink and uses actual sub-account user", () => {
    const handoff = read("services/licensee/licenseeSessionHandoff.ts");
    const identity = read("services/licensee/licenseeIdentity.ts");
    assert.match(identity, /resolveAuthorizedSubAccountHandoff/);
    assert.match(identity, /licensee_sub_accounts/);
    assert.match(identity, /organization_members/);
    assert.match(handoff, /resolveAuthorizedSubAccountHandoff/);
    assert.match(handoff, /generateLink/);
    assert.match(handoff, /type:\s*"magiclink"/);
    assert.match(handoff, /verifyOtp/);
    assert.match(handoff, /token_hash/);
    assert.doesNotMatch(handoff, /access_token/);
    assert.doesNotMatch(handoff, /refresh_token/);
    assert.match(handoff, /Master-origin relationship is no longer valid/);
  });

  it("signed origin cookie round-trips without Supabase tokens", () => {
    process.env.ATHENA_LICENSEE_HANDOFF_SECRET = "v20-v1-test-secret";
    const value = buildLicenseeOriginCookieValue({
      masterUserId: "11111111-1111-1111-1111-111111111111",
      licenseeAccountId: "22222222-2222-2222-2222-222222222222",
      organizationId: "33333333-3333-3333-3333-333333333333",
      nowMs: Date.now(),
    });
    const parsed = parseLicenseeOriginCookieValue(value);
    assert.ok(parsed);
    assert.equal(parsed.masterUserId, "11111111-1111-1111-1111-111111111111");
    assert.equal(parseLicenseeOriginCookieValue(value + "x"), null);
    assert.equal(parseLicenseeOriginCookieValue("bad"), null);
    assert.doesNotMatch(value, /access_token|refresh_token|sb-/i);

    const expired = buildLicenseeOriginCookieValue({
      masterUserId: "11111111-1111-1111-1111-111111111111",
      licenseeAccountId: "22222222-2222-2222-2222-222222222222",
      organizationId: "33333333-3333-3333-3333-333333333333",
      nowMs: Date.now() - 60 * 60 * 9 * 1000,
    });
    assert.equal(parseLicenseeOriginCookieValue(expired), null);
  });

  it("Back to Master UI and logout behaviors are wired", () => {
    const back = read("components/licensee/BackToMasterCta.tsx");
    const brand = read("components/branding/AthenaBrandLink.tsx");
    const actions = read("components/auth/AthenaHeaderActions.tsx");
    const masterLogout = read("app/api/licensee/logout/route.ts");
    const athenaLogout = read("app/api/auth/logout/route.ts");
    assert.match(back, /Back to Master/);
    assert.match(back, /clearLicenseeHandoffBrowserStorage/);
    assert.match(back, /return_to_master/);
    assert.match(back, /canReturnToMaster/);
    assert.match(brand, /AthenaHeaderActions/);
    assert.match(actions, /BackToMasterCta/);
    assert.match(actions, /LogoutCta/);
    assert.match(actions, /justify-end/);
    assert.match(masterLogout, /\/licensee\/login/);
    assert.match(masterLogout, /clearLicenseeOriginCookie/);
    assert.match(athenaLogout, /clearLicenseeOriginCookie/);
    assert.match(athenaLogout, /\/login/);
  });

  it("dashboard Open Athena clears browser storage at the boundary", () => {
    const dashboard = read("components/licensee/LicenseeDashboardClient.tsx");
    assert.match(dashboard, /clearLicenseeHandoffBrowserStorage/);
    assert.match(dashboard, /open_sub_account/);
    assert.match(dashboard, /SubAccountFallbackIcon/);
  });

  it("client storage clearer contract covers known unsafe keys/prefixes", () => {
    assert.deepEqual(LICENSEE_HANDOFF_CLEAR_STORAGE_KEYS, [
      "athena:getting-started-conversation:v1",
    ]);
    for (const prefix of [
      "athena:identity-conversation:v1:",
      "athena:persona-conversation:v1:",
      "athena:prospect-conversation:v1:",
      "athena-regeneration:",
      "athena-regeneration-autoselect-current:",
      "athena:getoblic-links:v1:",
    ]) {
      assert.ok(LICENSEE_HANDOFF_CLEAR_STORAGE_PREFIXES.includes(prefix as never));
    }

    const store = new Map<string, string>();
    const storage = {
      get length() {
        return store.size;
      },
      key(index: number) {
        return [...store.keys()][index] ?? null;
      },
      removeItem(key: string) {
        store.delete(key);
      },
      setItem(key: string, value: string) {
        store.set(key, value);
      },
    } as Storage;

    store.set("athena:getting-started-conversation:v1", "x");
    store.set("athena:persona-conversation:v1:abc", "x");
    store.set("keep-me", "1");

    (globalThis as { window?: unknown }).window = {
      sessionStorage: storage,
      localStorage: {
        length: 0,
        key: () => null,
        removeItem: () => undefined,
      },
    };

    clearLicenseeHandoffBrowserStorage();
    assert.equal(store.has("athena:getting-started-conversation:v1"), false);
    assert.equal(store.has("athena:persona-conversation:v1:abc"), false);
    assert.equal(store.has("keep-me"), true);
    delete (globalThis as { window?: unknown }).window;
  });

  it("middleware Master marker is UX-only and does not query licensee_accounts", () => {
    const middleware = read("lib/supabase/middleware.ts");
    assert.match(middleware, /LICENSEE_MASTER_MARKER_COOKIE/);
    assert.match(middleware, /LICENSEE_ORIGIN_COOKIE/);
    assert.match(middleware, /LICENSEE_MASTER_CONTEXT/);
    assert.match(middleware, /\/licensee\/login/);
    assert.doesNotMatch(middleware, /from\("licensee_accounts"\)/);
    assert.doesNotMatch(middleware, /supabaseAdmin/);
    assert.doesNotMatch(middleware, /spikeEnabled|HANDOFF_SPIKE\s*===\s*"1"/);
  });

  it("security audit logging omits secrets and tokens", () => {
    const audit = read("services/licensee/licenseeAuditLog.ts");
    const handoff = read("services/licensee/licenseeSessionHandoff.ts");
    assert.match(audit, /open_sub_account/);
    assert.match(audit, /return_to_master/);
    assert.match(handoff, /logLicenseeHandoffAudit/);
    assert.doesNotMatch(audit, /access_token|refresh_token|token_hash/);
    assert.doesNotMatch(audit, /hashed_token|Authorization|Bearer /);
  });

  it("schema migration remains relationship-only", () => {
    const migration = read(
      "supabase/migrations/20260807000001_create_licensee_master_accounts.sql",
    );
    assert.match(migration, /create table if not exists licensee_accounts/);
    assert.match(migration, /create table if not exists licensee_sub_accounts/);
    assert.doesNotMatch(migration, /business_name/);
    assert.doesNotMatch(migration, /brand_logo/);
    assert.doesNotMatch(migration, /billing/);
  });

  it("organization_members uniqueness and installed auth primitives remain", () => {
    const migration = read(
      "supabase/migrations/20260709000001_create_organizations.sql",
    );
    assert.match(
      migration,
      /constraint organization_members_user_id_unique unique \(user_id\)/,
    );

    const adminTypes = read(
      "node_modules/@supabase/auth-js/dist/module/GoTrueAdminApi.d.ts",
    );
    assert.match(adminTypes, /createUser\(attributes: AdminUserAttributes\)/);
    assert.match(adminTypes, /generateLink\(params: GenerateLinkParams\)/);
  });

  it("Master dashboard and create pages exist with required UX copy", () => {
    const dashboard = read("app/licensee/page.tsx");
    const create = read("app/licensee/sub-accounts/new/page.tsx");
    const client = read("components/licensee/LicenseeDashboardClient.tsx");
    assert.match(dashboard, /Athena Business Licensee/);
    assert.match(dashboard, /Logout/);
    assert.match(dashboard, /listLicenseeSubAccountsForMaster/);
    assert.match(create, /Business Name/);
    assert.match(
      create,
      /This is the email associated with this Athena sub-account and usable for direct Athena access/,
    );
    assert.match(client, /Pinned/);
    assert.match(client, /All Sub-accounts/);
    assert.match(client, /Open Athena →/);
    assert.match(client, /Create Sub-account/);
    assert.match(client, /Search businesses, emails, notes/);
    assert.match(client, /Create your first Athena sub-account/);
    assert.match(client, /No matching sub-accounts found/);
    assert.match(client, /Master Note/);
    assert.match(client, /Account Snapshot/);
    assert.match(client, /Remove Sub-account/);
  });

  it("Remove deletes only licensee_sub_accounts relationship and is Master-authorized", () => {
    const service = read("services/licensee/licenseeSubAccounts.ts");
    const route = read("app/api/licensee/sub-accounts/remove/route.ts");
    const start = service.indexOf(
      "export async function removeLicenseeSubAccountRelationship",
    );
    const end = service.indexOf(
      "async function assertMembershipSafeForLink",
      start,
    );
    const removeFn = service.slice(start, end);
    assert.match(service, /removeLicenseeSubAccountRelationship/);
    assert.match(removeFn, /\.from\("licensee_sub_accounts"\)/);
    assert.match(removeFn, /\.delete\(\)/);
    assert.match(removeFn, /licensee_account_id !== licenseeAccount\.id/);
    assert.doesNotMatch(removeFn, /from\("organizations"\)/);
    assert.doesNotMatch(removeFn, /from\("organization_members"\)/);
    assert.doesNotMatch(removeFn, /from\("athena_identity"\)/);
    assert.doesNotMatch(removeFn, /auth\.admin\.deleteUser/);
    assert.match(route, /removeLicenseeSubAccountRelationship/);
    assert.match(route, /jsonError\(403/);
    assert.doesNotMatch(route, /deleteUser/);
  });

  it("Master notes persist on relationship only and are searchable in the dashboard", () => {
    const service = read("services/licensee/licenseeSubAccounts.ts");
    const route = read("app/api/licensee/sub-accounts/notes/route.ts");
    const client = read("components/licensee/LicenseeDashboardClient.tsx");
    const migration = read(
      "supabase/migrations/20260807000002_add_licensee_sub_account_notes.sql",
    );
    assert.match(migration, /add column if not exists notes/);
    assert.match(service, /setLicenseeSubAccountNotes/);
    assert.match(service, /LICENSEE_SUB_ACCOUNT_NOTES_MAX_LENGTH/);
    assert.match(service, /notes/);
    assert.match(route, /setLicenseeSubAccountNotes/);
    assert.match(route, /jsonError\(403/);
    assert.match(client, /item\.notes\.toLowerCase\(\)\.includes\(q\)/);
    assert.match(client, /accountSnapshot/);
    assert.match(client, /Save note/);
  });
});
