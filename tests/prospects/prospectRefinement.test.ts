import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { buildDiscussionDeploymentAssets } from "../../lib/deploymentAssets";
import {
  isProspectLifecycleStatus,
  normalizeProspectLifecycleStatus,
  PROSPECT_LIFECYCLE_STATUSES,
} from "../../services/prospects/prospectLifecycle";
import { parseProspectCsv } from "../../services/prospects/prospectCsv";
import {
  formatNormalizedProspectInputForPipeline,
  normalizeProspectExecutiveInput,
} from "../../services/prospects/prospectNormalization";
import { hasMeaningfulProspectEdit } from "../../services/prospects/prospectUtils";

const ROOT = join(process.cwd());

describe("prospect lifecycle status", () => {
  it("defaults missing lifecycle to New", () => {
    assert.equal(normalizeProspectLifecycleStatus(null), "New");
    assert.equal(normalizeProspectLifecycleStatus(""), "New");
    assert.equal(normalizeProspectLifecycleStatus("Ready"), "New");
  });

  it("accepts all allowed lifecycle statuses", () => {
    for (const status of PROSPECT_LIFECYCLE_STATUSES) {
      assert.equal(isProspectLifecycleStatus(status), true);
      assert.equal(normalizeProspectLifecycleStatus(status), status);
    }
  });

  it("lifecycle route does not enqueue generation", () => {
    const source = readFileSync(
      join(ROOT, "app/api/prospects/[id]/lifecycle/route.ts"),
      "utf8",
    );
    assert.match(source, /lifecycle_status/);
    assert.doesNotMatch(source, /ensureProspectGenerationQueued|enqueueDiscussion/);
  });
});

describe("ads content import and generation input", () => {
  it("CSV maps ads_content and aliases", () => {
    const rows = parseProspectCsv(
      "business_name,ads_content\nAcme,Headline A\n",
    );
    assert.equal(rows[0].ads_content, "Headline A");

    const aliased = parseProspectCsv(
      "company_name,google_ads\nBeta,Meta offer\n",
    );
    assert.equal(aliased[0].ads_content, "Meta offer");
  });

  it("Ads Content is optional and reaches normalized pipeline text", () => {
    const withoutAds = normalizeProspectExecutiveInput({
      business_name: "Acme",
      website: null,
      linkedin: null,
      facebook: null,
      instagram: null,
      industry: null,
      category: null,
      country: null,
      state: null,
      city: null,
      address: null,
      company_size: null,
      revenue: null,
      employee_count: null,
      technologies: null,
      pain_points: null,
      decision_maker: null,
      job_title: null,
      email: null,
      phone: null,
      google_business_url: null,
      notes: null,
      additional_context: null,
      ads_content: null,
      source: "manual",
      website_intelligence: null,
    });
    assert.equal(withoutAds.adsContent, null);

    const normalized = normalizeProspectExecutiveInput({
      business_name: "Acme",
      website: null,
      linkedin: null,
      facebook: null,
      instagram: null,
      industry: null,
      category: null,
      country: null,
      state: null,
      city: null,
      address: null,
      company_size: null,
      revenue: null,
      employee_count: null,
      technologies: null,
      pain_points: null,
      decision_maker: null,
      job_title: null,
      email: null,
      phone: null,
      google_business_url: null,
      notes: null,
      additional_context: null,
      ads_content: "Buy now — 20% off fillers",
      source: "manual",
      website_intelligence: null,
    });
    const body = formatNormalizedProspectInputForPipeline(normalized);
    assert.match(body, /Ads Content:/);
    assert.match(body, /20% off fillers/);
  });

  it("changed ads_content is a meaningful edit; lifecycle is not", () => {
    assert.equal(
      hasMeaningfulProspectEdit(
        { ads_content: "a" },
        { ads_content: "b" },
      ),
      true,
    );
    assert.equal(
      hasMeaningfulProspectEdit(
        { lifecycle_status: "New", ads_content: "same" },
        { lifecycle_status: "Contacted", ads_content: "same" },
      ),
      false,
    );
  });
});

