import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  PERSONA_LIFECYCLE_STATUSES,
  assertPersonaLifecycleStatus,
  isPersonaLifecycleStatus,
  normalizePersonaLifecycleStatus,
} from "../../services/personas/personaLifecycle";
import { preparePersonaCreateRow } from "../../services/personas/personaNormalization";
import { toPublicPersona } from "../../services/personas/personaPublic";
import {
  PERSONA_DISPLAY_CONTEXT_LINE_MAX,
  PERSONA_DISPLAY_SHORT_DESCRIPTION_MAX,
  hasMeaningfulPersonaContent,
  normalizeOptionalText,
  normalizePersonaReferenceWebsite,
  resolvePersonaDisplayLabel,
} from "../../services/personas/personaUtils";
import type { Persona } from "../../services/personas/personaService";

const ORG = "11111111-1111-1111-1111-111111111111";

function baseCreate(
  overrides: Partial<Parameters<typeof preparePersonaCreateRow>[0]> = {},
) {
  return preparePersonaCreateRow({
    organization_id: ORG,
    user_id: "user-1",
    ...overrides,
  });
}

describe("persona creation — anti-blank and optional fields", () => {
  it("creates with only Persona Name", () => {
    const row = baseCreate({ persona_name: " Clinic Seekers " });
    assert.equal(row.persona_name, "Clinic Seekers");
    assert.equal(row.short_description, null);
    assert.equal(row.status, "Queued");
    assert.equal(row.lifecycle_status, "New");
    assert.equal(row.priority, 1);
    assert.equal(row.source, "manual");
  });

  it("creates with only Additional Context", () => {
    const row = baseCreate({
      additional_context: "Values authenticity over polish.",
    });
    assert.equal(row.additional_context, "Values authenticity over polish.");
    assert.equal(row.persona_name, null);
    assert.equal(row.notes, null);
  });

  it("creates with only Notes", () => {
    const row = baseCreate({ notes: "Operator follow-up" });
    assert.equal(row.notes, "Operator follow-up");
    assert.equal(row.additional_context, null);
  });

  it("creates with only Ads Content", () => {
    const row = baseCreate({ ads_content: "Meta ad: soft lighting" });
    assert.equal(row.ads_content, "Meta ad: soft lighting");
    assert.equal(row.notes, null);
    assert.equal(row.additional_context, null);
  });

  it("creates with only valid Reference Website", () => {
    const row = baseCreate({ reference_website: "elevateaesthetics.com" });
    assert.equal(row.reference_website, "https://elevateaesthetics.com");
    assert.equal(row.raw_json, null);
  });

  it("creates with only invalid Reference Website retained in raw_json", () => {
    const row = baseCreate({ reference_website: "not a website" });
    assert.equal(row.reference_website, null);
    assert.deepEqual(row.raw_json, {
      invalid_reference_website_input: "not a website",
    });
  });

  it("creates with another single descriptive field (pain_points)", () => {
    const row = baseCreate({ pain_points: "Fear of looking unnatural" });
    assert.equal(row.pain_points, "Fear of looking unnatural");
    assert.equal(row.persona_name, null);
  });

  it("rejects completely blank create", () => {
    assert.throws(
      () => baseCreate({ persona_name: "   ", notes: "", ads_content: null }),
      /at least one descriptive field/i,
    );
  });

  it("missing demographics do not block creation", () => {
    const row = baseCreate({
      persona_name: "Aesthetic Explorer",
      gender_identity: "",
      age_range: null,
      income_range: "  ",
    });
    assert.equal(row.persona_name, "Aesthetic Explorer");
    assert.equal(row.gender_identity, null);
    assert.equal(row.age_range, null);
    assert.equal(row.income_range, null);
  });

  it("all optional empty strings normalize to null", () => {
    const row = baseCreate({
      persona_name: "Named",
      short_description: "  ",
      category: "",
      country: "   ",
      notes: "",
      additional_context: " ",
      ads_content: "",
      lifestyle: "",
    });
    assert.equal(row.short_description, null);
    assert.equal(row.category, null);
    assert.equal(row.country, null);
    assert.equal(row.notes, null);
    assert.equal(row.additional_context, null);
    assert.equal(row.ads_content, null);
    assert.equal(row.lifestyle, null);
  });

  it("preserves Additional Context, Notes, and Ads Content as distinct fields", () => {
    const row = baseCreate({
      notes: "Operator note",
      additional_context: "Primary NL context",
      ads_content: "Ad evidence",
    });
    assert.equal(row.notes, "Operator note");
    assert.equal(row.additional_context, "Primary NL context");
    assert.equal(row.ads_content, "Ad evidence");
  });

  it("preserves profile_json and merges invalid website into existing raw_json", () => {
    const row = baseCreate({
      reference_website: "!!!bad!!!",
      profile_json: { aliases: ["seeker"] },
      raw_json: { import_marker: true },
    });
    assert.deepEqual(row.profile_json, { aliases: ["seeker"] });
    assert.deepEqual(row.raw_json, {
      import_marker: true,
      invalid_reference_website_input: "!!!bad!!!",
    });
  });

  it("empty operational client values do not replace defaults", () => {
    const row = baseCreate({
      persona_name: "Defaults",
      source: "  ",
      status: "",
      lifecycle_status: undefined,
      priority: undefined,
      opportunity_score: undefined,
    });
    assert.equal(row.source, "manual");
    assert.equal(row.status, "Queued");
    assert.equal(row.lifecycle_status, "New");
    assert.equal(row.priority, 1);
    assert.equal(row.opportunity_score, null);
  });

  it("hasMeaningfulPersonaContent treats profile_json as usable content", () => {
    assert.equal(
      hasMeaningfulPersonaContent({ profile_json: { aliases: ["a"] } }),
      true,
    );
    assert.equal(hasMeaningfulPersonaContent({ profile_json: {} }), false);
    assert.equal(hasMeaningfulPersonaContent({}), false);
  });
});

