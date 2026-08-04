import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, it } from "node:test";
import { mapSeoReportRow } from "../../services/seo/seoReportMappers";
import { toPublicSeoReportDetail } from "../../services/seo/seoReportPublic";

const ROOT = process.cwd();

function read(relativePath: string): string {
  return readFileSync(join(ROOT, relativePath), "utf8");
}

describe("seo report persistence contracts", () => {
  it("maps rows and hides package unless Ready", () => {
    const queued = mapSeoReportRow({
      id: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa",
      organization_id: "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb",
      user_id: null,
      name: "Queued Report",
      brief_json: {},
      status: "Queued",
      generation_stage: "assembling_context",
      package_json: { reportName: "should hide" },
      error_code: null,
      error_message: null,
      created_at: "2026-08-05T00:00:00.000Z",
      updated_at: "2026-08-05T00:00:00.000Z",
    });
    assert.equal(queued.package_json, null);
    assert.equal(toPublicSeoReportDetail(queued).package, null);
  });

  it("service and orchestration follow Ads durable create/enqueue pattern", () => {
    const service = read("services/seo/seoReportService.ts");
    assert.match(service, /from\("seo_reports"\)/);
    assert.match(service, /status: "Queued"/);
    assert.doesNotMatch(service, /from\("discussions"\)/);
    assert.doesNotMatch(service, /from\("ad_campaigns"\)/);

    const orchestration = read("services/seo/seoReportOrchestration.ts");
    assert.match(orchestration, /createSeoReportWithJob/);
    assert.match(orchestration, /enqueueSeoGenerationJob/);
    assert.match(orchestration, /ReadySeoReportImmutableError/);
    assert.match(orchestration, /markSeoReportEnqueueFailed/);
    assert.match(orchestration, /Regenerate creates a NEW report row/);
  });

  it("Ready immutability is enforced in generate route", () => {
    const generate = read("app/api/seo/[id]/generate/route.ts");
    assert.match(generate, /ReadySeoReportImmutableError/);
    assert.match(generate, /409/);
  });
});
