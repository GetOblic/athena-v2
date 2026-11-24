import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { parseMonitorConfiguration } from "../../services/monitor/monitorConfig";
import { listMonitorCriterionIds } from "../../services/monitor/monitorCriterion";
import { MonitorOperationError } from "../../services/monitor/monitorErrors";
import { isMonitorCategoryUrl } from "../../services/monitor/monitorSources";
import { classifyEntryUrl } from "../../prototype/monitor/discover";
import { ORG_A, USER_A, createFoundation, mixedConfiguration, toscaneConfiguration } from "./helpers";

describe("Monitor configuration contract", () => {
  it("accepts a named multi-source configuration with an explicit whole catalog and categories", () => {
    const parsed = parseMonitorConfiguration(mixedConfiguration());
    assert.equal(parsed.version, 1);
    assert.equal(parsed.sources[0]?.selection.mode, "whole_catalog");
    assert.equal(parsed.sources[1]?.selection.mode, "categories");
    assert.deepEqual(listMonitorCriterionIds(), ["distinctColorPatternCount"]);
    assert.equal(parsed.criterion.operator, "gte");
  });

  it("keeps category classification aligned with the Gate 2 prototype", () => {
    const brealCategory = "https://www.breal.net/jeans-femme-sc_010300";
    const brealProduct = "https://www.breal.net/jean-test-noir-femme-36125188430060100.html";
    const toscaneCategory = "https://www.toscane-boutique.fr/fr/pantalons-c-42.htm";
    const toscaneProduct =
      "https://www.toscane-boutique.fr/fr/pantalons/toscane/tregging-uni-p-9330-coul-12.htm";
    assert.equal(isMonitorCategoryUrl("breal", brealCategory), classifyEntryUrl(brealCategory, "sfra") === "category");
    assert.equal(isMonitorCategoryUrl("breal", brealProduct), classifyEntryUrl(brealProduct, "sfra") === "category");
    assert.equal(
      isMonitorCategoryUrl("toscane", toscaneCategory),
      classifyEntryUrl(toscaneCategory, "solusquare") === "category",
    );
    assert.equal(
      isMonitorCategoryUrl("toscane", toscaneProduct),
      classifyEntryUrl(toscaneProduct, "solusquare") === "category",
    );
    assert.equal(
      isMonitorCategoryUrl(
        "breal",
        "https://www.breal.net/on/demandware.store/Sites-BRL_FR_SFRA-Site/fr_FR/Product-Variation?dwvar_1_color=100",
      ),
      false,
    );
  });

  it("rejects executable fields, unknown criteria, and incomplete selections", () => {
    const base = toscaneConfiguration();
    assert.throws(
      () => parseMonitorConfiguration({ ...base, script: "return fetch(url)" }),
      (error: unknown) => error instanceof MonitorOperationError && error.code === "INVALID_CONFIGURATION",
    );
    assert.throws(
      () =>
        parseMonitorConfiguration({
          ...base,
          criterion: { id: "generatedScraper", operator: "gte", minimum: 2 },
        }),
      (error: unknown) => error instanceof MonitorOperationError && error.code === "INVALID_CONFIGURATION",
    );
    assert.throws(
      () =>
        parseMonitorConfiguration({
          ...base,
          sources: [
            {
              sourceId: "toscane",
              websiteUrl: "http://www.toscane-boutique.fr/",
              selection: { mode: "whole_catalog" },
            },
          ],
        }),
      (error: unknown) => error instanceof MonitorOperationError && error.code === "INVALID_CONFIGURATION",
    );
    assert.throws(
      () =>
        parseMonitorConfiguration({
          ...base,
          sources: [
            {
              sourceId: "toscane",
              websiteUrl: "https://www.toscane-boutique.fr/",
              selection: { mode: "categories", categoryUrls: [] },
            },
          ],
        }),
      (error: unknown) => error instanceof MonitorOperationError && error.code === "INVALID_CONFIGURATION",
    );
    assert.throws(
      () =>
        parseMonitorConfiguration({
          ...base,
          criterion: { id: "distinctColorPatternCount", operator: "gte", minimum: 0 },
        }),
      (error: unknown) => error instanceof MonitorOperationError && error.code === "INVALID_CONFIGURATION",
    );
  });

  it("stores timestamps and leaves an edited monitor's earlier snapshot unchanged", async () => {
    const { service, clock } = createFoundation({ plans: { [ORG_A]: "full" } });
    const created = await service.createMonitor({
      organizationId: ORG_A,
      userId: USER_A,
      configuration: toscaneConfiguration({ minimum: 3 }),
    });
    const job = await service.enqueueMonitorJob({
      organizationId: ORG_A,
      monitorId: created.id,
    });
    clock.advance(1_000);
    const updated = await service.updateMonitor({
      organizationId: ORG_A,
      monitorId: created.id,
      configuration: toscaneConfiguration({ name: "Renamed", minimum: 5 }),
    });
    const storedJob = await service.getMonitorJob(ORG_A, job.id);
    assert.equal(updated.name, "Renamed");
    assert.equal(updated.configuration.criterion.minimum, 5);
    assert.notEqual(updated.updatedAt, created.updatedAt);
    assert.equal(created.createdAt, updated.createdAt);
    assert.equal(storedJob.configurationSnapshot.criterion.minimum, 3);
    assert.equal(storedJob.configurationSnapshot.name, "Toscane colors");
    assert.equal(updated.lastSuccessfulJobId, null);
  });
});
