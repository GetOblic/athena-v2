/**
 * Registered production adapters.
 * Solusquare executes. SFRA stays registered and returns access_blocked.
 */

import type { MonitorProductionAdapter } from "@/services/monitor/monitorAdapter";
import { sfraProductionAdapter } from "@/services/monitor/sfraAdapter";
import { solusquareProductionAdapter } from "@/services/monitor/solusquareAdapter";
import { getMonitorSource } from "@/services/monitor/monitorSources";

const ADAPTERS: readonly MonitorProductionAdapter[] = [
  solusquareProductionAdapter,
  sfraProductionAdapter,
];

export function productionAdapterFor(sourceId: string): MonitorProductionAdapter | null {
  const source = getMonitorSource(sourceId);
  if (!source) return null;
  return ADAPTERS.find((adapter) => adapter.id === source.adapter && adapter.recognizes(sourceId)) ?? null;
}

export function listProductionAdapters(): readonly MonitorProductionAdapter[] {
  return ADAPTERS;
}
