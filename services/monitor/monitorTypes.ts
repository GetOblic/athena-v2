/**
 * Versioned Monitor domain records.
 * JSON documents stored in Supabase use these camelCase fields.
 * Table columns stay snake_case and are mapped at the persistence boundary.
 */

export const MONITOR_CONFIGURATION_VERSION = 1 as const;

export const MONITOR_OBSERVATION_PAYLOAD_VERSION = 1 as const;

export const MONITOR_JOB_STATUSES = [
  "queued",
  "processing",
  "completed",
  "partial",
  "failed",
  "blocked",
  "cancelled",
] as const;

export type MonitorJobStatus = (typeof MONITOR_JOB_STATUSES)[number];

export const MONITOR_TERMINAL_JOB_STATUSES = [
  "completed",
  "partial",
  "failed",
  "blocked",
  "cancelled",
] as const;

export type MonitorTerminalStatus = (typeof MONITOR_TERMINAL_JOB_STATUSES)[number];

export const MONITOR_ACTIVE_JOB_STATUSES = ["queued", "processing"] as const;

export type MonitorActiveJobStatus = (typeof MONITOR_ACTIVE_JOB_STATUSES)[number];

export type WholeCatalogSelection = {
  mode: "whole_catalog";
};

export type CategorySelection = {
  mode: "categories";
  categoryUrls: string[];
  /**
   * Stable discovered category identities.
   * An empty list together with an empty URL list is invalid.
   * It is never treated as a whole-catalog selection.
   */
  categoryIds?: string[];
};

export type MonitorSelection = WholeCatalogSelection | CategorySelection;

export type MonitorSourceConfiguration = {
  sourceId: string;
  websiteUrl: string;
  selection: MonitorSelection;
};

/**
 * Confirmed structured criterion.
 * The initial registry entry is distinctColorPatternCount >= minimum.
 * Additional ids are a new configuration version, not free-form code.
 */
export type MonitorCriterion = {
  id: string;
  operator: "gte";
  minimum: number;
};

export type MonitorConfiguration = {
  version: typeof MONITOR_CONFIGURATION_VERSION;
  name: string;
  objective: string;
  sources: MonitorSourceConfiguration[];
  criterion: MonitorCriterion;
};

export type SavedMonitor = {
  id: string;
  organizationId: string;
  name: string;
  configurationVersion: number;
  configuration: MonitorConfiguration;
  lastSuccessfulJobId: string | null;
  lastSuccessfulAt: string | null;
  createdBy: string | null;
  createdAt: string;
  updatedAt: string;
};

export const MONITOR_SOURCE_COVERAGE_STATUSES = [
  "pending",
  "discovering",
  "extracting",
  "completed",
  "partial",
  "failed",
  "blocked",
  "cancelled",
] as const;

export type MonitorSourceCoverageStatus =
  (typeof MONITOR_SOURCE_COVERAGE_STATUSES)[number];

/**
 * Private job coverage. discoveryStatus is the shared enumeration result.
 * A completed job status with a partial or failed discovery must not be read
 * as proof that every product family in the scope was seen.
 */
export type MonitorDiscoveryStatus = "completed" | "partial" | "failed";

export type MonitorSourceCoverage = {
  sourceId: string;
  status: MonitorSourceCoverageStatus;
  selection: MonitorSelection;
  errorCode: string | null;
  familiesAnalyzed: number;
  discoveryStatus?: MonitorDiscoveryStatus | null;
  discoveryScopeKey?: string | null;
  discoveryCoverageId?: string | null;
  discoveredAt?: string | null;
  /** Families enumerated for this source. A completed source must account for every one. */
  familiesDiscovered?: number;
  familiesExtracted?: number;
  familiesReused?: number;
  familiesMatching?: number;
  familiesFailed?: number;
  /** Present when extraction failed. A completed source cannot carry any of these. */
  failedFamilyIds?: string[];
};

export type MonitorCursorPhase = "discover" | "extract";

