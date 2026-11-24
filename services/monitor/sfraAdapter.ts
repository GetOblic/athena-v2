/**
 * SFRA sources stay registered.
 * Production execution is access_blocked until unattended extraction is demonstrated.
 * This module does not launch a browser, a proxy, or a hosted scraping service.
 * Gate 2 parsers remain in prototype/monitor/adapters/sfra.ts.
 */

import type {
  MonitorAdapterResult,
  MonitorProductionAdapter,
} from "@/services/monitor/monitorAdapter";
import { MONITOR_ADAPTER_VERSION } from "@/services/monitor/monitorTypes";

export const SFRA_REGISTERED_SOURCE_IDS = ["breal", "bonobo", "cache-cache"] as const;

const BLOCKED: MonitorAdapterResult<never> = {
  ok: false,
  code: "access_blocked",
  message: "SFRA production access is blocked until unattended extraction is demonstrated.",
};

export const sfraProductionAdapter: MonitorProductionAdapter = {
  id: "sfra",
  version: MONITOR_ADAPTER_VERSION,
  recognizes(sourceId: string): boolean {
    return (SFRA_REGISTERED_SOURCE_IDS as readonly string[]).includes(sourceId);
  },
  async discoverCategories() {
    return BLOCKED;
  },
  async enumerateScope() {
    return BLOCKED;
  },
  async extractFamily() {
    return BLOCKED;
  },
};