describe("persona reference website normalization", () => {
  it("normalizes bare domains like Prospect website URLs", () => {
    assert.deepEqual(normalizePersonaReferenceWebsite("elevateaesthetics.com"), {
      referenceWebsite: "https://elevateaesthetics.com",
      invalidReferenceWebsiteInput: null,
    });
    assert.deepEqual(normalizePersonaReferenceWebsite("not a website"), {
      referenceWebsite: null,
      invalidReferenceWebsiteInput: "not a website",
    });
    assert.deepEqual(normalizePersonaReferenceWebsite(""), {
      referenceWebsite: null,
      invalidReferenceWebsiteInput: null,
    });
  });

  it("normalizeOptionalText converts empty strings to null", () => {
    assert.equal(normalizeOptionalText("  x  "), "x");
    assert.equal(normalizeOptionalText(""), null);
    assert.equal(normalizeOptionalText("   "), null);
    assert.equal(normalizeOptionalText(null), null);
  });
});

describe("persona display label", () => {
  it("Persona Name wins", () => {
    assert.equal(
      resolvePersonaDisplayLabel({
        persona_name: " Primary Name ",
        short_description: "Should not win",
        reference_website: "https://example.com",
        additional_context: "Context line",
      }),
      "Primary Name",
    );
  });

  it("Short Description fallback with deterministic truncation", () => {
    const long = "A".repeat(PERSONA_DISPLAY_SHORT_DESCRIPTION_MAX + 20);
    const label = resolvePersonaDisplayLabel({
      persona_name: "",
      short_description: long,
    });
    assert.equal(label.length, PERSONA_DISPLAY_SHORT_DESCRIPTION_MAX);
    assert.equal(label.endsWith("…"), true);
    assert.equal(
      resolvePersonaDisplayLabel({
        persona_name: null,
        short_description: " Concise archetype ",
      }),
      "Concise archetype",
    );
  });

  it("Reference Website hostname fallback", () => {
    assert.equal(
      resolvePersonaDisplayLabel({
        persona_name: null,
        short_description: null,
        reference_website: "https://www.acme.com/path",
      }),
      "acme.com",
    );
  });

  it("Additional Context first-line fallback", () => {
    assert.equal(
      resolvePersonaDisplayLabel({
        persona_name: null,
        short_description: null,
        reference_website: null,
        additional_context: "\n  First useful line  \nSecond line",
      }),
      "Persona: First useful line",
    );
  });

  it("Additional Context truncation is deterministic and safe", () => {
    const longLine = "B".repeat(PERSONA_DISPLAY_CONTEXT_LINE_MAX + 40);
    const label = resolvePersonaDisplayLabel({
      additional_context: longLine,
    });
    assert.match(label, /^Persona: /);
    const body = label.slice("Persona: ".length);
    assert.equal(body.length, PERSONA_DISPLAY_CONTEXT_LINE_MAX);
    assert.equal(body.endsWith("…"), true);
  });

  it("Unnamed Persona final fallback", () => {
    assert.equal(
      resolvePersonaDisplayLabel({
        persona_name: "  ",
        short_description: null,
        reference_website: "",
        additional_context: "\n\n",
      }),
      "Unnamed Persona",
    );
  });
});

