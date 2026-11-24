import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, it } from "node:test";

import { MonitorOperationError } from "../../services/monitor/monitorErrors";
import { ORG_A, ORG_B, createFoundation, toscaneConfiguration } from "./helpers";

describe("Full Athena Monitor authorization", () => {
  it("allows a Full organization and rejects a Free organization before any read", async () => {
    const { service, calls, store } = createFoundation();
    const monitor = await service.createMonitor({
      organizationId: ORG_A,
      userId: null,
      configuration: toscaneConfiguration(),
    });
    calls.length = 0;
    await assert.rejects(
      () => service.listMonitors(ORG_B),
      (error: unknown) => error instanceof MonitorOperationError && error.code === "ENTITLEMENT_REQUIRED",
    );
    assert.equal(calls.includes(`listMonitors:${ORG_B}`), false);
    assert.equal(calls.includes(`getMonitor:${ORG_B}`), false);
    const preserved = await store.getMonitor(ORG_A, monitor.id);
    assert.equal(preserved?.id, monitor.id);
  });

  it("preserves stored monitors when the organization later resolves as Free", async () => {
    const foundation = createFoundation();
    const monitor = await foundation.service.createMonitor({
      organizationId: ORG_A,
      userId: null,
      configuration: toscaneConfiguration(),
    });
    foundation.plans.set(ORG_A, "free");
    await assert.rejects(
      () => foundation.service.getMonitor(ORG_A, monitor.id),
      (error: unknown) => error instanceof MonitorOperationError && error.code === "ENTITLEMENT_REQUIRED",
    );
    assert.equal((await foundation.store.getMonitor(ORG_A, monitor.id))?.name, "Toscane colors");
  });

  it("uses the organization context and does not reimplement the plan catalog", async () => {
    const { service } = createFoundation();
    const context = await service.authorizeOperator();
    assert.equal(context.organizationId, ORG_A);
    const source = readFileSync(
      join(process.cwd(), "services/monitor/monitorAuthorization.ts"),
      "utf8",
    );
    assert.match(source, /resolveAthenaPlan/);
    assert.match(source, /requireCurrentOrganizationContext/);
    assert.doesNotMatch(source, /free_starter|free_visibility|monthly_allowance/);
    assert.equal(
      readFileSync(join(process.cwd(), "services/athenaPlan.ts"), "utf8").includes(
        'export const ATHENA_PLANS = ["full", "free"]',
      ),
      true,
    );
  });

  it("fails closed when plan resolution throws and does not publish observations", async () => {
    const foundation = createFoundation();
    const monitor = await foundation.service.createMonitor({
      organizationId: ORG_A,
      userId: null,
      configuration: toscaneConfiguration(),
    });
    await foundation.service.enqueueMonitorJob({
      organizationId: ORG_A,
      monitorId: monitor.id,
    });
    foundation.plans.delete(ORG_A);
    await assert.rejects(() => foundation.service.claimNextMonitorJob(), /missing plan/);
    assert.equal(foundation.calls.includes("publishObservations"), false);
    const jobs = await foundation.store.getMonitor(ORG_A, monitor.id);
    assert.ok(jobs);
  });
});
