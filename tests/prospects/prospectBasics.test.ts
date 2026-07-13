import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { buildDiscussionDeploymentAssets } from "../../lib/deploymentAssets";
import { toPublicProspect } from "../../services/prospects/prospectPublic";
import { mapJobStatusToProspectDisplayStatus } from "../../services/prospects/prospectStatus";
import {
  buildProspectAnalysisBody,
  hasMeaningfulProspectEdit,
  normalizeWebsiteUrl,
  resolveProspectBusinessName,
} from "../../services/prospects/prospectUtils";
import { parseProspectCsv } from "../../services/prospects/prospectCsv";
import {
  normalizeProspectExecutiveInput,
  formatNormalizedProspectInputForPipeline,
} from "../../services/prospects/prospectNormalization";
import { homepageOnlyWebsiteIntelligenceProvider } from "../../services/prospects/prospectWebsiteIntelligence";

describe("prospect website normalization", () => {
  it("normalizes bare domains and rejects invalid websites", () => {
    assert.equal(
      normalizeWebsiteUrl("elevateaesthetics.com"),
      "https://elevateaesthetics.com",
    );
    assert.equal(normalizeWebsiteUrl("not a website"), null);
    assert.equal(normalizeWebsiteUrl(""), null);
  });
});

describe("prospect business name fallback", () => {
  it("uses website hostname or contact when business name is missing", () => {
    assert.equal(
      resolveProspectBusinessName({
        business_name: "",
        website: "https://acme.com",
      }),
      "acme.com",
    );
    assert.equal(
      resolveProspectBusinessName({
        business_name: "",
        decision_maker: "Jane Doe",
      }),
      "Jane Doe",
    );
    assert.equal(
      resolveProspectBusinessName({ business_name: "", website: "" }),
      null,
    );
  });
});

describe("prospect CSV parsing", () => {
  it("maps common header aliases into prospect rows", () => {
    const rows = parseProspectCsv(
      "company_name,url,contact,title,industry,state,revenue,technologies,pain_points\nAcme,acme.com,Jane Doe,CEO,SaaS,TX,$10M,Node,Hiring\n",
    );
    assert.equal(rows.length, 1);
    assert.equal(rows[0].business_name, "Acme");
    assert.equal(rows[0].website, "acme.com");
    assert.equal(rows[0].decision_maker, "Jane Doe");
    assert.equal(rows[0].job_title, "CEO");
    assert.equal(rows[0].state, "TX");
    assert.equal(rows[0].revenue, "$10M");
    assert.equal(rows[0].technologies, "Node");
    assert.equal(rows[0].pain_points, "Hiring");
  });

  it("tolerates missing optional columns and empty values", () => {
    const rows = parseProspectCsv("business_name,website\nSolo,\n");
    assert.equal(rows.length, 1);
    assert.equal(rows[0].business_name, "Solo");
    assert.equal(rows[0].website, null);
    assert.equal(rows[0].email, undefined);
  });

  it("parses multiple rows without failing the file", () => {
    const rows = parseProspectCsv(
      "business_name,website\nOne,one.com\nTwo,two.com\nThree,\n",
    );
    assert.equal(rows.length, 3);
  });
});

describe("prospect analysis body", () => {
  it("includes normalized metadata and homepage intelligence for Brain context", () => {
    const prospect = {
      business_name: "Acme",
      website: "https://acme.com",
      linkedin: null,
      facebook: null,
      instagram: null,
      industry: "SaaS",
      category: null,
      country: "US",
      state: "TX",
      city: "Austin",
      address: null,
      company_size: null,
      revenue: null,
      employee_count: null,
      technologies: "Node",
      pain_points: "Scale",
      decision_maker: "Jane Doe",
      job_title: "CEO",
      email: null,
      phone: null,
      google_business_url: null,
      notes: "Priority account",
      additional_context: null,
      source: "manual",
      website_intelligence: {
        provider: "homepage_only",
        url: "https://acme.com",
        scraped_at: "2026-07-13T00:00:00.000Z",
        title: "Acme",
        headings: "Build faster",
        paragraphs: "",
        positioning: "Operator infrastructure",
        products: "Platform",
        services: "Automation",
        about: "We help operators scale",
        target_audience: "Operators",
        messaging: "Scale without chaos",
        value_proposition: "Save time",
        cta: "Book a demo",
        differentiators: "Built for operators",
        trust_signals: "Trusted by 200 teams",
        contact_information: "hello@acme.com",
        brand_tone: "Concise / direct",
      },
    };

    const body = buildProspectAnalysisBody(prospect);
    assert.match(body, /EXECUTIVE INTELLIGENCE SOURCE: PROSPECT/);
    assert.match(body, /Acme/);
    assert.match(body, /NORMALIZED HOMEPAGE INTELLIGENCE/);
    assert.match(body, /Book a demo/);
    assert.match(body, /Technologies/);
    assert.match(body, /Pain Points/);

    const normalized = normalizeProspectExecutiveInput(prospect);
    assert.equal(normalized.sourceType, "prospect");
    assert.match(
      formatNormalizedProspectInputForPipeline(normalized),
      /Positioning/,
    );
  });
});