describe("persona lifecycle", () => {
  it("accepts all eight approved Persona lifecycle statuses", () => {
    assert.equal(PERSONA_LIFECYCLE_STATUSES.length, 8);
    for (const status of PERSONA_LIFECYCLE_STATUSES) {
      assert.equal(isPersonaLifecycleStatus(status), true);
      assert.equal(assertPersonaLifecycleStatus(status), status);
      assert.equal(normalizePersonaLifecycleStatus(status), status);
    }
  });

  it("rejects Prospect-only CRM lifecycle values", () => {
    for (const crm of [
      "Outreach Planned",
      "Contacted",
      "Follow-up",
      "Engaged",
      "Qualified",
      "Completed",
    ]) {
      assert.equal(isPersonaLifecycleStatus(crm), false);
      assert.throws(() => assertPersonaLifecycleStatus(crm), /Invalid Persona lifecycle/i);
    }
  });

  it("rejects invalid arbitrary values on write; read normalizes to New", () => {
    assert.throws(
      () => assertPersonaLifecycleStatus("Totally Invented"),
      /Invalid Persona lifecycle/i,
    );
    assert.equal(normalizePersonaLifecycleStatus("Totally Invented"), "New");
    assert.equal(normalizePersonaLifecycleStatus(null), "New");
  });

  it("create rejects invalid lifecycle; accepts Researching", () => {
    assert.throws(
      () => baseCreate({ persona_name: "X", lifecycle_status: "Contacted" }),
      /Invalid Persona lifecycle/i,
    );
    const row = baseCreate({
      persona_name: "X",
      lifecycle_status: "Researching",
    });
    assert.equal(row.lifecycle_status, "Researching");
  });
});

describe("persona public DTO", () => {
  it("exposes display_label and omits linked_discussion_id", () => {
    const persona = {
      id: "p1",
      created_at: "2026-07-30T00:00:00.000Z",
      updated_at: "2026-07-30T00:00:00.000Z",
      organization_id: ORG,
      user_id: "u1",
      community_id: null,
      linked_discussion_id: "secret-bridge",
      persona_name: "Display Me",
      short_description: null,
      category: null,
      gender_identity: null,
      age_range: null,
      birth_year_approx: null,
      generation: null,
      cultural_background: null,
      country: null,
      state: null,
      city: null,
      location_summary: null,
      languages: null,
      relationship_status: null,
      household: null,
      income_range: null,
      purchasing_power: null,
      education: null,
      occupation: null,
      seniority: null,
      industry_context: null,
      lifestyle: null,
      interests: null,
      digital_behavior: null,
      brands_influences: null,
      values_text: null,
      aesthetic_preferences: null,
      preferred_imagery: null,
      goals: null,
      needs: null,
      pain_points: null,
      fears: null,
      motivations: null,
      objections: null,
      buying_triggers: null,
      decision_criteria: null,
      purchase_behavior: null,
      typical_concerns: null,
      communication_style: null,
      preferred_channels: null,
      reference_website: null,
      notes: "n",
      additional_context: "c",
      ads_content: "a",
      source: "manual",
      status: "Queued",
      lifecycle_status: "New",
      opportunity_score: null,
      priority: 1,
      profile_json: null,
      raw_json: null,
      reference_website_intelligence: null,
      last_activity: null,
      import_batch_id: null,
      last_deep_scrape_at: null,
      last_deep_scrape_pages: null,
    } satisfies Persona;

    const pub = toPublicPersona(persona);
    assert.equal(pub.display_label, "Display Me");
    assert.equal(pub.notes, "n");
    assert.equal(pub.additional_context, "c");
    assert.equal(pub.ads_content, "a");
    assert.equal(
      Object.prototype.hasOwnProperty.call(pub, "linked_discussion_id"),
      false,
    );
  });
});
