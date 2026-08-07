import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, it } from "node:test";

const ROOT = process.cwd();

function read(relativePath: string): string {
  return readFileSync(join(ROOT, relativePath), "utf8");
}

describe("technical SEO job routing", () => {
  it("executor branches technical vs intelligence pipelines", () => {
    const executor = read(
      "services/seo/seoGenerationJobs/seoGenerationJobExecutor.ts",
    );
    assert.match(executor, /resolveBriefGenerationType/);
    assert.match(executor, /runSeoTechnicalGenerationPipeline/);
    assert.match(executor, /runSeoGenerationPipeline/);
    assert.match(executor, /generationType === "technical"/);
  });

  it("intelligence pipeline remains unchanged in stage order", () => {
    const pipeline = read("services/seo/seoGenerationPipeline.ts");
    assert.match(pipeline, /assembling_context/);
    assert.match(pipeline, /executive_assessment/);
    assert.match(pipeline, /content_coverage/);
    assert.match(pipeline, /customer_intent/);
    assert.match(pipeline, /commercial_opportunities/);
    assert.match(pipeline, /trust_and_authority/);
    assert.match(pipeline, /ninety_day_roadmap/);
    assert.match(pipeline, /validating/);
    assert.doesNotMatch(pipeline, /SEO_TECHNICAL_SHARED_OUTPUT_RULES/);
    assert.match(
      pipeline,
      /not technical crawl audits/,
    );
  });

  it("technical pipeline uses dedicated stages and does not use strategic prohibitions", () => {
    const technical = read("services/seo/seoTechnicalGenerationPipeline.ts");
    assert.match(technical, /analyzing_technical_evidence/);
    assert.match(technical, /technical_executive_evaluation/);
    assert.match(technical, /technical_recommendations/);
    assert.match(technical, /technical_action_plan/);
    assert.match(technical, /analyzeTechnicalSeoEvidence/);
    assert.match(technical, /assessTechnicalSeoEvidenceSufficiency/);
    assert.doesNotMatch(technical, /SEO_TECHNICAL_AUDIT_PROHIBITIONS/);
    assert.doesNotMatch(technical, /FORBIDDEN_TECHNICAL_PATTERNS/);
  });

  it("orchestration blocks technical generation without WI evidence and does not enqueue deep scrape", () => {
    const orchestration = read("services/seo/seoReportOrchestration.ts");
    assert.match(orchestration, /TechnicalSeoEvidenceInsufficientError/);
    assert.match(orchestration, /assessTechnicalSeoEvidenceSufficiency/);
    assert.doesNotMatch(orchestration, /enqueueBrainDeepScrapeJob|runDeepWebsiteCrawl/);
  });
});
