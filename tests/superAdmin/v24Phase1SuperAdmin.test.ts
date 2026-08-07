import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, it } from "node:test";

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

function sliceBetween(source: string, startMarker: string, endMarker: string): string {
  const start = source.indexOf(startMarker);
  assert.ok(start >= 0, `missing start marker: ${startMarker}`);
  const end = source.indexOf(endMarker, start + startMarker.length);
  assert.ok(end >= 0, `missing end marker: ${endMarker}`);
  return source.slice(start, end);
}

describe("V24 Phase 1 — GetOblic Super Admin contracts", () => {
  it("Super Admin identity authorizes against getoblic_super_admins DB lookup", () => {
    const identity = read("services/superAdmin/superAdminIdentity.ts");
    assert.match(identity, /isGetOblicSuperAdminUser/);
    assert.match(identity, /requireGetOblicSuperAdmin/);
    assert.match(identity, /from\("getoblic_super_admins"\)/);
    assert.match(identity, /eq\("user_id", id\)/);
    assert.doesNotMatch(identity, /impersonat|login.?as.?user/i);
  });

  it("unauthorized /super rejection fails closed and signs out", () => {
    const login = read("app/super/login/page.tsx");
    assert.match(login, /shouldCreateUser:\s*false/);
    assert.match(login, /signInWithOtp/);
    assert.match(login, /verifyOtp/);
    assert.match(login, /isGetOblicSuperAdminUser/);
    assert.match(login, /signOut/);
    assert.match(login, /not authorized as a GetOblic Super Admin/);
    assert.doesNotMatch(login, /provisionTenantForAuthenticatedUser/);
  });

  it("Super Admin provisioning exclusion is centralized in organizationService", () => {
    const service = read("services/organizationService.ts");
    assert.match(service, /isGetOblicSuperAdminUser/);
    assert.match(service, /SuperAdminProvisionBlockedError/);
    assert.match(service, /SuperAdminAuthorityLookupError/);
    assert.match(service, /redirect\("\/super"\)/);
    assert.match(service, /assertAccountAccessActive/);
    assert.match(service, /AccountAccessDeniedError/);
  });

  it("Super Admin authority lookup distinguishes no-row from unexpected error", () => {
    const identity = read("services/superAdmin/superAdminIdentity.ts");
    assert.match(identity, /class SuperAdminAuthorityLookupError/);
    assert.match(identity, /isMissingSuperAdminRelationError/);
    assert.match(identity, /throw new SuperAdminAuthorityLookupError/);
    assert.match(
      identity,
      /Unexpected DB\/PostgREST error → throws SuperAdminAuthorityLookupError/,
    );
    // Missing table remains ordinary (pre-migration).
    assert.match(identity, /return false/);
    assert.match(identity, /return null/);
    // Must not swallow unexpected errors as false/null after logging.
    const isFn = sliceBetween(
      identity,
      "export async function isGetOblicSuperAdminUser",
      "export async function getSuperAdminByUserId",
    );
    assert.match(isFn, /throw new SuperAdminAuthorityLookupError/);
    // Unexpected errors must not fall through to "not a Super Admin".
    assert.match(
      isFn,
      /console\.error\("getoblic_super_admins lookup failed:", error\);\s*throw new SuperAdminAuthorityLookupError/,
    );

    const org = read("services/organizationService.ts");
    const provision = sliceBetween(
      org,
      "export async function provisionTenantForAuthenticatedUserDetailed",
      "export async function provisionTenantForAuthenticatedUser",
    );
    assert.match(provision, /isGetOblicSuperAdminUser/);
    assert.match(provision, /SuperAdminProvisionBlockedError/);

    const licensee = read("services/licensee/licenseeSubAccounts.ts");
    assert.match(licensee, /SUPER_ADMIN_LOOKUP_FAILED/);
    assert.match(licensee, /SuperAdminAuthorityLookupError/);
  });

  it("role overlap rejection is explicit and fail-closed", () => {
    const accounts = read("services/superAdmin/superAdminAccounts.ts");
    assert.match(accounts, /ROLE_OVERLAP_SUPER_ADMIN/);
    assert.match(accounts, /ROLE_OVERLAP_LICENSEE_MASTER/);
    assert.match(accounts, /ROLE_OVERLAP_ATHENA_OWNER/);
    assert.match(accounts, /ALREADY_ATHENA_OWNER/);
    assert.match(accounts, /ALREADY_LICENSEE_MASTER/);
    assert.match(accounts, /rejectRoleOverlap/);
    assert.match(accounts, /isGetOblicSuperAdminUser/);
    assert.match(accounts, /isLicenseeMasterUser/);
  });

  it("normal Athena account creation contract", () => {
    const accounts = read("services/superAdmin/superAdminAccounts.ts");
    const route = read("app/api/super/accounts/athena/route.ts");
    assert.match(accounts, /createAthenaAccountAsSuperAdmin/);
    assert.match(accounts, /createConfirmedAuthUser/);
    assert.match(accounts, /provisionTenantForAuthenticatedUserDetailed/);
    assert.match(accounts, /organizationName/);
    assert.match(accounts, /ensureAccountAccessActive/);
    assert.match(accounts, /create_athena_account/);
    assert.doesNotMatch(
      accounts.slice(
        accounts.indexOf("export async function createAthenaAccountAsSuperAdmin"),
        accounts.indexOf("export async function createLicenseeMasterAsSuperAdmin"),
      ),
      /licensee_accounts|licensee_sub_accounts/,
    );
    assert.match(route, /createAthenaAccountAsSuperAdmin/);
    assert.match(route, /NOT_SUPER_ADMIN/);
  });

  it("Licensee Master creation contract never creates Athena tenant for Master", () => {
    const accounts = read("services/superAdmin/superAdminAccounts.ts");
    const route = read("app/api/super/accounts/licensee/route.ts");
    const start = accounts.indexOf(
      "export async function createLicenseeMasterAsSuperAdmin",
    );
    const end = accounts.indexOf(
      "async function resolveManageableAccountTarget",
      start,
    );
    const createMaster = accounts.slice(start, end);
    assert.match(createMaster, /from\("licensee_accounts"\)/);
    assert.match(createMaster, /\.insert\(/);
    assert.match(createMaster, /ensureAccountAccessActive/);
    assert.doesNotMatch(createMaster, /organization_members/);
    assert.doesNotMatch(createMaster, /provisionTenantForAuthenticatedUser/);
    assert.doesNotMatch(createMaster, /from\("organizations"\)/);
    assert.match(route, /createLicenseeMasterAsSuperAdmin/);
  });

  it("failed create performs bounded cleanup only for resources this operation created", () => {
    const accounts = read("services/superAdmin/superAdminAccounts.ts");
    const org = read("services/organizationService.ts");

    assert.match(accounts, /cleanupFailedCreateResources/);
    assert.match(accounts, /CREATE_CLEANUP_FAILED/);
    assert.match(accounts, /authUserCreated/);
    assert.match(accounts, /organizationCreated/);
    assert.match(accounts, /auth\.admin\.deleteUser/);
    assert.match(accounts, /leftoverAuthUserId|leftoverOrganizationId|Leftover:/);

    const cleanup = sliceBetween(
      accounts,
      "async function cleanupFailedCreateResources",
      "async function rejectRoleOverlap",
    );
    assert.match(cleanup, /if \(input\.authUserCreated && input\.authUserId\)/);
    assert.match(
      cleanup,
      /if \(input\.organizationCreated && input\.organizationId\)/,
    );
    assert.doesNotMatch(cleanup, /licensee_sub_accounts/);

    const createAthena = sliceBetween(
      accounts,
      "export async function createAthenaAccountAsSuperAdmin",
      "export async function createLicenseeMasterAsSuperAdmin",
    );
    assert.match(createAthena, /cleanupFailedCreateResources/);
    assert.match(createAthena, /organizationCreated/);

    const createMaster = sliceBetween(
      accounts,
      "export async function createLicenseeMasterAsSuperAdmin",
      "async function resolveManageableAccountTarget",
    );
    assert.match(createMaster, /cleanupFailedCreateResources/);
    assert.match(createMaster, /organizationCreated:\s*false/);

    // Provisioning helper cleans only the org created in the same call on membership failure.
    assert.match(org, /leftoverOrganizationId/);
    assert.match(org, /newly-created organization cleanup failed/);
    assert.match(org, /provisionTenantForAuthenticatedUserDetailed/);
    assert.match(org, /organizationCreated:\s*true/);
    assert.match(org, /organizationCreated:\s*false/);
  });

  it("deactivation reconciles DB + Auth without ALREADY_* retry trap", () => {
    const access = read("services/superAdmin/accountAccessStatus.ts");
    const accounts = read("services/superAdmin/superAdminAccounts.ts");
    const route = read("app/api/super/accounts/deactivate/route.ts");
    assert.match(access, /status:\s*"deactivated"/);
    assert.match(access, /ban_duration:\s*ACCOUNT_ACCESS_BAN_DURATION/);
    assert.match(access, /isAuthUserBanned/);
    assert.match(access, /banned_until/);
    assert.match(access, /updateUserById/);

    const deactivateFn = sliceBetween(
      accounts,
      "export async function deactivateAccountAsSuperAdmin",
      "export async function reactivateAccountAsSuperAdmin",
    );
    assert.match(deactivateFn, /setAccountAccessDeactivated/);
    assert.match(deactivateFn, /banAuthUser/);
    assert.match(deactivateFn, /isAuthUserBanned/);
    assert.match(deactivateFn, /current !== "deactivated"/);
    assert.match(deactivateFn, /RECONCILE_INCOMPLETE/);
    assert.doesNotMatch(deactivateFn, /ALREADY_DEACTIVATED/);
    assert.doesNotMatch(deactivateFn, /\.delete\(/);
    assert.doesNotMatch(deactivateFn, /deleteUser/);
    assert.match(route, /deactivateAccountAsSuperAdmin/);
  });

  it("reactivation reconciles DB + Auth without ALREADY_* retry trap", () => {
    const access = read("services/superAdmin/accountAccessStatus.ts");
    const accounts = read("services/superAdmin/superAdminAccounts.ts");
    const route = read("app/api/super/accounts/reactivate/route.ts");
    assert.match(access, /ban_duration:\s*"none"/);
    assert.match(access, /isAuthUserBanned/);

    const reactivateFn = sliceBetween(
      accounts,
      "export async function reactivateAccountAsSuperAdmin",
      "export async function listManageableAccountsForSuperAdmin",
    );
    assert.match(reactivateFn, /ensureAccountAccessActive/);
    assert.match(reactivateFn, /unbanAuthUser/);
    assert.match(reactivateFn, /isAuthUserBanned/);
    assert.match(reactivateFn, /RECONCILE_INCOMPLETE/);
    assert.doesNotMatch(reactivateFn, /ALREADY_ACTIVE/);
    assert.match(route, /reactivateAccountAsSuperAdmin/);
  });

  it("deactivate/reactivate reconciliation scenarios are encoded", () => {
    const accounts = read("services/superAdmin/superAdminAccounts.ts");
    const deactivateFn = sliceBetween(
      accounts,
      "export async function deactivateAccountAsSuperAdmin",
      "export async function reactivateAccountAsSuperAdmin",
    );
    const reactivateFn = sliceBetween(
      accounts,
      "export async function reactivateAccountAsSuperAdmin",
      "export async function listManageableAccountsForSuperAdmin",
    );

    // DB already deactivated + Auth not banned → continue and ban
    assert.match(deactivateFn, /if \(current !== "deactivated"\)/);
    assert.match(deactivateFn, /if \(!\(await isAuthUserBanned\(target\.userId\)\)\)/);
    assert.match(deactivateFn, /await banAuthUser\(target\.userId\)/);

    // Convergence check for repeated deactivate
    assert.match(
      deactivateFn,
      /dbStatus !== "deactivated" \|\| !banned/,
    );

    // DB active + Auth still banned → unban
    assert.match(reactivateFn, /await ensureAccountAccessActive/);
    assert.match(reactivateFn, /if \(await isAuthUserBanned\(target\.userId\)\)/);
    assert.match(reactivateFn, /await unbanAuthUser\(target\.userId\)/);
    assert.match(reactivateFn, /dbStatus !== "active" \|\| banned/);
  });

  it("existing-session server authorization blocks deactivated users", () => {
    const org = read("services/organizationService.ts");
    const licensee = read("services/licensee/licenseeSubAccounts.ts");
    const identity = read("services/licensee/licenseeIdentity.ts");
    const handoff = read("services/licensee/licenseeSessionHandoff.ts");
    const login = read("app/login/page.tsx");
    const licenseeLogin = read("app/licensee/login/page.tsx");
    const quote = read("app/licensee/quote/page.tsx");
    const subNew = read("app/licensee/sub-accounts/new/page.tsx");
    const master = read("app/licensee/page.tsx");

    assert.match(org, /assertAccountAccessActive/);
    assert.match(org, /requireCurrentOrganizationContext/);
    assert.match(licensee, /requireLicenseeMasterAccount/);
    assert.match(licensee, /assertAccountAccessActive/);
    assert.match(identity, /resolveAuthorizedSubAccountHandoff/);
    assert.match(identity, /assertAccountAccessActive\(masterUserId\)/);
    assert.match(identity, /assertAccountAccessActive\(membership\.user_id\)/);
    assert.match(handoff, /restoreMasterFromOriginCookie/);
    assert.match(handoff, /assertAccountAccessActive\(origin\.masterUserId\)/);
    assert.match(login, /assertAccountAccessActive/);
    assert.match(licenseeLogin, /assertAccountAccessActive/);

    // Licensee Quote + sub-account create page use same Master access guard.
    assert.match(master, /isAccountAccessActive\(user\.id\)/);
    assert.match(quote, /isAccountAccessActive\(user\.id\)/);
    assert.match(quote, /This Master account has been deactivated/);
    assert.match(subNew, /isAccountAccessActive\(user\.id\)/);
    assert.match(subNew, /This Master account has been deactivated/);
  });

  it("deactivated Athena Master-handoff and deactivated Master restoration fail closed", () => {
    const identity = read("services/licensee/licenseeIdentity.ts");
    const handoff = read("services/licensee/licenseeSessionHandoff.ts");
    const handoffRoute = read("app/api/licensee/handoff/route.ts");
    assert.match(identity, /AccountAccessDeniedError/);
    assert.match(handoff, /Back-to-Master must not restore a deactivated Master/);
    assert.match(handoffRoute, /AccountAccessDeniedError/);
  });

  it("Facebook session ingestion enforces account_access_status before org resolve", () => {
    const org = read("services/organizationService.ts");
    const route = read("app/api/ingestion/facebook/route.ts");

    const resolveUser = sliceBetween(
      org,
      "export async function resolveOrganizationIdForUser",
      "export async function requireCurrentOrganizationId",
    );
    assert.match(resolveUser, /assertAccountAccessActive\(userId\)/);
    assert.match(resolveUser, /provisionTenantForAuthenticatedUser/);

    const resolveIngestion = sliceBetween(
      org,
      "export async function resolveOrganizationIdForIngestion",
      "export function belongsToOrganization",
    );
    assert.match(resolveIngestion, /assertAccountAccessActive\(input\.userId\)/);

    assert.match(route, /resolveOrganizationIdForUser/);
    assert.match(route, /AccountAccessDeniedError/);
    assert.match(route, /ACCOUNT_DEACTIVATED/);
  });

  it("Licensee Master deactivation leaves sub-account relationships untouched", () => {
    const accounts = read("services/superAdmin/superAdminAccounts.ts");
    const deactivateFn = sliceBetween(
      accounts,
      "export async function deactivateAccountAsSuperAdmin",
      "export async function reactivateAccountAsSuperAdmin",
    );
    assert.match(deactivateFn, /setAccountAccessDeactivated/);
    assert.match(deactivateFn, /banAuthUser/);
    assert.doesNotMatch(deactivateFn, /licensee_sub_accounts/);
    assert.doesNotMatch(deactivateFn, /organization_members/);
    assert.doesNotMatch(deactivateFn, /\.delete\(/);
    assert.doesNotMatch(deactivateFn, /deleteUser/);
  });

  it("no product deletion paths and no impersonation in Super Admin surface", () => {
    const accounts = read("services/superAdmin/superAdminAccounts.ts");
    const dashboard = read("components/superAdmin/SuperAdminDashboardClient.tsx");
    const page = read("app/super/page.tsx");
    assert.doesNotMatch(accounts, /loginAs|login-as|impersonate/i);
    assert.doesNotMatch(dashboard, /\bbilling\b|\bRBAC\b/);
    assert.doesNotMatch(dashboard, /auth\.admin\.deleteUser|\.delete\(/);
    assert.doesNotMatch(page, /\bbilling\b|delete account|impersonate/i);
    assert.match(dashboard, /No deletion\. No impersonation\./);

    // deleteUser may exist only inside bounded failed-create cleanup.
    const deactivateFn = sliceBetween(
      accounts,
      "export async function deactivateAccountAsSuperAdmin",
      "export async function listManageableAccountsForSuperAdmin",
    );
    assert.doesNotMatch(deactivateFn, /deleteUser/);
    assert.match(
      accounts,
      /Not a product deletion capability — compensating cleanup only/,
    );
  });

  it("tenant isolation and Super Admin workspace isolation remain intact", () => {
    const sidebar = read("components/dashboard/DashboardSidebar.tsx");
    const licenseeDash = read("components/licensee/LicenseeDashboardClient.tsx");
    const middleware = read("lib/supabase/middleware.ts");
    const callback = read("app/auth/callback/route.ts");

    assert.doesNotMatch(sidebar, /\/super|Super Admin/);
    assert.doesNotMatch(licenseeDash, /\/super|Super Admin/);
    assert.match(middleware, /SUPER_ADMIN_MARKER_COOKIE/);
    assert.match(middleware, /\/super\/login/);
    assert.match(middleware, /SUPER_ADMIN_CONTEXT/);
    assert.doesNotMatch(middleware, /from\("getoblic_super_admins"\)/);
    assert.doesNotMatch(middleware, /supabaseAdmin/);
    assert.match(callback, /isGetOblicSuperAdminUser/);
    assert.match(callback, /SuperAdminAuthorityLookupError/);
    assert.match(callback, /\/super/);
    assert.match(callback, /applySuperAdminMarkerCookie/);
  });

  it("existing Licensee architecture regression anchors remain", () => {
    assert.equal(pathExists("app/licensee/login/page.tsx"), true);
    assert.equal(pathExists("app/licensee/page.tsx"), true);
    assert.equal(pathExists("app/api/licensee/handoff/route.ts"), true);
    const identity = read("services/licensee/licenseeIdentity.ts");
    const org = read("services/organizationService.ts");
    assert.match(identity, /isLicenseeMasterUser/);
    assert.match(identity, /resolveAuthorizedSubAccountHandoff/);
    assert.match(org, /isLicenseeMasterUser/);
    assert.match(org, /LicenseeMasterProvisionBlockedError/);
    assert.match(org, /redirect\("\/licensee"\)/);
  });

  it("existing ordinary Athena auth/provisioning regression anchors remain", () => {
    const login = read("app/login/page.tsx");
    const org = read("services/organizationService.ts");
    assert.match(login, /shouldCreateUser:\s*false/);
    assert.match(login, /signInWithOtp/);
    assert.match(login, /verifyOtp/);
    assert.doesNotMatch(login, /licensee_accounts/);
    assert.doesNotMatch(login, /provisionTenantForAuthenticatedUser/);
    assert.match(org, /provisionTenantForAuthenticatedUser/);
    assert.match(org, /requireCurrentOrganizationContext/);
    assert.match(
      read("supabase/migrations/20260709000001_create_organizations.sql"),
      /constraint organization_members_user_id_unique unique \(user_id\)/,
    );
  });

  it("migration creates required Super Admin tables with RLS lockdown and no invented UUIDs", () => {
    const migration = read(
      "supabase/migrations/20260808000001_create_getoblic_super_admin.sql",
    );
    assert.match(migration, /create table if not exists getoblic_super_admins/);
    assert.match(migration, /create table if not exists account_access_status/);
    assert.match(migration, /create table if not exists getoblic_super_admin_audit/);
    assert.match(migration, /status in \('active', 'deactivated'\)/);
    assert.match(
      migration,
      /alter table getoblic_super_admins enable row level security/,
    );
    assert.match(
      migration,
      /alter table account_access_status enable row level security/,
    );
    assert.match(
      migration,
      /alter table getoblic_super_admin_audit enable row level security/,
    );
    assert.match(
      migration,
      /revoke all on table getoblic_super_admins from anon/,
    );
    assert.match(
      migration,
      /revoke all on table getoblic_super_admins from authenticated/,
    );
    assert.match(
      migration,
      /revoke all on table account_access_status from anon/,
    );
    assert.match(
      migration,
      /revoke all on table account_access_status from authenticated/,
    );
    assert.match(
      migration,
      /revoke all on table getoblic_super_admin_audit from anon/,
    );
    assert.match(
      migration,
      /revoke all on table getoblic_super_admin_audit from authenticated/,
    );
    assert.match(
      migration,
      /grant all on table getoblic_super_admins to service_role/,
    );
    assert.match(
      migration,
      /grant all on table account_access_status to service_role/,
    );
    assert.match(
      migration,
      /grant all on table getoblic_super_admin_audit to service_role/,
    );
    assert.doesNotMatch(migration, /create policy/i);
    assert.doesNotMatch(migration, /for (select|insert|update|delete).*to (anon|authenticated)/i);
    assert.doesNotMatch(migration, /[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/i);
    assert.doesNotMatch(migration, /insert into getoblic_super_admins/i);
  });

  it("control-plane table access uses supabaseAdmin/service role only", () => {
    const identity = read("services/superAdmin/superAdminIdentity.ts");
    const access = read("services/superAdmin/accountAccessStatus.ts");
    const audit = read("services/superAdmin/superAdminAuditLog.ts");
    const accounts = read("services/superAdmin/superAdminAccounts.ts");
    assert.match(identity, /supabaseAdmin/);
    assert.match(access, /supabaseAdmin/);
    assert.match(audit, /supabaseAdmin/);
    assert.match(accounts, /supabaseAdmin/);
    assert.doesNotMatch(identity, /createSupabaseServerClient|createBrowserClient/);
    assert.doesNotMatch(access, /createSupabaseServerClient|createBrowserClient/);
    assert.doesNotMatch(audit, /createSupabaseServerClient|createBrowserClient/);
  });

  it("Super Admin routes and APIs exist under isolated /super surface", () => {
    assert.equal(pathExists("app/super/login/page.tsx"), true);
    assert.equal(pathExists("app/super/page.tsx"), true);
    assert.equal(pathExists("app/api/super/accounts/athena/route.ts"), true);
    assert.equal(pathExists("app/api/super/accounts/licensee/route.ts"), true);
    assert.equal(pathExists("app/api/super/accounts/deactivate/route.ts"), true);
    assert.equal(pathExists("app/api/super/accounts/reactivate/route.ts"), true);
    assert.equal(pathExists("app/api/super/logout/route.ts"), true);
    const audit = read("services/superAdmin/superAdminAuditLog.ts");
    assert.match(audit, /create_athena_account/);
    assert.match(audit, /create_licensee_master/);
    assert.match(audit, /deactivate_account/);
    assert.match(audit, /reactivate_account/);
    assert.match(audit, /getoblic_super_admin_audit/);
    // Durable audit only on success; failures remain console-audited.
    assert.match(audit, /if \(!event\.success\)/);
    assert.match(audit, /console\.error\("getoblic_super_admin_audit insert failed:/);
  });

  it("Licensee sub-account create rejects Super Admin email overlap", () => {
    const service = read("services/licensee/licenseeSubAccounts.ts");
    assert.match(service, /SUPER_ADMIN_EMAIL_REJECTED/);
    assert.match(service, /isGetOblicSuperAdminUser/);
  });
});
