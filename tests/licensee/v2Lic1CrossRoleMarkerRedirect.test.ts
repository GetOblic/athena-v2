import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, it } from "node:test";
import {
  hasConflictingPrivilegedUxMarkers,
  resolvePrivilegedUxMarkerGate,
  type PrivilegedUxMarkerGateInput,
} from "../../lib/supabase/privilegedUxMarkerGates";
import { LICENSEE_MASTER_MARKER_COOKIE } from "../../services/licensee/licenseeCookieNames";
import { licenseeMasterMarkerCookieClearOptions } from "../../services/licensee/licenseeMasterMarkerCookie";
import { SUPER_ADMIN_MARKER_COOKIE } from "../../services/superAdmin/superAdminCookieNames";
import { superAdminMarkerCookieClearOptions } from "../../services/superAdmin/superAdminMarkerCookie";

const ROOT = process.cwd();

function read(relativePath: string): string {
  return readFileSync(join(ROOT, relativePath), "utf8");
}

function sliceBetween(source: string, startMarker: string, endMarker: string): string {
  const start = source.indexOf(startMarker);
  assert.ok(start >= 0, `missing start marker: ${startMarker}`);
  const end = source.indexOf(endMarker, start + startMarker.length);
  assert.ok(end >= 0, `missing end marker: ${endMarker}`);
  return source.slice(start, end);
}

function classifyPath(path: string) {
  const isApiPath = path.startsWith("/api/");
  return {
    path,
    isApiPath,
    isPublicPath:
      path === "/login" ||
      path === "/licensee/login" ||
      path === "/super/login" ||
      path.startsWith("/auth/callback") ||
      path.startsWith("/api/ingestion") ||
      path.startsWith("/api/licensee/origin") ||
      path.startsWith("/_next") ||
      path === "/favicon.ico",
    isLicenseePath: path === "/licensee" || path.startsWith("/licensee/"),
    isSuperPath: path === "/super" || path.startsWith("/super/"),
  };
}

function gateFor(
  path: string,
  markers: {
    hasSuperMarker: boolean;
    hasMasterMarker: boolean;
    hasOriginCookie?: boolean;
  },
) {
  const classified = classifyPath(path);
  const input: PrivilegedUxMarkerGateInput = {
    ...classified,
    hasSuperMarker: markers.hasSuperMarker,
    hasMasterMarker: markers.hasMasterMarker,
    hasOriginCookie: markers.hasOriginCookie ?? false,
  };
  return resolvePrivilegedUxMarkerGate(input);
}

function walkProductRoutes(
  startPath: string,
  markers: { hasSuperMarker: boolean; hasMasterMarker: boolean },
  maxHops = 8,
) {
  const seen: string[] = [];
  let path = startPath;

  for (let i = 0; i < maxHops; i += 1) {
    if (seen.includes(path)) {
      return { cycled: true, seen, stopped: path };
    }
    seen.push(path);
    const result = gateFor(path, markers);
    if (result.kind !== "redirect") {
      return { cycled: false, seen, stopped: path, result };
    }
    path = result.pathname;
  }

  return { cycled: false, seen, stopped: path };
}