describe("prospect meaningful edits", () => {
  it("detects field changes that should enqueue regeneration", () => {
    assert.equal(
      hasMeaningfulProspectEdit(
        { business_name: "Acme", notes: "a" },
        { business_name: "Acme", notes: "b" },
      ),
      true,
    );
    assert.equal(
      hasMeaningfulProspectEdit(
        { business_name: "Acme", status: "Queued" },
        { business_name: "Acme", status: "Ready" },
      ),
      false,
    );
  });
});

describe("prospect display status", () => {
  it("maps durable job states to executive-facing labels", () => {
    assert.equal(
      mapJobStatusToProspectDisplayStatus({ jobStatus: "queued" }),
      "Queued",
    );
    assert.equal(
      mapJobStatusToProspectDisplayStatus({
        jobStatus: "processing",
        jobStage: "website_intelligence",
      }),
      "Learning from Website",
    );
    assert.equal(
      mapJobStatusToProspectDisplayStatus({ jobStatus: "processing" }),
      "Generating Executive Intelligence",
    );
    assert.equal(
      mapJobStatusToProspectDisplayStatus({ jobStatus: "failed" }),
      "Processing Failed",
    );
    assert.equal(
      mapJobStatusToProspectDisplayStatus({
        prospectStatus: "Queued",
        hasCurrentVersion: true,
      }),
      "Ready",
    );
  });
});

describe("public prospect DTO", () => {
  it("strips the internal compatibility bridge identifier", () => {
    const publicProspect = toPublicProspect({
      id: "p1",
      created_at: "2026-07-13T00:00:00.000Z",
      updated_at: "2026-07-13T00:00:00.000Z",
      organization_id: "o1",
      user_id: null,
      community_id: null,
      linked_discussion_id: "secret-bridge",
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
      status: "Queued",
      lifecycle_status: "New",
      opportunity_score: null,
      priority: 1,
      website_intelligence: null,
      raw_json: null,
      last_activity: null,
      import_batch_id: null,
    });

    assert.equal(
      "linked_discussion_id" in publicProspect,
      false,
    );
    assert.equal(publicProspect.display_status, "Queued");
    assert.equal(publicProspect.display_opportunity_score, null);
    assert.equal(publicProspect.display_opportunity_score_label, "—");
  });
});

describe("prospect deployment assets parsing", () => {
  it("parses prospect-specific labeled assets without breaking discussion labels", () => {
    const prospectAssets = buildDiscussionDeploymentAssets({
      id: "a1",
      organization_id: "o1",
      discussion_id: "d1",
      community_id: null,
      created_at: "2026-07-13T00:00:00.000Z",
      updated_at: "2026-07-13T00:00:00.000Z",
      suggested_cta:
        "PERSONALIZED_OUTREACH_EMAIL:\nHello Acme\n\nLINKEDIN_CONNECTION:\nConnect?\n\nRECOMMENDED_CTA:\nBook a call",
      raw_json: null,
    } as never);

    assert.equal(prospectAssets.length, 3);
    assert.equal(prospectAssets[0].title, "Personalized Outreach Email");
    assert.equal(prospectAssets[1].title, "LinkedIn Connection Message");

    const discussionAssets = buildDiscussionDeploymentAssets({
      id: "a2",
      organization_id: "o1",
      discussion_id: "d2",
      community_id: null,
      created_at: "2026-07-13T00:00:00.000Z",
      updated_at: "2026-07-13T00:00:00.000Z",
      suggested_cta:
        "COMMUNITY_REPLY:\nHi\n\nFOLLOW_UP:\nFollowing up\n\nCALL_TO_ACTION:\nCTA",
      raw_json: null,
    } as never);

    assert.equal(discussionAssets.length, 3);
    assert.equal(discussionAssets[0].title, "Community Reply");
    assert.equal(discussionAssets[1].title, "Follow-up Reply");
  });
});

describe("homepage intelligence failure behavior", () => {
  it("returns sanitized empty intelligence on fetch failure without throwing", async () => {
    const originalFetch = globalThis.fetch;
    globalThis.fetch = (async () => {
      throw new Error("DNS failure");
    }) as typeof fetch;

    try {
      const result = await homepageOnlyWebsiteIntelligenceProvider.extract(
        "https://example.invalid",
      );
      assert.equal(result.provider, "homepage_only");
      assert.match(result.error ?? "", /DNS failure/);
      assert.equal(result.positioning, "");
    } finally {
      globalThis.fetch = originalFetch;
    }
  });

  it("returns sanitized empty intelligence on non-OK HTTP", async () => {
    const originalFetch = globalThis.fetch;
    globalThis.fetch = (async () =>
      new Response("Nope", { status: 403 })) as typeof fetch;

    try {
      const result = await homepageOnlyWebsiteIntelligenceProvider.extract(
        "https://example.com",
      );
      assert.match(result.error ?? "", /HTTP 403/);
    } finally {
      globalThis.fetch = originalFetch;
    }
  });
});
