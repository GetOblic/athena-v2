/**
 * GetOblic Description generation — isolated service contract.
 * No live scrape, claim, KB, or full prospect generation.
 */

import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, it } from "node:test";
import {
  buildGetoblicDescriptionContext,
  classifyGetoblicDescriptionEvidence,
  containsGetoblicDescriptionContamination,
  extractUsableWebsiteIntelligence,
  formatGetoblicDescriptionUserPrompt,
  generateProspectGetoblicDescription,
  GETOBLIC_DESCRIPTION_DEPTH_TARGETS,
  GETOBLIC_DESCRIPTION_MAX_CHARS,
  GETOBLIC_DESCRIPTION_SYSTEM_PROMPT,
  hasUsableWebsiteIntelligence,
  persistGeneratedListingDescription,
  ProspectGetoblicDescriptionError,
  readObservedListingDescription,
  sanitizeGeneratedListingDescription,
  stripVolatilePricing,
  validateGeneratedListingDescription,
} from "../../services/prospects/prospectGetoblicDescription";
import type { Prospect } from "../../services/prospects/prospectService";

const ROOT = process.cwd();

function read(relativePath: string): string {
  return readFileSync(join(ROOT, relativePath), "utf8");
}

function sampleProspect(overrides: Partial<Prospect> = {}): Prospect {
  return {
    id: "prospect-1",
    created_at: "2026-09-10T00:00:00.000Z",
    updated_at: "2026-09-10T00:00:00.000Z",
    organization_id: "org-1",
    user_id: null,
    community_id: null,
    linked_discussion_id: null,
    business_name: "Acme Clinic",
    website: "https://acme.example",
    linkedin: "https://linkedin.com/company/acme",
    facebook: null,
    instagram: null,
    industry: "Healthcare",
    category: "Clinics",
    country: "United States",
    state: "TX",
    city: "Dallas",
    address: "100 Main St",
    company_size: "12",
    revenue: "$2M",
    employee_count: "12",
    technologies: "Node",
    pain_points: "Slow intake",
    decision_maker: "Jane Doe",
    first_name: "Jane",
    last_name: "Doe",
    external_contact_id: null,
    timezone: null,
    job_title: "Owner",
    email: "hello@acme.example",
    phone: "555-0100",
    whatsapp_number: null,
    getoblic_type: null,
    google_business_url: "https://maps.google.com/?cid=1",
    notes: "Prefers weekday appointments.",
    additional_context: "Family-owned since the owner mentioned it privately.",
    source: "getoblic",
    status: "Ready",
    lifecycle_status: "New",
    ads_content: "Book today",
    opportunity_score: 91,
    priority: 1,
    website_intelligence: {
      about: "A neighborhood clinic serving local families.",
      services: "Primary care and wellness visits.",
      products: "",
      solutions: "Same-day sick-visit appointments for school-age children.",
      specialties: "Pediatric wellness and weekday primary care.",
      positioning: "Accessible neighborhood care.",
      value_proposition: "Physician-led weekday clinic care close to home.",
      differentiators: "Same-day sick visits without a long wait.",
      target_audience: "Local families who need weekday appointments.",
      customer_groups: "Parents of school-age children.",
      messaging: "Care close to home.",
      process: "Walk-in sick visits after a brief nurse triage.",
      methods: "In-person exams and routine vaccinations.",
      business_knowledge: {
        about: "Physician-led clinic.",
        services: "Checkups, vaccinations.",
        solutions: "Same-day sick-visit coverage during school weeks.",
        specialties: "Family and pediatric primary care.",
        pricing: "$99 visits",
        testimonials: "Best clinic in Texas",
        target_audience: "Parents of school-age children.",
        customer_groups: "Working parents.",
        differentiators: "Same-day sick visits.",
        process: "Nurse triage before the physician exam.",
      },
    },
    raw_json: {
      origin: "getoblic_directory",
      wordpress_listing_id: 44,
      observed: {
        description: "Imported GetOblic listing copy.",
        permalink: "https://getoblic.com/listing/acme",
        listing_type: "place",
        tagline: "Neighborhood care",
        text_hours: "Monday–Friday 8:00 AM–6:00 PM",
        region: { name: "North Texas", slug: "north-texas" },
      },
      analysis: { confidence: 0.88 },
      recommended_action: "Call this week",
    },
    generated_listing_description: null,
    last_activity: null,
    import_batch_id: null,
    ...overrides,
  };
}

const DISTINCTIVE_LISTING_COPY =
  "UNIQUE_JETSONS_LISTING_COPY orange shag carpet steam special 1973.";

function omittedWebsiteIntelligenceFields() {
  return {
    cta: "Book a weekday clinic visit online.",
    trust_signals: "Physician-led neighborhood clinic care.",
    contact_information: "Use the website contact form for appointments.",
    brand_tone: "Warm, professional, and family-focused.",
  };
}

