/**
 * Known Monitor sources.
 * Toscane is the only production-feasible source in this gate.
 * SFRA brands stay registered so saved configuration can name them,
 * and execution marks them blocked without a network request.
 * Category shapes follow the Gate 2 prototype classifiers.
 */

export const MONITOR_PRODUCTION_ACCESS = ["feasible", "blocked"] as const;

export type MonitorProductionAccess = (typeof MONITOR_PRODUCTION_ACCESS)[number];

export type MonitorSourceAdapter = "solusquare" | "sfra";

export type MonitorSourceDefinition = {
  id: string;
  displayName: string;
  registrableDomain: string;
  adapter: MonitorSourceAdapter;
  productionAccess: MonitorProductionAccess;
  blockedReason: "PRODUCTION_ACCESS_BLOCKED" | null;
};

export const MONITOR_SOURCES: readonly MonitorSourceDefinition[] = [
  {
    id: "toscane",
    displayName: "Toscane",
    registrableDomain: "toscane-boutique.fr",
    adapter: "solusquare",
    productionAccess: "feasible",
    blockedReason: null,
  },
  {
    id: "breal",
    displayName: "Bréal",
    registrableDomain: "breal.net",
    adapter: "sfra",
    productionAccess: "blocked",
    blockedReason: "PRODUCTION_ACCESS_BLOCKED",
  },
  {
    id: "bonobo",
    displayName: "Bonobo",
    registrableDomain: "bonoboplanet.com",
    adapter: "sfra",
    productionAccess: "blocked",
    blockedReason: "PRODUCTION_ACCESS_BLOCKED",
  },
  {
    id: "cache-cache",
    displayName: "Cache Cache",
    registrableDomain: "cache-cache.fr",
    adapter: "sfra",
    productionAccess: "blocked",
    blockedReason: "PRODUCTION_ACCESS_BLOCKED",
  },
];

const BY_ID = new Map(MONITOR_SOURCES.map((source) => [source.id, source]));

const SFRA_PRODUCT = /-\d{12,}\.html$/i;
const SFRA_CATEGORY = /-(?:sc|c|tp)_[0-9a-z]+$/i;
const SOLUSQUARE_PRODUCT = /-p-\d+-coul-\d+\.htm$/i;
const SOLUSQUARE_CATEGORY = /-c-\d+\.htm$/i;
const SOLUSQUARE_COLOR_LISTING = /-cl-\d+\.htm$/i;
const SOLUSQUARE_PAGE = /-page-\d+\.htm$/i;

const HARD_DENY = [
  /\/on\/demandware\.store\//i,
  /product-variation/i,
  /[?&]dwvar_/i,
  /[?&]q=/i,
  /[?&]pid=/i,
  /[?&]cgid=/i,
  /[?&]pmin=/i,
  /[?&]pmax=/i,
  /[?&]prefn\d*=/i,
  /[?&]prefv\d*=/i,
  /[?&]variantid=/i,
  /\/e_commerce\/xml\//i,
  /\+/,
];

export function getMonitorSource(sourceId: string): MonitorSourceDefinition | null {
  return BY_ID.get(sourceId) ?? null;
}

export function hostMatchesRegistrableDomain(
  hostname: string,
  registrableDomain: string,
): boolean {
  const host = hostname.toLowerCase().replace(/\.$/, "");
  return host === registrableDomain || host.endsWith(`.${registrableDomain}`);
}

export function isHardDeniedMonitorUrl(rawUrl: string): boolean {
  return HARD_DENY.some((pattern) => pattern.test(rawUrl));
}

export function isMonitorCategoryUrl(sourceId: string, rawUrl: string): boolean {
  const source = getMonitorSource(sourceId);
  if (!source) return false;
  let parsed: URL;
  try {
    parsed = new URL(rawUrl);
  } catch {
    return false;
  }
  if (parsed.protocol !== "https:") return false;
  if (parsed.username || parsed.password) return false;
  if (!hostMatchesRegistrableDomain(parsed.hostname, source.registrableDomain)) {
    return false;
  }
  if (isHardDeniedMonitorUrl(rawUrl)) return false;
  const path = decodeURIComponent(parsed.pathname);
  if (source.adapter === "sfra") {
    return SFRA_CATEGORY.test(path) && !SFRA_PRODUCT.test(path);
  }
  return (
    SOLUSQUARE_CATEGORY.test(path) &&
    !SOLUSQUARE_COLOR_LISTING.test(path) &&
    !SOLUSQUARE_PAGE.test(path) &&
    !SOLUSQUARE_PRODUCT.test(path)
  );
}

export function isMonitorWebsiteUrl(sourceId: string, rawUrl: string): boolean {
  const source = getMonitorSource(sourceId);
  if (!source) return false;
  let parsed: URL;
  try {
    parsed = new URL(rawUrl);
  } catch {
    return false;
  }
  if (parsed.protocol !== "https:") return false;
  if (parsed.username || parsed.password) return false;
  if (!hostMatchesRegistrableDomain(parsed.hostname, source.registrableDomain)) {
    return false;
  }
  return !isHardDeniedMonitorUrl(rawUrl);
}