describe("V2-LIC-1 — cross-role privileged UX marker redirect loop", () => {
  it("A. Licensee OTP success clears stale Super marker and destinations /licensee", () => {
    const login = read("app/licensee/login/page.tsx");
    const verifyCode = sliceBetween(
      login,
      "async function verifyCode",
      "return (",
    );

    assert.match(verifyCode, /isLicenseeMasterUser/);
    assert.match(verifyCode, /licenseeMasterMarkerCookieWriteOptions/);
    assert.match(verifyCode, /superAdminMarkerCookieClearOptions/);
    assert.match(verifyCode, /redirect\("\/licensee"\)/);
    assert.doesNotMatch(verifyCode, /provisionTenantForAuthenticatedUser/);

    const clearSuper = superAdminMarkerCookieClearOptions();
    assert.equal(clearSuper.name, SUPER_ADMIN_MARKER_COOKIE);
    assert.equal(clearSuper.maxAge, 0);
  });

  it("B. Super OTP success clears stale Licensee marker and destinations /super", () => {
    const login = read("app/super/login/page.tsx");
    const verifyCode = sliceBetween(
      login,
      "async function verifyCode",
      "return (",
    );

    assert.match(verifyCode, /isGetOblicSuperAdminUser/);
    assert.match(verifyCode, /superAdminMarkerCookieWriteOptions/);
    assert.match(verifyCode, /licenseeMasterMarkerCookieClearOptions/);
    assert.match(verifyCode, /redirect\("\/super"\)/);
    assert.doesNotMatch(verifyCode, /provisionTenantForAuthenticatedUser/);

    const clearLicensee = licenseeMasterMarkerCookieClearOptions();
    assert.equal(clearLicensee.name, LICENSEE_MASTER_MARKER_COOKIE);
    assert.equal(clearLicensee.maxAge, 0);
  });

  it("magic-link finalization establishes one privileged marker and clears the other", () => {
    const callback = read("app/auth/callback/route.ts");
    const helper = sliceBetween(
      callback,
      "function redirectWithControlPlaneMarker",
      "async function finalizeAuthenticatedUser",
    );

    assert.match(helper, /applySuperAdminMarkerCookie/);
    assert.match(helper, /clearLicenseeMasterMarkerCookie/);
    assert.match(helper, /applyLicenseeMasterMarkerCookie/);
    assert.match(helper, /clearSuperAdminMarkerCookie/);
    assert.match(callback, /isGetOblicSuperAdminUser/);
    assert.match(callback, /isLicenseeMasterUser/);
    assert.match(
      callback,
      /provisionTenantForAuthenticatedUser\(\s*userId,\s*email\s*\)/,
    );
  });

  it("marker refresh of one privileged role clears the contradictory marker", () => {
    const licenseeRefresh = read("app/api/licensee/master-marker/route.ts");
    const superRefresh = read("app/api/super/marker/route.ts");

    assert.match(licenseeRefresh, /applyLicenseeMasterMarkerCookie/);
    assert.match(licenseeRefresh, /clearSuperAdminMarkerCookie/);
    assert.match(licenseeRefresh, /isLicenseeMasterUser/);
    assert.match(superRefresh, /applySuperAdminMarkerCookie/);
    assert.match(superRefresh, /clearLicenseeMasterMarkerCookie/);
    assert.match(superRefresh, /isGetOblicSuperAdminUser/);
  });

  it("C. both markers presented to middleware never cycle /licensee ↔ /super", () => {
    assert.equal(
      hasConflictingPrivilegedUxMarkers({
        hasSuperMarker: true,
        hasMasterMarker: true,
      }),
      true,
    );

    const both = { hasSuperMarker: true, hasMasterMarker: true };
    assert.equal(gateFor("/licensee", both).kind, "next");
    assert.equal(gateFor("/super", both).kind, "next");
    assert.equal(gateFor("/", both).kind, "next");
    assert.equal(gateFor("/api/licensee/sub-accounts", both).kind, "next");
    assert.equal(gateFor("/api/super/accounts", both).kind, "next");

    const fromLicensee = walkProductRoutes("/licensee", both);
    const fromSuper = walkProductRoutes("/super", both);
    const bounce = walkProductRoutes("/licensee", both);
    assert.equal(fromLicensee.cycled, false);
    assert.equal(fromSuper.cycled, false);
    assert.equal(bounce.cycled, false);
    assert.deepEqual(fromLicensee.seen, ["/licensee"]);
    assert.deepEqual(fromSuper.seen, ["/super"]);
  });

  it("D. zero-sub-account Licensee /licensee remains renderable without tenant provisioning", () => {
    const page = read("app/licensee/page.tsx");
    const login = read("app/licensee/login/page.tsx");

    assert.match(page, /getLicenseeAccountByUserId/);
    assert.match(page, /listLicenseeSubAccountsForMaster/);
    assert.doesNotMatch(page, /provisionTenantForAuthenticatedUser/);
    assert.doesNotMatch(page, /from\("organization_members"\)/);
    assert.doesNotMatch(page, /requireCurrentOrganizationContext/);
    assert.doesNotMatch(page, /own_company_organization_id/);
    assert.doesNotMatch(login, /provisionTenantForAuthenticatedUser/);
    assert.doesNotMatch(login, /from\("organization_members"\)/);
  });

  it("E. ordinary tenant routing remains unchanged without privileged markers", () => {
    const none = { hasSuperMarker: false, hasMasterMarker: false };
    assert.equal(gateFor("/", none).kind, "next");
    assert.equal(gateFor("/identity", none).kind, "next");
    assert.equal(gateFor("/api/identity", none).kind, "next");
    assert.equal(gateFor("/login", none).kind, "next");

    const middleware = read("lib/supabase/middleware.ts");
    assert.match(
      middleware,
      /hasSuperMarker\s*\n\s*\? "\/super"\s*\n\s*: hasMasterMarker && !inHandoff\s*\n\s*\? "\/licensee"\s*\n\s*: "\/"/,
    );
  });

  it("F. legitimate Super-only routing remains unchanged", () => {
    const superOnly = { hasSuperMarker: true, hasMasterMarker: false };
    assert.deepEqual(gateFor("/", superOnly), {
      kind: "redirect",
      pathname: "/super",
    });
    assert.deepEqual(gateFor("/licensee", superOnly), {
      kind: "redirect",
      pathname: "/super",
    });
    assert.equal(gateFor("/super", superOnly).kind, "next");
    assert.equal(gateFor("/super/login", superOnly).kind, "next");
    assert.equal(gateFor("/api/super/accounts", superOnly).kind, "next");
    assert.deepEqual(gateFor("/api/identity", superOnly), {
      kind: "api_forbidden",
      code: "SUPER_ADMIN_CONTEXT",
    });

    const walk = walkProductRoutes("/", superOnly);
    assert.equal(walk.cycled, false);
    assert.deepEqual(walk.seen, ["/", "/super"]);
  });

  it("G. legitimate Licensee-only routing remains unchanged", () => {
    const licenseeOnly = { hasSuperMarker: false, hasMasterMarker: true };
    assert.deepEqual(gateFor("/", licenseeOnly), {
      kind: "redirect",
      pathname: "/licensee",
    });
    assert.deepEqual(gateFor("/super", licenseeOnly), {
      kind: "redirect",
      pathname: "/licensee",
    });
    assert.equal(gateFor("/licensee", licenseeOnly).kind, "next");
    assert.equal(gateFor("/licensee/login", licenseeOnly).kind, "next");
    assert.equal(gateFor("/api/licensee/sub-accounts", licenseeOnly).kind, "next");
    assert.deepEqual(gateFor("/api/identity", licenseeOnly), {
      kind: "api_forbidden",
      code: "LICENSEE_MASTER_CONTEXT",
    });

    const withOrigin = gateFor("/", {
      ...licenseeOnly,
      hasOriginCookie: true,
    });
    assert.equal(withOrigin.kind, "next");

    const walk = walkProductRoutes("/", licenseeOnly);
    assert.equal(walk.cycled, false);
    assert.deepEqual(walk.seen, ["/", "/licensee"]);
  });

  it("logout remains role-local and Athena logout still clears both markers", () => {
    const licenseeLogout = read("app/api/licensee/logout/route.ts");
    const superLogout = read("app/api/super/logout/route.ts");
    const athenaLogout = read("app/api/auth/logout/route.ts");

    assert.match(licenseeLogout, /clearLicenseeMasterMarkerCookie/);
    assert.match(licenseeLogout, /\/licensee\/login/);
    assert.match(superLogout, /clearSuperAdminMarkerCookie/);
    assert.match(superLogout, /\/super\/login/);
    assert.match(athenaLogout, /clearLicenseeMasterMarkerCookie/);
    assert.match(athenaLogout, /clearSuperAdminMarkerCookie/);
    assert.match(athenaLogout, /\/login/);
  });

  it("middleware still does not query identity tables or treat markers as authority", () => {
    const middleware = read("lib/supabase/middleware.ts");
    const gates = read("lib/supabase/privilegedUxMarkerGates.ts");
    assert.match(middleware, /SUPER_ADMIN_MARKER_COOKIE/);
    assert.match(middleware, /LICENSEE_MASTER_MARKER_COOKIE/);
    assert.match(middleware, /SUPER_ADMIN_CONTEXT/);
    assert.match(middleware, /LICENSEE_MASTER_CONTEXT/);
    assert.match(middleware, /\/super\/login/);
    assert.match(middleware, /\/licensee\/login/);
    assert.match(gates, /not authorization/i);
    assert.doesNotMatch(middleware, /from\("licensee_accounts"\)/);
    assert.doesNotMatch(middleware, /from\("getoblic_super_admins"\)/);
    assert.doesNotMatch(middleware, /supabaseAdmin/);
    assert.doesNotMatch(middleware, /isLicenseeMasterUser|isGetOblicSuperAdminUser/);
    assert.doesNotMatch(gates, /from\("licensee_accounts"\)/);
    assert.doesNotMatch(gates, /from\("getoblic_super_admins"\)/);
  });
});
