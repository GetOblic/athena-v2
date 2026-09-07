/**
 * UX-only privileged product-route gates.
 *
 * Marker cookies are routing hints, not authorization. Identity remains
 * getoblic_super_admins / licensee_accounts / tenant resolution on the server.
 *
 * When both privileged markers coexist, neither cookie-only gate may fire —
 * that combination is what produced the /licensee ↔ /super redirect cycle.
 */

export type PrivilegedUxMarkerGateInput = {
  path: string;
  isPublicPath: boolean;
  isApiPath: boolean;
  isSuperPath: boolean;
  isLicenseePath: boolean;
  hasSuperMarker: boolean;
  hasMasterMarker: boolean;
  hasOriginCookie: boolean;
};

export type PrivilegedUxMarkerGateResult =
  | { kind: "next" }
  | { kind: "redirect"; pathname: "/super" | "/licensee" }
  | {
      kind: "api_forbidden";
      code: "SUPER_ADMIN_CONTEXT" | "LICENSEE_MASTER_CONTEXT";
    };

export function hasConflictingPrivilegedUxMarkers(input: {
  hasSuperMarker: boolean;
  hasMasterMarker: boolean;
}): boolean {
  return input.hasSuperMarker && input.hasMasterMarker;
}

export function resolvePrivilegedUxMarkerGate(
  input: PrivilegedUxMarkerGateInput,
): PrivilegedUxMarkerGateResult {
  if (
    hasConflictingPrivilegedUxMarkers({
      hasSuperMarker: input.hasSuperMarker,
      hasMasterMarker: input.hasMasterMarker,
    })
  ) {
    return { kind: "next" };
  }

  if (
    input.hasSuperMarker &&
    !input.isSuperPath &&
    !input.isPublicPath &&
    !input.path.startsWith("/api/super/")
  ) {
    if (input.isApiPath) {
      return { kind: "api_forbidden", code: "SUPER_ADMIN_CONTEXT" };
    }
    return { kind: "redirect", pathname: "/super" };
  }

  if (
    input.hasMasterMarker &&
    !input.hasOriginCookie &&
    !input.isLicenseePath &&
    !input.isPublicPath &&
    !input.path.startsWith("/api/licensee/")
  ) {
    if (input.isApiPath) {
      return { kind: "api_forbidden", code: "LICENSEE_MASTER_CONTEXT" };
    }
    return { kind: "redirect", pathname: "/licensee" };
  }

  return { kind: "next" };
}
