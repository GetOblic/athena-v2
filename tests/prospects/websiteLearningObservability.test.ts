import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, it } from "node:test";
import {
  resolveProspectWebsiteLearningDecision,
  websiteIntelligenceHasUsableContent,
} from "../../services/prospects/prospectWebsiteLearningPolicy";
import {
  logWebsiteLearning,
  toProspectWebsiteLearningLogReason,
} from "../../services/websiteLearning/websiteLearningObservability";
import {
  hasUsableStoredHomepageLearning,
  resolveIdentityWebsiteHomepageText,
} from "../../services/identity/identityHomepageLearning";

const ROOT = process.cwd();

const usableIntel = {
  provider: "homepage_only",
  about: "We help operators scale",
  services: "Automation",
  products: "Platform",
  positioning: "Operator infrastructure",
};

async function captureWebsiteLearningLogs(
  run: () => void | Promise<void>,
): Promise<Array<Record<string, unknown>>> {
  const logs: Array<Record<string, unknown>> = [];
  const original = console.log;
  console.log = ((...args: unknown[]) => {
    if (
      args[0] === "[ATHENA_WEBSITE_LEARNING]" &&
      args[1] &&
      typeof args[1] === "object"
    ) {
      logs.push(args[1] as Record<string, unknown>);
    }
  }) as typeof console.log;

  try {
    await run();
    return logs;
  } finally {
    console.log = original;
  }
}

describe("Website learning observability — Prospect", () => {
  it("initial Prospect generation logs decision=scrape", async () => {
    const decision = resolveProspectWebsiteLearningDecision({
      triggerType: "discussion_import",
      hasWebsite: true,
      websiteIntelligence: null,
    });
    assert.equal(decision.shouldCrawl, true);

    const logs = await captureWebsiteLearningLogs(() => {
      logWebsiteLearning({
        source: "prospect",
        prospectId: "prospect-1",
        triggerType: "discussion_import",
        decision: decision.shouldCrawl ? "scrape" : "reuse",
        reason: toProspectWebsiteLearningLogReason(decision.reason),
        hasStoredIntelligence: websiteIntelligenceHasUsableContent(null),
      });
      logWebsiteLearning({
        source: "prospect",
        prospectId: "prospect-1",
        event: "scrape_completed",
        stored: true,
      });
    });

    assert.equal(logs[0]?.decision, "scrape");
    assert.equal(logs[0]?.reason, "initial_import_missing_intelligence");
    assert.equal(logs[0]?.hasStoredIntelligence, false);
    assert.equal(logs[1]?.event, "scrape_completed");

    const importer = readFileSync(
      path.join(ROOT, "services/prospects/prospectImporter.ts"),
      "utf8",
    );
    assert.match(importer, /logWebsiteLearning/);
    assert.match(importer, /decision: decision\.shouldCrawl \? "scrape" : "reuse"/);
    assert.match(importer, /event: "scrape_completed"/);
  });

  it("refresh logs decision=reuse and no scrape_completed", async () => {
    const decision = resolveProspectWebsiteLearningDecision({
      triggerType: "manual_refresh",
      hasWebsite: true,
      websiteIntelligence: usableIntel,
    });
    assert.equal(decision.shouldCrawl, false);

    const logs = await captureWebsiteLearningLogs(() => {
      logWebsiteLearning({
        source: "prospect",
        prospectId: "prospect-2",
        triggerType: "manual_refresh",
        decision: decision.shouldCrawl ? "scrape" : "reuse",
        reason: toProspectWebsiteLearningLogReason(decision.reason),
        hasStoredIntelligence: true,
      });
    });

    assert.equal(logs.length, 1);
    assert.equal(logs[0]?.decision, "reuse");
    assert.equal(logs[0]?.reason, "non_initial_trigger");
    assert.equal(
      logs.some((entry) => entry.event === "scrape_completed"),
      false,
    );
  });

  it("append logs decision=reuse and no scrape_completed", async () => {
    const decision = resolveProspectWebsiteLearningDecision({
      triggerType: "discussion_update",
      hasWebsite: true,
      websiteIntelligence: usableIntel,
    });
    assert.equal(decision.shouldCrawl, false);

    const logs = await captureWebsiteLearningLogs(() => {
      logWebsiteLearning({
        source: "prospect",
        prospectId: "prospect-3",
        triggerType: "discussion_update",
        decision: "reuse",
        reason: toProspectWebsiteLearningLogReason(decision.reason),
        hasStoredIntelligence: true,
      });
    });

    assert.equal(logs[0]?.decision, "reuse");
    assert.equal(logs[0]?.reason, "non_initial_trigger");
    assert.equal(
      logs.some((entry) => entry.event === "scrape_completed"),
      false,
    );

    assert.equal(
      toProspectWebsiteLearningLogReason("import_retry_reuse_stored"),
      "stored_intelligence_present",
    );
    assert.equal(
      toProspectWebsiteLearningLogReason("no_website"),
      "missing_website",
    );
  });
});