export type MonitorExecutionCursorSource = {
  sourceId: string;
  phase: MonitorCursorPhase;
  nextIndex: number;
  categoryUrl: string | null;
  /** Representative product URLs collected while enumerating. Keys are family ids. */
  familyUrls?: Record<string, string>;
  /** Category keys that contain each family. Whole-catalog sitemap runs may omit this. */
  familyCategories?: Record<string, string[]>;
};

export type MonitorExecutionCursor = {
  version: 1;
  sources: MonitorExecutionCursorSource[];
};

export type MonitorProgress = {
  version: 1;
  familiesDiscovered: number;
  familiesAnalyzed: number;
  familiesPersisted: number;
  currentSourceId?: string | null;
  /** Discovery and extraction stay distinct so a future UI does not collapse them. */
  phase?: MonitorCursorPhase | null;
  categoriesSelected?: number;
  familiesExtracted?: number;
  familiesReused?: number;
  familiesMatching?: number;
  familiesFailed?: number;
  updatedAt?: string | null;
  /**
   * Set at enqueue for a force-fresh search.
   * The worker reads it. Later progress writes must keep it.
   */
  forceFresh?: boolean;
};

export type MonitorJob = {
  id: string;
  organizationId: string;
  monitorId: string;
  status: MonitorJobStatus;
  configurationVersion: number;
  configurationSnapshot: MonitorConfiguration;
  claimedBy: string | null;
  claimToken: string | null;
  claimedAt: string | null;
  claimExpiresAt: string | null;
  heartbeatAt: string | null;
  /** Overall execution bound. Heartbeats and new claims cannot move it later. */
  executionDeadlineAt: string | null;
  /** Current batch bound. Yielding starts a new batch bound without moving the overall deadline. */
  batchDeadlineAt: string | null;
  /** Single public-page request bound. It does not extend the batch or the overall deadline. */
  requestTimeoutMs: number | null;
  /** Set when a batch yields. Claim order uses it so a large catalog does not stay first. */
  batchCompletedAt: string | null;
  cancellationRequestedAt: string | null;
  progress: MonitorProgress;
  sourceCoverage: MonitorSourceCoverage[];
  executionCursor: MonitorExecutionCursor;
  errorCode: string | null;
  errorMessage: string | null;
  errorMetadata: Record<string, unknown> | null;
  attemptCount: number;
  startedAt: string | null;
  completedAt: string | null;
  createdAt: string;
  updatedAt: string;
};

export type MonitorObservationPayload = {
  version: typeof MONITOR_OBSERVATION_PAYLOAD_VERSION;
  productName: string | null;
  category: string | null;
  price: {
    amount: string | null;
    currency: string | null;
  };
  colorPatternIds: string[] | null;
  colorPatternNames: string[] | null;
  distinctVariationCount: number | null;
  sizes: string[] | null;
  lengths: string[] | null;
  imageUrl: string | null;
  thresholdMatch: boolean | null;
};

export type MonitorObservation = {
  id: string;
  organizationId: string;
  monitorId: string;
  jobId: string;
  sourceId: string;
  familyId: string;
  productUrl: string;
  /** Actual public observation time. Reuse does not replace this with the job time. */
  observedAt: string;
  thresholdMatch: boolean | null;
  payloadVersion: number;
  /** Hydrated from the shared public observation. It is not a second stored product payload. */
  payload: MonitorObservationPayload;
  publicObservationId: string;
  sharedSourceId: string;
  reused: boolean;
  adapterId: string;
  adapterVersion: string;
  schemaVersion: number;
  contentKey: string;
  categoryIds: string[];
  discoveryCoverageId: string | null;
  createdAt: string;
};

export const MONITOR_PUBLIC_SCHEMA_VERSION = 1 as const;

export const MONITOR_ADAPTER_VERSION = "2" as const;

export const MONITOR_SHARED_ACCESS_STATUSES = ["feasible", "blocked", "cooldown"] as const;

export type MonitorSharedAccessStatus = (typeof MONITOR_SHARED_ACCESS_STATUSES)[number];

