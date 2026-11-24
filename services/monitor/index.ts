/**
 * Public Monitor foundation.
 * The Supabase adapter is loaded by createSupabaseMonitorStore, not by these exports.
 */

export {
  assertFullAthenaMonitorAccess,
  requireMonitorOperatorContext,
} from "@/services/monitor/monitorAuthorization";
export { compareMonitorExecutions } from "@/services/monitor/monitorComparison";
export { parseMonitorConfiguration, selectionsEqual } from "@/services/monitor/monitorConfig";
export { planSharedObservationReuse, dedupeProductFamilies } from "@/services/monitor/monitorReuse";
export { normalizeSupportedWebsite } from "@/services/monitor/monitorWebsiteIdentity";
export { listMonitorCriterionIds, matchMonitorCriterion } from "@/services/monitor/monitorCriterion";
export { createMemoryMonitorService, createMonitorService } from "@/services/monitor/monitorService";
export {
  ATHENA_MONITOR_FRESHNESS,
  ATHENA_MONITOR_WORKER_DEFAULTS,
  ATHENA_MONITOR_WORKER_NAME,
} from "@/services/monitor/monitorRuntime";
export { MONITOR_SOURCES } from "@/services/monitor/monitorSources";