describe("Website learning observability — Brain / Identity", () => {
  it("initial Brain compile logs decision=scrape", async () => {
    assert.equal(hasUsableStoredHomepageLearning(null), false);

    const logs = await captureWebsiteLearningLogs(async () => {
      logWebsiteLearning({
        source: "identity",
        organizationId: "org-1",
        decision: "scrape",
        reason: "missing_homepage_learning",
        hasStoredHomepageLearning: false,
      });
      const resolved = await resolveIdentityWebsiteHomepageText({
        masterProfile: null,
        website: "https://example.com",
        fetchHomepageText: async () => "HOMEPAGE_SECRET_CONTENT",
      });
      if (resolved.scraped) {
        logWebsiteLearning({
          source: "identity",
          organizationId: "org-1",
          event: "scrape_completed",
          stored: Boolean(resolved.text?.trim()),
        });
      }
    });

    assert.equal(logs[0]?.decision, "scrape");
    assert.equal(logs[0]?.reason, "missing_homepage_learning");
    assert.equal(logs[1]?.event, "scrape_completed");
    assert.equal(logs[1]?.stored, true);

    const identitySource = readFileSync(
      path.join(ROOT, "services/identity/identityService.ts"),
      "utf8",
    );
    assert.match(identitySource, /logWebsiteLearning/);
    assert.match(identitySource, /missing_homepage_learning/);
    assert.match(identitySource, /event: "scrape_completed"/);
  });

  it("later Brain compile logs decision=reuse and no scrape_completed", async () => {
    const logs = await captureWebsiteLearningLogs(async () => {
      logWebsiteLearning({
        source: "identity",
        organizationId: "org-1",
        decision: "reuse",
        reason: "stored_homepage_learning_present",
        hasStoredHomepageLearning: true,
      });
      const resolved = await resolveIdentityWebsiteHomepageText({
        masterProfile: { homepage_learning: "PRIOR_HOMEPAGE_LEARNING" },
        website: "https://example.com",
        fetchHomepageText: async () => "MUST_NOT_APPEAR",
      });
      if (resolved.scraped) {
        logWebsiteLearning({
          source: "identity",
          organizationId: "org-1",
          event: "scrape_completed",
          stored: true,
        });
      }
    });

    assert.equal(logs.length, 1);
    assert.equal(logs[0]?.decision, "reuse");
    assert.equal(logs[0]?.reason, "stored_homepage_learning_present");
    assert.equal(
      logs.some((entry) => entry.event === "scrape_completed"),
      false,
    );
  });

  it("logging contains no scraped content", async () => {
    const secret = "PRIVATE_SCRAPED_HTML_AND_PROFILE_TEXT";
    const logs = await captureWebsiteLearningLogs(async () => {
      const resolved = await resolveIdentityWebsiteHomepageText({
        masterProfile: null,
        website: "https://example.com",
        fetchHomepageText: async () => `<html><body>${secret}</body></html>`,
      });
      logWebsiteLearning({
        source: "prospect",
        prospectId: "prospect-safe",
        triggerType: "discussion_import",
        decision: "scrape",
        reason: "initial_import_missing_intelligence",
        hasStoredIntelligence: false,
      });
      logWebsiteLearning({
        source: "prospect",
        prospectId: "prospect-safe",
        event: "scrape_completed",
        stored: true,
      });
      logWebsiteLearning({
        source: "identity",
        organizationId: "org-safe",
        decision: "scrape",
        reason: "missing_homepage_learning",
        hasStoredHomepageLearning: false,
      });
      logWebsiteLearning({
        source: "identity",
        organizationId: "org-safe",
        event: "scrape_completed",
        stored: Boolean(resolved.text?.trim()),
      });
    });

    const serialized = JSON.stringify(logs);
    assert.doesNotMatch(serialized, new RegExp(secret));
    assert.doesNotMatch(serialized, /<html[\s>]|ABOUT YOU:|WEBSITE HOMEPAGE CONTENT:/i);

    const allowedKeys = new Set([
      "source",
      "prospectId",
      "organizationId",
      "triggerType",
      "decision",
      "reason",
      "hasStoredIntelligence",
      "hasStoredHomepageLearning",
      "event",
      "stored",
    ]);

    for (const entry of logs) {
      for (const key of Object.keys(entry)) {
        assert.ok(allowedKeys.has(key), `unexpected log key: ${key}`);
      }
      for (const value of Object.values(entry)) {
        assert.ok(
          value === null ||
            typeof value === "string" ||
            typeof value === "boolean",
        );
        if (typeof value === "string") {
          assert.ok(value.length < 80);
          assert.doesNotMatch(value, /<html[\s>]|PRIVATE_SCRAPED/i);
        }
      }
    }

    const observability = readFileSync(
      path.join(
        ROOT,
        "services/websiteLearning/websiteLearningObservability.ts",
      ),
      "utf8",
    );
    assert.match(
      observability,
      /never content, HTML, prompts, or secrets/i,
    );
  });
});