export const MONITOR_SHARED_DISCOVERY_STATUSES = ["pending", "current", "failed"] as const;

export type MonitorSharedDiscoveryStatus =
  (typeof MONITOR_SHARED_DISCOVERY_STATUSES)[number];

/**
 * Canonical public website. No organization, objective, criterion, or customer identity.
 */
export type SharedMonitorSource = {
  id: string;
  normalizedHost: string;
  canonicalUrl: string;
  registeredSourceId: string;
  platform: string;
  adapterId: string;
  adapterVersion: string;
  extractionConfig: MonitorExtractionConfig;
  discoveryStatus: MonitorSharedDiscoveryStatus;
  lastDiscoveredAt: string | null;
  accessStatus: MonitorSharedAccessStatus;
  retryAfter: string | null;
  createdAt: string;
  updatedAt: string;
};

export type MonitorExtractionConfig = {
  version: 1;
  registrableDomain: string;
  adapterId: string;
  adapterVersion: string;
  platform: string;
};

export type SharedMonitorCategory = {
  id: string;
  sourceId: string;
  categoryKey: string;
  displayName: string;
  canonicalUrl: string;
  parentCategoryId: string | null;
  parentCategoryKey: string | null;
  discoveredAt: string;
  discoveryStatus: "current" | "removed" | "partial";
  productFamilyCount: number | null;
  productFamilyCountBasis: "verified" | "estimated" | null;
  createdAt: string;
  updatedAt: string;
};

export type SharedObservationProvenance = {
  version: 1;
  adapterId: string;
  adapterVersion: string;
  schemaVersion: number;
  categoryIds: string[];
};

export type SharedPublicObservation = {
  id: string;
  sourceId: string;
  registeredSourceId: string;
  familyId: string;
  adapterId: string;
  adapterVersion: string;
  schemaVersion: number;
  productName: string | null;
  canonicalUrl: string;
  priceAmount: string | null;
  currency: string | null;
  colorPatternIds: string[] | null;
  colorPatternNames: string[] | null;
  distinctVariationCount: number | null;
  sizes: string[] | null;
  lengths: string[] | null;
  imageUrl: string | null;
  /** Published category label. It is not part of the public content key. */
  categoryName: string | null;
  observedAt: string;
  provenance: SharedObservationProvenance;
  contentKey: string;
  createdAt: string;
};

/**
 * Immutable shared enumeration of one exact scope.
 * Product rows alone are not a substitute for a completed row here.
 */
export type SharedDiscoveryCoverage = {
  id: string;
  sourceId: string;
  scopeKind: "category" | "whole_catalog";
  categoryId: string | null;
  scopeKey: string;
  status: MonitorDiscoveryStatus;
  adapterId: string;
  adapterVersion: string;
  schemaVersion: number;
  discoveredAt: string;
  familyIds: string[];
  familyCount: number;
  createdAt: string;
};

export type SharedReusePlan = {
  normalizedHost: string;
  registeredSourceId: string;
  forceFresh: boolean;
  categoryListFresh: boolean;
  coverageStatus: MonitorDiscoveryStatus | "missing";
  coverageFresh: boolean;
  exactScope: boolean;
  reusable: Array<{
    familyId: string;
    publicObservationId: string;
    observedAt: string;
    reused: true;
  }>;
  missingOrStaleFamilyIds: string[];
  networkRequestsRequired: boolean;
  missingProductConclusionAllowed: boolean;
  accessCooldown: boolean;
};

export type MonitorOrganizationContext = {
  organizationId: string;
  userId: string;
};

export function isTerminalMonitorStatus(
  status: MonitorJobStatus,
): status is MonitorTerminalStatus {
  return (
    status === "completed" ||
    status === "partial" ||
    status === "failed" ||
    status === "blocked" ||
    status === "cancelled"
  );
}

export function isActiveMonitorStatus(
  status: MonitorJobStatus,
): status is MonitorActiveJobStatus {
  return status === "queued" || status === "processing";
}