describe("GetOblic Description context", () => {
  it("builds only minimal identity anchors for generation", () => {
    const context = buildGetoblicDescriptionContext(sampleProspect());
    assert.equal(context.identity.name, "Acme Clinic");
    assert.equal(context.identity.city, "Dallas");
    assert.equal(context.identity.state, "TX");
    assert.equal(context.identity.country, "United States");
    assert.equal(
      JSON.stringify(Object.keys(context.identity).sort()),
      JSON.stringify(["city", "country", "name", "state"]),
    );
    assert.equal("business" in context, false);
    assert.equal("currentListingDescription" in context, false);
    assert.equal("listingProvenance" in context, false);
    assert.equal("socialPresence" in context, false);
    assert.equal("operatorNotes" in context, false);
    assert.equal("additionalContext" in context, false);
    assert.doesNotMatch(JSON.stringify(context), /Clinics|Healthcare|555-0100|hello@acme/);
  });

  it("keeps the current listing description display-only and out of generation context", () => {
    const prospect = sampleProspect({
      raw_json: {
        origin: "getoblic_directory",
        observed: { description: DISTINCTIVE_LISTING_COPY },
      },
    });
    const context = buildGetoblicDescriptionContext(prospect);
    const prompt = formatGetoblicDescriptionUserPrompt(context);
    assert.equal(
      readObservedListingDescription(prospect.raw_json),
      DISTINCTIVE_LISTING_COPY,
    );
    assert.equal("currentListingDescription" in context, false);
    assert.doesNotMatch(prompt, /UNIQUE_JETSONS_LISTING_COPY|orange shag carpet/);
    assert.doesNotMatch(JSON.stringify(context), /UNIQUE_JETSONS_LISTING_COPY/);
  });

  it("includes existing usable website intelligence and skips unsupported claims", () => {
    const extracted = extractUsableWebsiteIntelligence(
      sampleProspect().website_intelligence,
    );
    assert.equal(extracted.about, "A neighborhood clinic serving local families.");
    assert.equal(extracted.services, "Primary care and wellness visits.");
    assert.equal(
      extracted.solutions,
      "Same-day sick-visit appointments for school-age children.",
    );
    assert.equal(
      extracted.specialties,
      "Pediatric wellness and weekday primary care.",
    );
    assert.equal(
      extracted.target_audience,
      "Local families who need weekday appointments.",
    );
    assert.equal(extracted.customer_groups, "Parents of school-age children.");
    assert.equal(extracted.process, "Walk-in sick visits after a brief nurse triage.");
    assert.equal(extracted.messaging, "Care close to home.");
    assert.match(extracted.business_knowledge, /Physician-led clinic/);
    assert.match(extracted.business_knowledge, /Parents of school-age children/);
    assert.match(extracted.business_knowledge, /Same-day sick visits/);
    assert.match(extracted.business_knowledge, /Nurse triage/);
    assert.equal(extracted.pricing, undefined);
    assert.doesNotMatch(extracted.business_knowledge, /\$99|Best clinic/);
  });

  it("treats stored Website Intelligence using previously omitted website-derived fields as usable", () => {
    const extracted = extractUsableWebsiteIntelligence({
      ...omittedWebsiteIntelligenceFields(),
      provider: "homepage_only",
      url: "https://acme.example",
      scraped_at: "2026-09-10T00:00:00.000Z",
      title: "Acme Clinic | Home",
      headings: "Home\nServices\nContact",
      paragraphs: "Raw homepage paragraph dump that is not a research section.",
      business_knowledge: {
        cta: "Request a same-day sick visit.",
        trust_signals: "Board-certified family physicians.",
        contact_information: "Appointments through the clinic website.",
        brand_tone: "Calm and direct.",
        pricing: "$99 visits",
        testimonials: "Best clinic in Texas",
      },
    });
    assert.equal(extracted.cta, "Book a weekday clinic visit online.");
    assert.equal(
      extracted.trust_signals,
      "Physician-led neighborhood clinic care.",
    );
    assert.equal(
      extracted.contact_information,
      "Use the website contact form for appointments.",
    );
    assert.equal(
      extracted.brand_tone,
      "Warm, professional, and family-focused.",
    );
    assert.match(extracted.business_knowledge, /Request a same-day sick visit/);
    assert.match(extracted.business_knowledge, /Board-certified family physicians/);
    assert.match(extracted.business_knowledge, /Appointments through the clinic website/);
    assert.match(extracted.business_knowledge, /Calm and direct/);
    assert.equal(extracted.headings, undefined);
    assert.equal(extracted.paragraphs, undefined);
    assert.equal(extracted.title, undefined);
    assert.equal(extracted.provider, undefined);
    assert.equal(extracted.url, undefined);
    assert.equal(extracted.pricing, undefined);
    assert.doesNotMatch(extracted.business_knowledge, /\$99|Best clinic/);
    assert.equal(hasUsableWebsiteIntelligence(extracted), true);
  });

  it("does not let listing copy, identity, or placeholder-only Website Intelligence become usable evidence", () => {
    const listingOnly = sampleProspect({
      website_intelligence: {
        about: "",
        cta: "n/a",
        trust_signals: "none",
        contact_information: "placeholder",
        brand_tone: "TBD",
        headings: "Home\nAbout",
        paragraphs: "A long raw homepage dump.",
        provider: "homepage_only",
      },
      raw_json: { observed: { description: DISTINCTIVE_LISTING_COPY } },
    });
    const context = buildGetoblicDescriptionContext(listingOnly);
    assert.equal(hasUsableWebsiteIntelligence(context.websiteIntelligence), false);
    assert.equal(Object.keys(context.websiteIntelligence).length, 0);
    assert.doesNotMatch(
      JSON.stringify(context),
      /UNIQUE_JETSONS_LISTING_COPY|orange shag carpet/,
    );
    assert.equal(context.identity.name, "Acme Clinic");
    assert.equal(context.identity.city, "Dallas");
  });

  it("supplies Website Intelligence facts and excludes listing, profile, and social sources", () => {
    const context = buildGetoblicDescriptionContext(sampleProspect());
    const prompt = formatGetoblicDescriptionUserPrompt(context);
    const identityIndex = prompt.indexOf(
      "Identity anchors (who and where only; not descriptive evidence):",
    );
    const wiIndex = prompt.indexOf(
      "Stored Website Intelligence (sole descriptive evidence):",
    );
    assert.ok(identityIndex > 0);
    assert.ok(wiIndex > identityIndex);
    assert.match(prompt, /Pediatric wellness and weekday primary care/);
    assert.match(prompt, /Same-day sick-visit appointments/);
    assert.match(prompt, /Primary care and wellness visits/);
    assert.match(prompt, /A neighborhood clinic serving local families/);
    assert.match(prompt, /Physician-led clinic/);
    assert.match(prompt, /Website Intelligence is the sole descriptive evidence/);
    assert.match(prompt, /Use the business name naturally/);
    assert.match(prompt, /do not repeat the business name as the subject of every sentence/);
    assert.match(prompt, /Prefer restructuring sentences over mechanically substituting The business or The company/);
    assert.match(prompt, /Prefer direct factual language/);
    assert.match(prompt, /Distinguish FACT from MARKETING CLAIM/);
    assert.match(prompt, /Do not scrape or request new website intelligence/);
    assert.match(prompt, /Never infer a service area/);
    assert.match(prompt, /Name: Acme Clinic/);
    assert.match(prompt, /City: Dallas/);
    assert.match(prompt, /State: TX/);
    assert.match(prompt, /Country: United States/);
    assert.doesNotMatch(prompt, /Imported GetOblic listing copy/);
    assert.doesNotMatch(prompt, /Neighborhood care/);
    assert.doesNotMatch(prompt, /Monday–Friday 8:00 AM–6:00 PM/);
    assert.doesNotMatch(prompt, /Clinics|Healthcare/);
    assert.doesNotMatch(prompt, /https:\/\/linkedin\.com\/company\/acme/);
    assert.doesNotMatch(prompt, /https:\/\/maps\.google\.com\/\?cid=1/);
    assert.doesNotMatch(prompt, /Prefers weekday appointments|Family-owned since the owner mentioned it privately/);
    assert.doesNotMatch(prompt, /100 Main St|555-0100|hello@acme\.example|https:\/\/acme\.example/);
    assert.doesNotMatch(prompt, /getoblic_directory|wordpress_listing_id|listing\/acme/);
    assert.doesNotMatch(prompt, /Current GetOblic listing description|factual source\/provenance|SOURCE HIERARCHY/);
    assert.doesNotMatch(prompt, /FACT SELECTION|STAGE 1|STAGE 2|editorial synthesis/);
    assert.doesNotMatch(prompt, /North Texas|north-texas/);
    assert.doesNotMatch(prompt, /500–900 characters/);
    assert.match(
      prompt,
      /Pricing is intentionally excluded because it may change/,
    );
  });

  it("never sends listing facts, hours, taglines, or directory region taxonomy to generation", () => {
    const context = buildGetoblicDescriptionContext(
      sampleProspect({
        raw_json: {
          origin: "getoblic_directory",
          wordpress_listing_id: 44,
          observed: {
            description: DISTINCTIVE_LISTING_COPY,
            tagline: "UNIQUE_TAGLINE_NEIGHBORHOOD_CARE",
            text_hours: "UNIQUE_HOURS_SATURDAY 9:00 AM–1:00 PM",
            region: { name: "Los Angeles", slug: "los-angeles" },
            tags: [{ name: "Your service" }, { name: "Your value" }],
          },
        },
      }),
    );
    const prompt = formatGetoblicDescriptionUserPrompt(context);
    assert.doesNotMatch(prompt, /UNIQUE_JETSONS_LISTING_COPY|UNIQUE_TAGLINE_NEIGHBORHOOD_CARE/);
    assert.doesNotMatch(prompt, /UNIQUE_HOURS_SATURDAY|Your service|Your value/);
    assert.doesNotMatch(prompt, /Los Angeles|los-angeles/);
    assert.doesNotMatch(prompt, /getoblic_directory|wordpress_listing_id/);
  });

  it("locks the Website-Intelligence-only, adaptive-depth, and factuality contract without requiring exact model prose", () => {
    assert.deepEqual(GETOBLIC_DESCRIPTION_DEPTH_TARGETS, {
      low: { min: 400, max: 700 },
      medium: { min: 700, max: 1100 },
      rich: { min: 900, max: 1500 },
    });
    assert.equal(GETOBLIC_DESCRIPTION_MAX_CHARS, 4000);
    assert.match(GETOBLIC_DESCRIPTION_SYSTEM_PROMPT, /GENERATION OBJECTIVE/);
    assert.match(
      GETOBLIC_DESCRIPTION_SYSTEM_PROMPT,
      /most useful factual public directory description/,
    );
    assert.match(
      GETOBLIC_DESCRIPTION_SYSTEM_PROMPT,
      /Stored Website Intelligence is the sole descriptive evidence source/,
    );
    assert.match(
      GETOBLIC_DESCRIPTION_SYSTEM_PROMPT,
      /Do not use, rewrite, compare against, or fall back to any current or imported GetOblic listing description/,
    );
    assert.match(GETOBLIC_DESCRIPTION_SYSTEM_PROMPT, /IDENTITY ANCHORS/);
    assert.match(
      GETOBLIC_DESCRIPTION_SYSTEM_PROMPT,
      /They are not descriptive evidence/,
    );
    assert.match(GETOBLIC_DESCRIPTION_SYSTEM_PROMPT, /INFORMATION DENSITY/);
    assert.match(
      GETOBLIC_DESCRIPTION_SYSTEM_PROMPT,
      /The goal is not maximum length/,
    );
    assert.match(
      GETOBLIC_DESCRIPTION_SYSTEM_PROMPT,
      /maximum useful factual information density/,
    );
    assert.match(
      GETOBLIC_DESCRIPTION_SYSTEM_PROMPT,
      /Do not add generic marketing filler/,
    );
    assert.match(GETOBLIC_DESCRIPTION_SYSTEM_PROMPT, /SOURCE COVERAGE/);
    assert.match(GETOBLIC_DESCRIPTION_SYSTEM_PROMPT, /ADAPTIVE DEPTH/);
    assert.match(
      GETOBLIC_DESCRIPTION_SYSTEM_PROMPT,
      /400–700 characters/,
    );
    assert.match(
      GETOBLIC_DESCRIPTION_SYSTEM_PROMPT,
      /700–1,100 characters/,
    );
    assert.match(
      GETOBLIC_DESCRIPTION_SYSTEM_PROMPT,
      /900–1,500 characters/,
    );
    assert.match(
      GETOBLIC_DESCRIPTION_SYSTEM_PROMPT,
      /Never invent, repeat, or pad information to reach them/,
    );
    assert.match(
      GETOBLIC_DESCRIPTION_SYSTEM_PROMPT,
      /If Website Intelligence is sparse, a shorter description is appropriate/,
    );
    assert.match(
      GETOBLIC_DESCRIPTION_SYSTEM_PROMPT,
      /If stored website intelligence is substantial, a substantially richer description is expected/,
    );
    assert.match(
      GETOBLIC_DESCRIPTION_SYSTEM_PROMPT,
      /preserve the important facts rather than compressing/,
    );
    assert.match(
      GETOBLIC_DESCRIPTION_SYSTEM_PROMPT,
      /Excessive compression is a failure when the source is rich/,
    );
    assert.match(
      GETOBLIC_DESCRIPTION_SYSTEM_PROMPT,
      /Prefer direct factual statements/,
    );
    assert.match(
      GETOBLIC_DESCRIPTION_SYSTEM_PROMPT,
      /Distinguish FACT from MARKETING CLAIM/,
    );
    assert.match(
      GETOBLIC_DESCRIPTION_SYSTEM_PROMPT,
      /Do not convert marketing positioning into an objective factual claim/,
    );
    assert.match(
      GETOBLIC_DESCRIPTION_SYSTEM_PROMPT,
      /do not automatically publish "#1 carpet cleaner"/,
    );
    assert.match(
      GETOBLIC_DESCRIPTION_SYSTEM_PROMPT,
      /that may be used as a factual service or process statement/,
    );
    assert.match(GETOBLIC_DESCRIPTION_SYSTEM_PROMPT, /WEBSITE INTELLIGENCE ONLY/);
    assert.match(
      GETOBLIC_DESCRIPTION_SYSTEM_PROMPT,
      /Do not request, assume, or invent a new website scrape/,
    );
    assert.match(
      GETOBLIC_DESCRIPTION_SYSTEM_PROMPT,
      /Never infer a service area from city, address, region taxonomy, nearby metro, permalink, or directory hierarchy/,
    );
    assert.match(
      GETOBLIC_DESCRIPTION_SYSTEM_PROMPT,
      /Do not infer a service radius from a business address/,
    );
    assert.match(
      GETOBLIC_DESCRIPTION_SYSTEM_PROMPT,
      /A shorter description is valid when the evidence is thin/,
    );
    assert.match(
      GETOBLIC_DESCRIPTION_SYSTEM_PROMPT,
      /Never exceed 4000 characters/,
    );
    assert.match(
      GETOBLIC_DESCRIPTION_SYSTEM_PROMPT,
      /Do not mention Athena, GetOblic intelligence, AI, analysis/,
    );
    assert.match(
      GETOBLIC_DESCRIPTION_SYSTEM_PROMPT,
      /Use the business name naturally[\s\S]*usually once in the opening sentence/,
    );
    assert.match(
      GETOBLIC_DESCRIPTION_SYSTEM_PROMPT,
      /no more than 2 times[\s\S]*unless clarity genuinely requires repetition/,
    );
    assert.match(
      GETOBLIC_DESCRIPTION_SYSTEM_PROMPT,
      /Write one cohesive editorial description/,
    );
    assert.match(
      GETOBLIC_DESCRIPTION_SYSTEM_PROMPT,
      /2–3 compact paragraphs or 5–8 well-constructed sentences/,
    );
    assert.match(
      GETOBLIC_DESCRIPTION_SYSTEM_PROMPT,
      /HARD OUTPUT CONTRACT/,
    );
    assert.match(
      GETOBLIC_DESCRIPTION_SYSTEM_PROMPT,
      /Editorial variety must not introduce promotional adjectives/,
    );
    assert.match(
      GETOBLIC_DESCRIPTION_SYSTEM_PROMPT,
      /Return only the final customer-facing directory description/,
    );
    assert.match(
      GETOBLIC_DESCRIPTION_SYSTEM_PROMPT,
      /Pricing is intentionally excluded from public GetOblic Description generation because it may change/,
    );
    assert.doesNotMatch(GETOBLIC_DESCRIPTION_SYSTEM_PROMPT, /STAGE 1|STAGE 2/);
    assert.doesNotMatch(GETOBLIC_DESCRIPTION_SYSTEM_PROMPT, /FACT SELECTION/);
    assert.doesNotMatch(GETOBLIC_DESCRIPTION_SYSTEM_PROMPT, /EDITORIAL SYNTHESIS/);
    assert.doesNotMatch(GETOBLIC_DESCRIPTION_SYSTEM_PROMPT, /SOURCE HIERARCHY/);
    assert.doesNotMatch(
      GETOBLIC_DESCRIPTION_SYSTEM_PROMPT,
      /current GetOblic listing description/,
    );
    assert.doesNotMatch(
      GETOBLIC_DESCRIPTION_SYSTEM_PROMPT,
      /If no website intelligence is available, generate from the remaining trusted sources/,
    );
    assert.doesNotMatch(
      GETOBLIC_DESCRIPTION_SYSTEM_PROMPT,
      /reject|invalid if under 500|must be at least 500/,
    );
    assert.doesNotMatch(
      GETOBLIC_DESCRIPTION_SYSTEM_PROMPT,
      /500–900 characters/,
    );
    assert.doesNotMatch(
      GETOBLIC_DESCRIPTION_SYSTEM_PROMPT,
      /grammatical subject throughout|subject in every sentence/,
    );
    assert.doesNotMatch(
      GETOBLIC_DESCRIPTION_SYSTEM_PROMPT,
      /primary factual source material to synthesize and improve/,
    );
  });

  it("classifies evidence-adaptive depth from Website Intelligence only", () => {
    const rich = classifyGetoblicDescriptionEvidence(
      buildGetoblicDescriptionContext(sampleProspect()),
    );
    assert.equal(rich.band, "rich");
    assert.equal(rich.preferredMin, 900);
    assert.equal(rich.preferredMax, 1500);
    assert.ok(rich.websiteIntelligenceFieldCount >= 4);
    assert.ok(rich.websiteIntelligenceChars >= 400);

    const medium = classifyGetoblicDescriptionEvidence(
      buildGetoblicDescriptionContext(
        sampleProspect({
          website_intelligence: {
            about: "A neighborhood clinic serving local families in Dallas.",
            services: "Primary care and wellness visits on weekdays.",
          },
        }),
      ),
    );
    assert.equal(medium.band, "medium");
    assert.equal(medium.preferredMin, 700);
    assert.equal(medium.preferredMax, 1100);

    const longListing = `${"Acme Clinic neighborhood care. ".repeat(40)}${DISTINCTIVE_LISTING_COPY}`;
    assert.ok(longListing.length >= 200);
    const lowDespiteLongListing = classifyGetoblicDescriptionEvidence(
      buildGetoblicDescriptionContext(
        sampleProspect({
          website_intelligence: { about: "Neighborhood clinic." },
          raw_json: { observed: { description: longListing } },
        }),
      ),
    );
    const lowWithoutListing = classifyGetoblicDescriptionEvidence(
      buildGetoblicDescriptionContext(
        sampleProspect({
          website_intelligence: { about: "Neighborhood clinic." },
          raw_json: { observed: { description: "A clinic in Dallas." } },
        }),
      ),
    );
    assert.equal(lowDespiteLongListing.band, "low");
    assert.equal(lowWithoutListing.band, "low");
    assert.equal(lowDespiteLongListing.band, lowWithoutListing.band);
    assert.equal(lowDespiteLongListing.preferredMin, 400);
    assert.equal(lowDespiteLongListing.preferredMax, 700);
    assert.ok(lowDespiteLongListing.websiteIntelligenceChars < 80);

    const emptyContext = buildGetoblicDescriptionContext(
      sampleProspect({
        website_intelligence: null,
        raw_json: { observed: { description: longListing } },
      }),
    );
    const empty = classifyGetoblicDescriptionEvidence(emptyContext);
    assert.equal(empty.band, "low");
    assert.equal(empty.websiteIntelligenceFieldCount, 0);
    assert.equal(hasUsableWebsiteIntelligence(emptyContext.websiteIntelligence), false);

    const richPrompt = formatGetoblicDescriptionUserPrompt(
      buildGetoblicDescriptionContext(sampleProspect()),
    );
    assert.match(richPrompt, /Website Intelligence available for this business is RICH/);
    assert.match(richPrompt, /approximately 900–1500 characters/);
    assert.match(richPrompt, /maximum useful factual information density, not maximum length/);

    const lowPrompt = formatGetoblicDescriptionUserPrompt(
      buildGetoblicDescriptionContext(
        sampleProspect({
          website_intelligence: { about: "Neighborhood clinic." },
          raw_json: { observed: { description: longListing } },
        }),
      ),
    );
    assert.match(lowPrompt, /Website Intelligence available for this business is LOW/);
    assert.match(lowPrompt, /approximately 400–700 characters/);
    assert.match(lowPrompt, /Never invent, repeat, or pad to reach it/);
    assert.match(lowPrompt, /Neighborhood clinic/);
    assert.doesNotMatch(lowPrompt, /UNIQUE_JETSONS_LISTING_COPY/);
    assert.doesNotMatch(lowPrompt, /Current GetOblic listing description/);
  });

  it("classifies omitted website-derived fields as Website Intelligence only", () => {
    const longListing = `${"Acme Clinic neighborhood care. ".repeat(40)}${DISTINCTIVE_LISTING_COPY}`;
    const omittedOnly = sampleProspect({
      website_intelligence: omittedWebsiteIntelligenceFields(),
      raw_json: { observed: { description: longListing } },
    });
    const withListing = classifyGetoblicDescriptionEvidence(
      buildGetoblicDescriptionContext(omittedOnly),
    );
    const withoutListing = classifyGetoblicDescriptionEvidence(
      buildGetoblicDescriptionContext(
        sampleProspect({
          website_intelligence: omittedWebsiteIntelligenceFields(),
          raw_json: { observed: { description: "A clinic in Dallas." } },
          business_name: "Different Clinic Name",
          city: "Austin",
          state: "TX",
          country: "United States",
        }),
      ),
    );
    assert.equal(withListing.band, withoutListing.band);
    assert.equal(
      withListing.websiteIntelligenceFieldCount,
      withoutListing.websiteIntelligenceFieldCount,
    );
    assert.equal(
      withListing.websiteIntelligenceChars,
      withoutListing.websiteIntelligenceChars,
    );
    assert.ok(withListing.websiteIntelligenceFieldCount >= 4);
    assert.equal(withListing.band, "medium");
    const prompt = formatGetoblicDescriptionUserPrompt(
      buildGetoblicDescriptionContext(omittedOnly),
    );
    assert.match(prompt, /Book a weekday clinic visit online/);
    assert.match(prompt, /Physician-led neighborhood clinic care/);
    assert.match(prompt, /Use the website contact form for appointments/);
    assert.match(prompt, /Warm, professional, and family-focused/);
    assert.doesNotMatch(prompt, /UNIQUE_JETSONS_LISTING_COPY/);
    assert.doesNotMatch(prompt, /555-0100|hello@acme\.example/);
  });

  it("does not treat marketing claims as automatic facts", () => {
    const extracted = extractUsableWebsiteIntelligence({
      about: "Family carpet cleaning in Woodland Hills.",
      services: "Hot-water extraction with the X cleaning system.",
      positioning: "We are the #1 carpet cleaner in Los Angeles.",
      messaging: "The best and top-rated team in Southern California.",
      business_knowledge: {
        differentiators: "We use the X cleaning system on wool and synthetics.",
        testimonials: "Best clinic in Texas",
      },
    });
    assert.equal(
      extracted.services,
      "Hot-water extraction with the X cleaning system.",
    );
    assert.equal(
      extracted.positioning,
      "We are the #1 carpet cleaner in Los Angeles.",
    );
    assert.doesNotMatch(extracted.business_knowledge ?? "", /Best clinic/);
    const prompt = formatGetoblicDescriptionUserPrompt(
      buildGetoblicDescriptionContext(
        sampleProspect({
          website_intelligence: {
            about: "Family carpet cleaning in Woodland Hills.",
            services: "Hot-water extraction with the X cleaning system.",
            positioning: "We are the #1 carpet cleaner in Los Angeles.",
          },
        }),
      ),
    );
    assert.match(prompt, /Distinguish FACT from MARKETING CLAIM/);
    assert.match(prompt, /Do not automatically publish ranking or #1 claims/);
    assert.match(GETOBLIC_DESCRIPTION_SYSTEM_PROMPT, /FACT from MARKETING CLAIM/);
    assert.match(
      GETOBLIC_DESCRIPTION_SYSTEM_PROMPT,
      /do not automatically publish "#1 carpet cleaner"/,
    );
  });

  it("does not include opportunity_score, analysis.confidence, or outreach/recommended_action", () => {
    const context = buildGetoblicDescriptionContext(sampleProspect());
    const prompt = formatGetoblicDescriptionUserPrompt(context);
    assert.doesNotMatch(prompt, /opportunity_score/);
    assert.doesNotMatch(prompt, /\b91\b/);
    assert.doesNotMatch(prompt, /confidence|0\.88/);
    assert.doesNotMatch(prompt, /recommended_action|Call this week/);
    assert.doesNotMatch(prompt, /Slow intake|Book today|\$2M|employee_count/);
    assert.doesNotMatch(JSON.stringify(context), /opportunity_score|recommended_action/);
  });

  it("does not dump raw_json, listing copy, or executive analysis into the prompt", () => {
    const prompt = formatGetoblicDescriptionUserPrompt(
      buildGetoblicDescriptionContext(sampleProspect()),
    );
    assert.doesNotMatch(prompt, /wordpress_listing_id":44|analysis/);
    assert.doesNotMatch(prompt, /Imported GetOblic listing copy/);
    assert.doesNotMatch(prompt, /https:\/\/acme\.example/);
    assert.doesNotMatch(prompt, /Current GetOblic listing description/);
    assert.match(prompt, /Stored Website Intelligence \(sole descriptive evidence\)/);
    assert.match(prompt, /Acme Clinic/);
  });
});

describe("GetOblic Description volatile pricing exclusion", () => {
  it("excludes an exact product price and keeps the product name", () => {
    const source = {
      products: [{ name: "Invisible Daily SPF", price: "$42" }],
      about: "Mineral sun care formulated for daily wear.",
    };
    const snapshot = JSON.stringify(source);
    const extracted = extractUsableWebsiteIntelligence(source);
    assert.equal(extracted.products, "Invisible Daily SPF");
    assert.equal(extracted.about, "Mineral sun care formulated for daily wear.");
    assert.doesNotMatch(extracted.products, /\$42|42\.00/);
    assert.doesNotMatch(JSON.stringify(extracted), /\$42|"price"/);
    assert.equal(JSON.stringify(source), snapshot);
    assert.equal(source.products[0].price, "$42");
  });

  it("excludes a service price and keeps the service name", () => {
    const extracted = extractUsableWebsiteIntelligence({
      services: [{ title: "Signature facial", cost: "$120" }, "Express glow for $68"],
    });
    assert.match(extracted.services, /Signature facial/);
    assert.match(extracted.services, /Express glow/);
    assert.doesNotMatch(extracted.services, /\$120|\$68|for \$/);
  });

  it("excludes price ranges from website intelligence before generation", () => {
    const extracted = extractUsableWebsiteIntelligence({
      products:
        "Retail formulas with prices ranging from $36.00 to $168.30, including Invisible Daily SPF.",
      services: "Treatments between $80 and $240 depending on the protocol.",
    });
    assert.match(extracted.products, /Invisible Daily SPF/);
    assert.match(extracted.products, /Retail formulas/);
    assert.doesNotMatch(extracted.products, /\$36\.00|\$168\.30|ranging from|prices ranging/);
    assert.doesNotMatch(extracted.services, /\$80|\$240|between \$/);
    assert.doesNotMatch(
      stripVolatilePricing("prices start at $36 and from $40 to $90"),
      /\$36|\$40|\$90|prices start at|from \$/,
    );
  });

  it("excludes promotional and discount prices while keeping the offer item", () => {
    const extracted = extractUsableWebsiteIntelligence({
      products: [
        {
          product: "Repair Serum",
          sale_price: "$54",
          discount: "20% off",
        },
      ],
      messaging: "Repair Serum on promotional pricing and a special offer this week.",
    });
    assert.match(extracted.products, /Repair Serum/);
    assert.doesNotMatch(extracted.products, /\$54|20% off|sale_price/);
    assert.match(extracted.messaging, /Repair Serum/);
    assert.doesNotMatch(
      extracted.messaging,
      /promotional pricing|special offer|\$54|20%/,
    );
  });

  it("excludes qualitative pricing language and leaves other factual WI", () => {
    const extracted = extractUsableWebsiteIntelligence({
      about: "Affordable physician-grade skincare with inexpensive daily SPF.",
      positioning: "Budget-friendly and competitively priced clinic care.",
      products: "Invisible Daily SPF",
      process: "Consultation before the first treatment.",
      methods: "Mineral filters and barrier-supportive formulas.",
    });
    assert.match(extracted.about, /physician-grade skincare/);
    assert.match(extracted.about, /daily SPF/);
    assert.doesNotMatch(
      extracted.about,
      /affordable|inexpensive|budget-friendly|competitively priced/i,
    );
    assert.doesNotMatch(
      extracted.positioning,
      /budget-friendly|competitively priced/i,
    );
    assert.equal(extracted.products, "Invisible Daily SPF");
    assert.equal(extracted.process, "Consultation before the first treatment.");
    assert.equal(
      extracted.methods,
      "Mineral filters and barrier-supportive formulas.",
    );
  });

  it("excludes pricing from previously omitted website-derived fields", () => {
    const extracted = extractUsableWebsiteIntelligence({
      cta: "Book a weekday visit — prices start at $99.",
      trust_signals: "Affordable physician-led care with 20% off new patients.",
      contact_information: "Use the website contact form.",
      brand_tone: "Warm and professional.",
      business_knowledge: {
        cta: "Request a consult from $180.",
        trust_signals: "Competitively priced neighborhood care.",
      },
    });
    assert.match(extracted.cta, /Book a weekday visit/);
    assert.match(extracted.trust_signals, /physician-led care/);
    assert.equal(extracted.contact_information, "Use the website contact form.");
    assert.equal(extracted.brand_tone, "Warm and professional.");
    assert.doesNotMatch(extracted.cta, /\$99|prices start at/);
    assert.doesNotMatch(extracted.trust_signals, /affordable|20% off/i);
    assert.doesNotMatch(extracted.business_knowledge, /\$180|competitively priced/i);
  });

  it("does not pass stripped pricing into the generation prompt", () => {
    const context = buildGetoblicDescriptionContext(
      sampleProspect({
        website_intelligence: {
          products: [
            { name: "Invisible Daily SPF", price: "$42" },
            "Barrier cream with prices ranging from $36.00 to $168.30",
          ],
          services: [{ name: "Custom facial", rate: "from $180" }],
          about: "Affordable mineral sun care and 20% off starter kits.",
          process: "Skin analysis before product selection.",
        },
        notes: "Mention the $42 SPF if asked.",
        additional_context: "Competitively priced versus nearby spas.",
        raw_json: {
          observed: {
            description: "Clinic copy with prices start at $36.00.",
            text_hours: "Monday–Friday 8:00 AM–6:00 PM",
          },
        },
      }),
    );
    const prompt = formatGetoblicDescriptionUserPrompt(context);
    assert.match(prompt, /Invisible Daily SPF/);
    assert.match(prompt, /Barrier cream/);
    assert.match(prompt, /Custom facial/);
    assert.match(prompt, /Skin analysis before product selection/);
    assert.doesNotMatch(prompt, /Monday–Friday 8:00 AM–6:00 PM/);
    assert.doesNotMatch(prompt, /Mention the \$42 SPF|Competitively priced versus nearby spas/);
    assert.doesNotMatch(prompt, /Clinic copy with prices start at/);
    assert.match(
      GETOBLIC_DESCRIPTION_SYSTEM_PROMPT,
      /keep the product or service fact and omit the price/,
    );
    assert.doesNotMatch(prompt, /\$42|\$36\.00|\$168\.30|\$180/);
    assert.doesNotMatch(prompt, /20% off|prices start at|ranging from/);
    assert.doesNotMatch(prompt, /affordable|competitively priced/i);
    assert.doesNotMatch(JSON.stringify(context.websiteIntelligence), /\$42|\$36|20% off/);
  });

  it("does not scrape and does not mutate source records", async () => {
    const observed = {
      description: "SOURCE LISTING COPY MUST STAY $36.00",
      permalink: "https://getoblic.com/listing/acme",
    };
    const websiteIntelligence = {
      products: [{ name: "Invisible Daily SPF", price: "$42" }],
      about: "Mineral sun care.",
    };
    const websiteSnapshot = JSON.stringify(websiteIntelligence);
    const prospect = sampleProspect({
      website_intelligence: websiteIntelligence,
      raw_json: { observed },
    });
    const service = read("services/prospects/prospectGetoblicDescription.ts");

    await generateProspectGetoblicDescription(
      { prospectId: prospect.id, organizationId: prospect.organization_id },
      {
        getProspect: async () => prospect,
        generateReview: async (prompt) => {
          assert.match(prompt, /Invisible Daily SPF/);
          assert.doesNotMatch(prompt, /\$42|\$36\.00/);
          assert.doesNotMatch(prompt, /SOURCE LISTING COPY MUST STAY/);
          assert.doesNotMatch(prompt, /deep-scrape|queueDeepScrape|scrape the website/);
          return "Acme Clinic offers Invisible Daily SPF in Dallas.";
        },
        persistGeneratedListingDescription: async (current, value) => {
          assert.equal(
            (current.raw_json?.observed as { description?: string }).description,
            "SOURCE LISTING COPY MUST STAY $36.00",
          );
          return value;
        },
      },
    );

    assert.equal(observed.description, "SOURCE LISTING COPY MUST STAY $36.00");
    assert.equal(JSON.stringify(websiteIntelligence), websiteSnapshot);
    assert.equal(websiteIntelligence.products[0].price, "$42");
    assert.doesNotMatch(service, /ensureProspectGenerationQueued/);
    assert.doesNotMatch(service, /deep-scrape|deepScrape|queueDeepScrape/);
    assert.doesNotMatch(service, /getoblicWordpressClient|updateListing|putListing/);
  });
});

describe("GetOblic Description output validation", () => {
  it("validates non-empty trimmed output", () => {
    assert.equal(
      validateGeneratedListingDescription("  A Dallas clinic serving families.  "),
      "A Dallas clinic serving families.",
    );
    assert.throws(
      () => validateGeneratedListingDescription("   "),
      ProspectGetoblicDescriptionError,
    );
    assert.throws(
      () => validateGeneratedListingDescription(null),
      ProspectGetoblicDescriptionError,
    );
  });

  it("strips accidental Description: wrappers and markdown fences", () => {
    assert.equal(
      sanitizeGeneratedListingDescription("Description: A Dallas clinic serving families."),
      "A Dallas clinic serving families.",
    );
    assert.equal(
      sanitizeGeneratedListingDescription("```\nA Dallas clinic serving families.\n```"),
      "A Dallas clinic serving families.",
    );
  });

  it("enforces the 4000-character safety cap", () => {
    const tooLong = "A".repeat(GETOBLIC_DESCRIPTION_MAX_CHARS + 80);
    const validated = validateGeneratedListingDescription(tooLong);
    assert.ok(validated.length <= GETOBLIC_DESCRIPTION_MAX_CHARS);
    assert.equal(GETOBLIC_DESCRIPTION_MAX_CHARS, 4000);
  });

  it("accepts valid text under the low-information soft target", () => {
    const shortCopy =
      "Acme Clinic provides neighborhood primary care in Dallas.";
    assert.ok(shortCopy.length < GETOBLIC_DESCRIPTION_DEPTH_TARGETS.low.min);
    assert.equal(validateGeneratedListingDescription(shortCopy), shortCopy);
  });

  it("rejects Jetsons-style reasoning scaffolding and does not salvage a final paragraph", () => {
    const contaminated = [
      "STAGE 1 — FACT SELECTION",
      "Synthesized Fact List",
      "Confidence Score: 0.91",
      "Strategizing for Synthesis",
      "STAGE 2 — EDITORIAL SYNTHESIS",
      "Acme Clinic provides neighborhood primary care in Dallas.",
    ].join("\n");
    assert.equal(containsGetoblicDescriptionContamination(contaminated), true);
    assert.throws(
      () => validateGeneratedListingDescription(contaminated),
      (error: unknown) =>
        error instanceof ProspectGetoblicDescriptionError &&
        error.code === "INVALID_OUTPUT" &&
        error.httpStatus === 502,
    );
    assert.throws(
      () =>
        validateGeneratedListingDescription(
          `Description:\n${contaminated}`,
        ),
      (error: unknown) =>
        error instanceof ProspectGetoblicDescriptionError &&
        error.code === "INVALID_OUTPUT",
    );
    assert.throws(
      () => validateGeneratedListingDescription(`\`\`\`\n${contaminated}\n\`\`\``),
      (error: unknown) =>
        error instanceof ProspectGetoblicDescriptionError &&
        error.code === "INVALID_OUTPUT",
    );
  });

  it("does not apply a post-generation phrase rejection filter", () => {
    const copy =
      "Acme Clinic aims to provide neighborhood primary care in Dallas.";
    assert.equal(validateGeneratedListingDescription(copy), copy);
    const service = read("services/prospects/prospectGetoblicDescription.ts");
    assert.doesNotMatch(
      service,
      /reject.*aims to|invalid.*aims to|forbiddenPhrases|FILLER_PHRASES/,
    );
  });
});

describe("GetOblic Description generation and persistence", () => {
  it("persists the generated object with generatedAt and overwrites only that column", async () => {
    const sourceDescription = "Imported GetOblic listing copy.";
    const prospect = sampleProspect({
      generated_listing_description: {
        description: "Previous generated copy.",
        generatedAt: "2026-09-01T00:00:00.000Z",
      },
    });
    const persistCalls: Array<Record<string, unknown>> = [];
    let generateCalls = 0;

    const generated = await generateProspectGetoblicDescription(
      { prospectId: prospect.id, organizationId: prospect.organization_id },
      {
        getProspect: async () => prospect,
        generateReview: async (prompt, meta) => {
          generateCalls += 1;
          assert.match(prompt, /Acme Clinic/);
          assert.match(prompt, /Dallas/);
          assert.match(prompt, /Primary care and wellness visits/);
          assert.doesNotMatch(prompt, /Imported GetOblic listing copy/);
          assert.doesNotMatch(prompt, /Neighborhood care|Monday–Friday 8:00 AM–6:00 PM/);
          assert.doesNotMatch(prompt, /https:\/\/linkedin\.com\/company\/acme|https:\/\/maps\.google\.com/);
          assert.doesNotMatch(prompt, /Prefers weekday appointments|Family-owned since/);
          assert.doesNotMatch(prompt, /opportunity_score|recommended_action/);
          assert.doesNotMatch(prompt, /\$99|\$36|affordable|20% off/);
          assert.equal(meta?.systemPrompt, GETOBLIC_DESCRIPTION_SYSTEM_PROMPT);
          assert.equal(meta?.generationKind, "generic_review");
          return "Acme Clinic provides neighborhood primary care in Dallas.";
        },
        persistGeneratedListingDescription: async (current, value) => {
          persistCalls.push({
            prospectId: current.id,
            raw_json: current.raw_json,
            generated: value,
          });
          return value;
        },
        now: () => "2026-09-10T12:00:00.000Z",
      },
    );

    assert.equal(generateCalls, 1);
    assert.equal(
      generated.description,
      "Acme Clinic provides neighborhood primary care in Dallas.",
    );
    assert.equal(generated.generatedAt, "2026-09-10T12:00:00.000Z");
    assert.equal(persistCalls.length, 1);
    assert.equal(
      readObservedListingDescription(persistCalls[0].raw_json as Record<string, unknown>),
      sourceDescription,
    );
    assert.equal(
      (prospect.raw_json?.observed as { description?: string }).description,
      sourceDescription,
    );
  });

  it("reaches generation from previously omitted website-derived Website Intelligence only", async () => {
    const prospect = sampleProspect({
      website_intelligence: omittedWebsiteIntelligenceFields(),
      raw_json: { observed: { description: DISTINCTIVE_LISTING_COPY } },
    });
    let generateCalls = 0;

    const generated = await generateProspectGetoblicDescription(
      { prospectId: prospect.id, organizationId: prospect.organization_id },
      {
        getProspect: async () => prospect,
        generateReview: async (prompt) => {
          generateCalls += 1;
          assert.match(prompt, /Book a weekday clinic visit online/);
          assert.match(prompt, /Physician-led neighborhood clinic care/);
          assert.match(prompt, /Use the website contact form for appointments/);
          assert.match(prompt, /Warm, professional, and family-focused/);
          assert.doesNotMatch(prompt, /UNIQUE_JETSONS_LISTING_COPY|orange shag carpet/);
          assert.doesNotMatch(prompt, /Imported GetOblic listing copy/);
          assert.doesNotMatch(prompt, /Clinics|Healthcare|555-0100|hello@acme/);
          return "Acme Clinic offers weekday clinic visits in Dallas.";
        },
        persistGeneratedListingDescription: async (_current, value) => value,
      },
    );

    assert.equal(generateCalls, 1);
    assert.equal(
      generated.description,
      "Acme Clinic offers weekday clinic visits in Dallas.",
    );
  });

  it("does not call the model or overwrite generated copy when Website Intelligence is missing", async () => {
    const previous = {
      description: "Previous generated copy.",
      generatedAt: "2026-09-01T00:00:00.000Z",
    };
    const prospect = sampleProspect({
      website_intelligence: null,
      generated_listing_description: previous,
    });
    let generateCalls = 0;
    let persistCalls = 0;

    await assert.rejects(
      () =>
        generateProspectGetoblicDescription(
          { prospectId: prospect.id, organizationId: prospect.organization_id },
          {
            getProspect: async () => prospect,
            generateReview: async () => {
              generateCalls += 1;
              return "Should not be generated.";
            },
            persistGeneratedListingDescription: async () => {
              persistCalls += 1;
              throw new Error("should not persist");
            },
          },
        ),
      (error: unknown) =>
        error instanceof ProspectGetoblicDescriptionError &&
        error.code === "WEBSITE_INTELLIGENCE_REQUIRED" &&
        error.httpStatus === 422,
    );

    assert.equal(generateCalls, 0);
    assert.equal(persistCalls, 0);
    assert.deepEqual(prospect.generated_listing_description, previous);
    assert.equal(
      (prospect.raw_json?.observed as { description?: string }).description,
      "Imported GetOblic listing copy.",
    );
  });

  it("still requires Website Intelligence when only listing copy or placeholders are present", async () => {
    const previous = {
      description: "Previous generated copy.",
      generatedAt: "2026-09-01T00:00:00.000Z",
    };
    const prospect = sampleProspect({
      website_intelligence: {
        cta: "n/a",
        trust_signals: "none",
        contact_information: "",
        brand_tone: "placeholder",
        headings: "Home",
        paragraphs: "Raw dump.",
      },
      generated_listing_description: previous,
      raw_json: { observed: { description: DISTINCTIVE_LISTING_COPY } },
    });
    let generateCalls = 0;
    let persistCalls = 0;

    await assert.rejects(
      () =>
        generateProspectGetoblicDescription(
          { prospectId: prospect.id, organizationId: prospect.organization_id },
          {
            getProspect: async () => prospect,
            generateReview: async () => {
              generateCalls += 1;
              return "Should not be generated.";
            },
            persistGeneratedListingDescription: async () => {
              persistCalls += 1;
              throw new Error("should not persist");
            },
          },
        ),
      (error: unknown) =>
        error instanceof ProspectGetoblicDescriptionError &&
        error.code === "WEBSITE_INTELLIGENCE_REQUIRED" &&
        error.httpStatus === 422,
    );

    assert.equal(generateCalls, 0);
    assert.equal(persistCalls, 0);
    assert.deepEqual(prospect.generated_listing_description, previous);
  });

  it("does not persist Jetsons-style contaminated output", async () => {
    const previous = {
      description: "Previous generated copy.",
      generatedAt: "2026-09-01T00:00:00.000Z",
    };
    const prospect = sampleProspect({
      generated_listing_description: previous,
    });
    let persistCalls = 0;

    await assert.rejects(
      () =>
        generateProspectGetoblicDescription(
          { prospectId: prospect.id, organizationId: prospect.organization_id },
          {
            getProspect: async () => prospect,
            generateReview: async () =>
              [
                "STAGE 1 — FACT SELECTION",
                "Synthesized Fact List",
                "Confidence Score",
                "Strategizing for Synthesis",
                "Acme Clinic provides neighborhood primary care in Dallas.",
              ].join("\n"),
            persistGeneratedListingDescription: async () => {
              persistCalls += 1;
              throw new Error("should not persist");
            },
          },
        ),
      (error: unknown) =>
        error instanceof ProspectGetoblicDescriptionError &&
        error.code === "INVALID_OUTPUT",
    );

    assert.equal(persistCalls, 0);
    assert.deepEqual(prospect.generated_listing_description, previous);
  });

  it("does not persist malformed output and leaves the previous generated copy intact", async () => {
    const previous = {
      description: "Previous generated copy.",
      generatedAt: "2026-09-01T00:00:00.000Z",
    };
    const prospect = sampleProspect({
      generated_listing_description: previous,
    });
    let persistCalls = 0;

    await assert.rejects(
      () =>
        generateProspectGetoblicDescription(
          { prospectId: prospect.id, organizationId: prospect.organization_id },
          {
            getProspect: async () => prospect,
            generateReview: async () => "```\nDescription:\n```",
            persistGeneratedListingDescription: async () => {
              persistCalls += 1;
              throw new Error("should not persist");
            },
          },
        ),
      ProspectGetoblicDescriptionError,
    );

    assert.equal(persistCalls, 0);
    assert.deepEqual(prospect.generated_listing_description, previous);
    assert.equal(
      (prospect.raw_json?.observed as { description?: string }).description,
      "Imported GetOblic listing copy.",
    );
  });

  it("never mutates prospect.raw_json.observed.description when generating or refreshing", async () => {
    const observed = {
      description: "SOURCE LISTING COPY MUST STAY",
      permalink: "https://getoblic.com/listing/acme",
    };
    const prospect = sampleProspect({
      raw_json: { observed },
      generated_listing_description: {
        description: "Old generated copy",
        generatedAt: "2026-09-01T00:00:00.000Z",
      },
    });

    await generateProspectGetoblicDescription(
      { prospectId: prospect.id, organizationId: prospect.organization_id },
      {
        getProspect: async () => prospect,
        generateReview: async () => "Fresh directory description for Acme Clinic.",
        persistGeneratedListingDescription: async (current, value) => {
          assert.equal(
            (current.raw_json?.observed as { description?: string }).description,
            "SOURCE LISTING COPY MUST STAY",
          );
          assert.equal(observed.description, "SOURCE LISTING COPY MUST STAY");
          return value;
        },
      },
    );

    assert.equal(observed.description, "SOURCE LISTING COPY MUST STAY");
    assert.equal(
      (prospect.raw_json?.observed as { description?: string }).description,
      "SOURCE LISTING COPY MUST STAY",
    );
  });

  it("does not trigger scrape or full prospect generation", () => {
    const service = read("services/prospects/prospectGetoblicDescription.ts");
    assert.doesNotMatch(service, /ensureProspectGenerationQueued/);
    assert.doesNotMatch(service, /homepageOnlyWebsiteIntelligenceProvider/);
    assert.doesNotMatch(service, /deep-scrape|deepScrape|queueDeepScrape/);
    assert.doesNotMatch(service, /claimGetOblic|releaseGetOblic|knowledge-base/);
    assert.doesNotMatch(service, /from-getoblic|getoblicWordpressClient/);
    assert.match(service, /website_intelligence/);
    assert.match(service, /generated_listing_description/);
    assert.match(persistGeneratedListingDescription.toString(), /generated_listing_description/);
    assert.doesNotMatch(
      persistGeneratedListingDescription.toString(),
      /raw_json/,
    );
  });

  it("accepts a homepage_only pipeline-shaped Website Intelligence contract", async () => {
    const homepageOnlyPipeline = {
      provider: "homepage_only",
      url: "https://tuli.example",
      scraped_at: "2026-09-10T00:00:00.000Z",
      title: "TULI Royal Beauty Salon Miami",
      headings: "Facials\nBrows\nBridal",
      paragraphs: "Raw homepage paragraph dump that is not a research section.",
      about: "A Miami beauty salon focused on brows, facials, and bridal prep.",
      services: "Brow sculpting, hydrafacials, and bridal makeup.",
      products: "In-salon brow aftercare kits.",
      positioning: "Neighborhood luxury beauty in Miami.",
      value_proposition: "Appointment-based brow and facial care.",
      differentiators: "Bridal prep with the same brow artist every visit.",
      target_audience: "Miami clients booking brows and facials.",
      messaging: "Royal beauty, appointment-only.",
      cta: "Book a brow or facial appointment.",
      trust_signals: "Repeat bridal clients in Miami.",
      contact_information: "Use the salon website booking form.",
      brand_tone: "Warm and polished.",
    };
    const prospect = sampleProspect({
      business_name: "TULI Royal Beauty Salon Miami",
      website_intelligence: homepageOnlyPipeline,
    });
    const extracted = extractUsableWebsiteIntelligence(prospect.website_intelligence);
    assert.equal(hasUsableWebsiteIntelligence(extracted), true);
    assert.equal(
      extracted.about,
      "A Miami beauty salon focused on brows, facials, and bridal prep.",
    );
    assert.equal(
      extracted.services,
      "Brow sculpting, hydrafacials, and bridal makeup.",
    );
    assert.equal(extracted.provider, undefined);
    assert.equal(extracted.title, undefined);
    assert.equal(extracted.headings, undefined);
    assert.equal(extracted.paragraphs, undefined);

    let generateCalls = 0;
    const generated = await generateProspectGetoblicDescription(
      { prospectId: prospect.id, organizationId: prospect.organization_id },
      {
        getProspect: async () => prospect,
        generateReview: async (prompt) => {
          generateCalls += 1;
          assert.match(prompt, /A Miami beauty salon focused on brows/);
          assert.match(prompt, /Brow sculpting, hydrafacials, and bridal makeup/);
          assert.doesNotMatch(prompt, /Raw homepage paragraph dump/);
          return "TULI Royal Beauty Salon Miami offers appointment-based brow and facial care.";
        },
        persistGeneratedListingDescription: async (_current, value) => value,
      },
    );
    assert.equal(generateCalls, 1);
    assert.match(generated.description, /TULI Royal Beauty Salon Miami/);
  });

  it("accepts a deep_v1 pipeline-shaped Website Intelligence contract and ignores pages excerpts", async () => {
    const distinctiveExcerpt =
      "PAGES_EXCERPT_MUST_NOT_BECOME_EVIDENCE secret menu and unpublished hours.";
    const deepV1Pipeline = {
      provider: "deep_v1",
      url: "https://tracyhudson.example",
      scraped_at: "2026-09-10T00:00:00.000Z",
      pages_analyzed: 5,
      pages: [
        {
          url: "https://tracyhudson.example",
          title: "Tracy Hudson Skin Care",
          page_type: "home",
          excerpt: distinctiveExcerpt,
        },
        {
          url: "https://tracyhudson.example/services",
          title: "Services",
          page_type: "services",
          excerpt: "PAGES_EXCERPT_SERVICES_MUST_NOT_BECOME_EVIDENCE laser add-on.",
        },
      ],
      business_knowledge: {
        about: "Physician-informed skin care for daily barrier support.",
        services: "Custom facials and mineral sun care consults.",
        products: "Invisible Daily SPF and barrier cream.",
        solutions: "Barrier-supportive routines after in-studio analysis.",
        specialties: "Mineral SPF and post-facial aftercare.",
        target_audience: "Clients who want physician-informed skin care.",
        customer_groups: "Adults booking facials and SPF consults.",
        differentiators: "In-studio analysis before product selection.",
        process: "Skin analysis before the first treatment.",
        methods: "Mineral filters and barrier-supportive formulas.",
        positioning: "Clinical skin care without a medical-spa pitch.",
        messaging: "Protect the barrier first.",
        value_proposition: "Custom facial protocols with daily SPF.",
        cta: "Book a skin analysis.",
        trust_signals: "Repeat facial clients.",
        contact_information: "Book through the studio website.",
        brand_tone: "Clinical and calm.",
        training: "",
        faq: "",
        team: "",
        case_studies: "",
        pricing: "$180 facials",
        testimonials: "Best clinic in Texas",
      },
      crawl_summary: {
        pages_analyzed: 5,
        services_discovered: 2,
        faqs_discovered: 0,
        testimonials_discovered: 0,
        team_pages_discovered: 0,
        commercial_pages_discovered: 1,
      },
      about: "Physician-informed skin care for daily barrier support.",
      services: "Custom facials and mineral sun care consults.",
      products: "Invisible Daily SPF and barrier cream.",
      positioning: "Clinical skin care without a medical-spa pitch.",
      target_audience: "Clients who want physician-informed skin care.",
      messaging: "Protect the barrier first.",
      value_proposition: "Custom facial protocols with daily SPF.",
      cta: "Book a skin analysis.",
      differentiators: "In-studio analysis before product selection.",
      trust_signals: "Repeat facial clients.",
      contact_information: "Book through the studio website.",
      brand_tone: "Clinical and calm.",
      headings: "Home\nServices\nContact",
      paragraphs: "Raw deep-scrape paragraph dump that is not a research section.",
    };
    const prospect = sampleProspect({
      business_name: "Tracy Hudson Skin Care",
      website_intelligence: deepV1Pipeline,
    });
    const extracted = extractUsableWebsiteIntelligence(prospect.website_intelligence);
    assert.equal(hasUsableWebsiteIntelligence(extracted), true);
    assert.equal(
      extracted.about,
      "Physician-informed skin care for daily barrier support.",
    );
    assert.equal(
      extracted.services,
      "Custom facials and mineral sun care consults.",
    );
    assert.match(extracted.business_knowledge, /Physician-informed skin care/);
    assert.match(extracted.business_knowledge, /Custom facials and mineral sun care/);
    assert.doesNotMatch(
      JSON.stringify(extracted),
      /PAGES_EXCERPT_MUST_NOT_BECOME_EVIDENCE|PAGES_EXCERPT_SERVICES_MUST_NOT_BECOME_EVIDENCE/,
    );
    assert.equal(extracted.headings, undefined);
    assert.equal(extracted.paragraphs, undefined);
    assert.doesNotMatch(extracted.business_knowledge, /\$180|Best clinic/);

    let generateCalls = 0;
    const generated = await generateProspectGetoblicDescription(
      { prospectId: prospect.id, organizationId: prospect.organization_id },
      {
        getProspect: async () => prospect,
        generateReview: async (prompt) => {
          generateCalls += 1;
          assert.match(prompt, /Physician-informed skin care for daily barrier support/);
          assert.match(prompt, /Custom facials and mineral sun care consults/);
          assert.match(prompt, /Invisible Daily SPF and barrier cream/);
          assert.doesNotMatch(prompt, /PAGES_EXCERPT_MUST_NOT_BECOME_EVIDENCE/);
          assert.doesNotMatch(prompt, /PAGES_EXCERPT_SERVICES_MUST_NOT_BECOME_EVIDENCE/);
          assert.doesNotMatch(prompt, /Raw deep-scrape paragraph dump/);
          return "Tracy Hudson Skin Care offers custom facials and mineral sun care consults.";
        },
        persistGeneratedListingDescription: async (_current, value) => value,
      },
    );
    assert.equal(generateCalls, 1);
    assert.match(generated.description, /Tracy Hudson Skin Care/);
  });

  it("still requires Website Intelligence when Ready executive intelligence exists and WI is null", async () => {
    const previous = {
      description: "Previous generated copy.",
      generatedAt: "2026-09-01T00:00:00.000Z",
    };
    const prospect = sampleProspect({
      business_name: "K's Hamburger Shop",
      website: "https://kshamburgershop.example",
      source: "getoblic",
      status: "Ready",
      opportunity_score: 80,
      website_intelligence: null,
      ads_content: "KS_KNOWLEDGE_BASE smash burgers and weekday lunch specials.",
      notes: "KS_EXECUTIVE_ANALYSIS operator should call this week.",
      additional_context: "KS_KB_ENHANCEMENT family counter-service since 1982.",
      generated_listing_description: previous,
      raw_json: {
        origin: "getoblic_directory",
        observed: {
          description: "KS_LISTING_COPY juicy smash burgers downtown.",
        },
        analysis: {
          executive_summary: "KS_EXECUTIVE_VERSION Ready at 80% completeness.",
        },
      },
    });
    let generateCalls = 0;
    let persistCalls = 0;

    await assert.rejects(
      () =>
        generateProspectGetoblicDescription(
          { prospectId: prospect.id, organizationId: prospect.organization_id },
          {
            getProspect: async () => prospect,
            generateReview: async () => {
              generateCalls += 1;
              return "Should not be generated.";
            },
            persistGeneratedListingDescription: async () => {
              persistCalls += 1;
              throw new Error("should not persist");
            },
          },
        ),
      (error: unknown) =>
        error instanceof ProspectGetoblicDescriptionError &&
        error.code === "WEBSITE_INTELLIGENCE_REQUIRED" &&
        error.httpStatus === 422,
    );

    assert.equal(generateCalls, 0);
    assert.equal(persistCalls, 0);
    assert.deepEqual(prospect.generated_listing_description, previous);
    assert.equal(prospect.website_intelligence, null);
    assert.equal(prospect.status, "Ready");
    const context = buildGetoblicDescriptionContext(prospect);
    assert.equal(hasUsableWebsiteIntelligence(context.websiteIntelligence), false);
    assert.doesNotMatch(
      JSON.stringify(context),
      /KS_LISTING_COPY|KS_EXECUTIVE_ANALYSIS|KS_KNOWLEDGE_BASE|KS_KB_ENHANCEMENT|KS_EXECUTIVE_VERSION/,
    );
  });

  it("rejects a missing org-scoped prospect", async () => {
    await assert.rejects(
      () =>
        generateProspectGetoblicDescription(
          { prospectId: "missing", organizationId: "org-1" },
          { getProspect: async () => null },
        ),
      (error: unknown) =>
        error instanceof ProspectGetoblicDescriptionError &&
        error.code === "NOT_FOUND" &&
        error.httpStatus === 404,
    );
  });
});
