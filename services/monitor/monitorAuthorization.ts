/**
 * Full Athena authorization for every Monitor operation.
 * Reuses resolveAthenaPlan and requireCurrentOrganizationContext.
 * Does not modify the global plan resolver or Free quota behavior.
 * Stored Monitor rows are left in place when access is denied.
 */

import type { AthenaPlan } from "@/services/athenaPlan";
import { MonitorOperationError } from "@/services/monitor/monitorErrors";
import type { MonitorOrganizationContext } from "@/services/monitor/monitorTypes";

export type MonitorPlanResolver = (organizationId: string) => Promise<AthenaPlan>;

export type MonitorOrganizationContextResolver = () => Promise<MonitorOrganizationContext>;

export async function assertFullAthenaMonitorAccess(
  organizationId: string,
  resolvePlan: MonitorPlanResolver,
): Promise<void> {
  const id = organizationId.trim();
  if (!id) {
    throw new MonitorOperationError("ENTITLEMENT_REQUIRED", "Full Athena is required.");
  }
  const plan = await resolvePlan(id);
  if (plan !== "full") {
    throw new MonitorOperationError("ENTITLEMENT_REQUIRED", "Full Athena is required.");
  }
}

export async function defaultResolveMonitorPlan(
  organizationId: string,
): Promise<AthenaPlan> {
  const { resolveAthenaPlan } = await import("@/services/organizationService");
  return resolveAthenaPlan(organizationId);
}

export async function defaultMonitorOrganizationContext(): Promise<MonitorOrganizationContext> {
  const { requireCurrentOrganizationContext } = await import("@/services/organizationService");
  return requireCurrentOrganizationContext();
}

export async function requireMonitorOperatorContext(deps?: {
  requireOrganizationContext?: MonitorOrganizationContextResolver;
  resolvePlan?: MonitorPlanResolver;
}): Promise<MonitorOrganizationContext> {
  const requireOrganizationContext =
    deps?.requireOrganizationContext ?? defaultMonitorOrganizationContext;
  const resolvePlan = deps?.resolvePlan ?? defaultResolveMonitorPlan;
  const context = await requireOrganizationContext();
  await assertFullAthenaMonitorAccess(context.organizationId, resolvePlan);
  return context;
}