describe("newsletter and blog deployment assets", () => {
  it("parses Newsletter Idea and Blog Post Idea for Discussion and Prospect", () => {
    const discussion = buildDiscussionDeploymentAssets({
      id: "a1",
      organization_id: "o1",
      discussion_id: "d1",
      community_id: null,
      created_at: "2026-07-13T00:00:00.000Z",
      updated_at: "2026-07-13T00:00:00.000Z",
      suggested_cta:
        "COMMUNITY_REPLY:\nHi\n\nNEWSLETTER_IDEA:\nSubject: Comfort protocols\nAngle: clinical rigor\n\nBLOG_POST_IDEA:\nTitle: Escalation protocols that win trust\n",
      raw_json: null,
    } as never);

    assert.ok(discussion.some((asset) => asset.title === "Newsletter Idea"));
    assert.ok(discussion.some((asset) => asset.title === "Blog Post Idea"));
    assert.ok(discussion.some((asset) => asset.title === "Community Reply"));

    const prospect = buildDiscussionDeploymentAssets({
      id: "a2",
      organization_id: "o1",
      discussion_id: "d2",
      community_id: null,
      created_at: "2026-07-13T00:00:00.000Z",
      updated_at: "2026-07-13T00:00:00.000Z",
      suggested_cta:
        "PERSONALIZED_OUTREACH_EMAIL:\nHello\n\nNEWSLETTER_IDEA:\nClient audience newsletter\n\nBLOG_POST_IDEA:\nClient audience blog outline\n",
      raw_json: null,
    } as never);

    assert.ok(prospect.some((asset) => asset.title === "Newsletter Idea"));
    assert.ok(prospect.some((asset) => asset.title === "Blog Post Idea"));
    assert.ok(
      prospect.some((asset) => asset.title === "Personalized Outreach Email"),
    );
  });
});

describe("page structure contracts", () => {
  it("Prospect page places Details after workspace and Append after detailed reasoning", () => {
    const page = readFileSync(
      join(ROOT, "app/prospects/[id]/page.tsx"),
      "utf8",
    );
    const workspaceIdx = page.indexOf("ExecutiveIntelligenceWorkspace");
    const appendIdx = page.indexOf("AppendProspectInformationForm");
    const detailsIdx = page.indexOf("ProspectMetadataEditor");
    assert.ok(workspaceIdx > 0);
    assert.ok(appendIdx > workspaceIdx);
    assert.ok(detailsIdx > appendIdx);
    assert.match(page, /afterDetailedReasoning/);
    assert.match(page, /ProspectLifecycleStatusControl/);
  });

  it("Discussion page places Append after detailed reasoning", () => {
    const page = readFileSync(
      join(ROOT, "app/discussions/[id]/page.tsx"),
      "utf8",
    );
    assert.match(page, /afterDetailedReasoning/);
    assert.match(page, /AppendDiscussionUpdateForm/);
  });

  it("workspace collapses assets and blueprint by default", () => {
    const source = readFileSync(
      join(ROOT, "components/discussions/ExecutiveIntelligenceWorkspace.tsx"),
      "utf8",
    );
    assert.match(source, /AthenaCollapsibleSection/);
    assert.match(source, /Deployment Assets/);
    assert.match(source, /Strategic Asset Blueprint/);
    assert.match(
      source,
      /title="Deployment Assets"\s*defaultOpen=\{false\}/,
    );
    assert.match(
      source,
      /title="Strategic Asset Blueprint"\s*defaultOpen=\{false\}/,
    );
    assert.doesNotMatch(
      source,
      /title="Strategic Asset Blueprint"\s*defaultOpen=\{!isProspect\}/,
    );
    assert.match(source, /Detailed Athena Reasoning/);

    const collapsible = readFileSync(
      join(ROOT, "components/ui/AthenaCollapsibleSection.tsx"),
      "utf8",
    );
    assert.match(collapsible, /useState\(defaultOpen\)/);
    assert.match(collapsible, /onClick=\{\(\) => setOpen/);
    assert.match(collapsible, /aria-expanded=\{open\}/);
  });

  it("Prospect library displays Category and lifecycle Status", () => {
    const source = readFileSync(
      join(ROOT, "components/prospects/ProspectsLibraryClient.tsx"),
      "utf8",
    );
    assert.match(source, />Category</);
    assert.doesNotMatch(source, />Industry</);
    assert.match(source, /display_lifecycle_status/);
    assert.match(source, /prospect\.category/);
  });
});
