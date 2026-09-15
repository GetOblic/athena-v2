import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, it } from "node:test";
import { IdentityWebsiteKnowledge } from "../../components/identity/IdentityWebsiteKnowledge";
import {
  hasInheritedWebsiteStudy,
  hasSuccessfulAthenaTraining,
  readPublicWebsiteStudySections,
  readWebsiteKnowledgeFlags,
  shouldDisplayClientDeepScrapeCompletion,
} from "../../components/identity/identityPagePresentation";
import { en } from "../../lib/tenantI18n/messages/en";
import { fr } from "../../lib/tenantI18n/messages/fr";
import type { AthenaIdentity } from "../../services/identity/identityService";

const ROOT = process.cwd();

function read(relativePath: string): string {
  return readFileSync(join(ROOT, relativePath), "utf8");
}

function sampleIdentity(
  overrides: Partial<AthenaIdentity> = {},
): AthenaIdentity {
  return {
    id: "id-1",
    user_id: "user-1",
    organization_id: "org-1",
    greeting_name: null,
    about_you: null,
    expertise: null,
    website: "https://acme.example",
    brain_status: "pending",
    brain_last_updated: null,
    master_profile: null,
    master_profile_version: null,
    master_profile_generated_at: null,
    website_intelligence: {
      provider: "homepage_only",
      url: "https://acme.example",
      scraped_at: "2026-08-02T00:00:00.000Z",
      about: "Family plumbing since 1998",
      services: "Repairs and installs",
    },
    last_deep_scrape_at: null,
    last_deep_scrape_pages: null,
    created_at: "2026-09-16T00:00:00.000Z",
    updated_at: "2026-09-16T00:00:00.000Z",
    ...overrides,
  };
}

describe("BIC-1 inherited website study presentation", () => {
  it("shows inherited WI on an untrained Identity without claiming a trained Brain", () => {
    const identity = sampleIdentity();
    assert.equal(hasSuccessfulAthenaTraining(identity), false);
    assert.equal(hasInheritedWebsiteStudy(identity), true);
    assert.equal(shouldDisplayClientDeepScrapeCompletion(identity), false);

    const flags = readWebsiteKnowledgeFlags(identity);
    assert.equal(flags.hasUsableWebsiteIntelligence, true);
    assert.equal(flags.hasInheritedWebsiteStudy, true);
    assert.equal(flags.hasDeepIntelligence, false);

    const sections = readPublicWebsiteStudySections(
      identity.website_intelligence,
    );
    assert.deepEqual(
      sections.map((section) => section.key),
      ["about", "services"],
    );

    const html = renderToStaticMarkup(
      createElement(IdentityWebsiteKnowledge, {
        identity,
        messages: en.identity,
        language: "en",
        trained: false,
        deepScrape: null,
      }),
    );
    assert.match(html, /Website knowledge/);
    assert.match(html, /id="identity-website-knowledge"/);
    assert.match(html, /Train Athena/);
    assert.match(html, /aria-expanded="false"/);
    assert.doesNotMatch(html, /What Athena knows/);
    assert.doesNotMatch(html, /Last deep learning/);
    assert.doesNotMatch(html, /ready Business Brain|Brain is ready/i);
    assert.doesNotMatch(html, /notes|additional_context|executive_summary/);

    const website = read("components/identity/IdentityWebsiteKnowledge.tsx");
    assert.match(website, /page\.websiteAlreadyStudied/);
    assert.match(website, /page\.websiteAlreadyStudiedDeep/);
    assert.match(website, /page\.websiteInheritedNeedsTrain/);
    assert.match(website, /readPublicWebsiteStudySections/);
    assert.match(website, /shouldDisplayClientDeepScrapeCompletion/);
    assert.doesNotMatch(website, /coverage\?\.lastDeepScrapeAt/);
    assert.equal(
      en.identity.page.websiteAlreadyStudied.includes("not a trained Business Brain"),
      true,
    );
    assert.equal(
      en.identity.page.websiteInheritedNeedsTrain.includes(
        "train Athena remain necessary",
      ),
      true,
    );
  });

  it("shows inherited deep pages without treating Prospect scraped_at as client Deep Scrape", () => {
    const identity = sampleIdentity({
      website_intelligence: {
        provider: "deep_v1",
        url: "https://acme.example",
        scraped_at: "2026-08-01T00:00:00.000Z",
        pages_analyzed: 4,
        pages: [
          {
            url: "https://acme.example/about",
            title: "About",
            page_type: "about",
            excerpt: "About us",
          },
        ],
        business_knowledge: { about: "Deep about" },
        about: "Deep about",
      },
    });
    assert.equal(hasInheritedWebsiteStudy(identity), true);
    assert.equal(shouldDisplayClientDeepScrapeCompletion(identity), false);

    const html = renderToStaticMarkup(
      createElement(IdentityWebsiteKnowledge, {
        identity,
        messages: en.identity,
        language: "en",
        trained: false,
        deepScrape: null,
      }),
    );
    assert.match(html, /Website knowledge/);
    assert.match(html, /Train Athena/);
    assert.doesNotMatch(html, /Last deep learning/);
    assert.doesNotMatch(html, /August 1|2026-08-01/);
    assert.match(
      en.identity.page.websiteAlreadyStudiedDeep,
      /not a completed Deep Scrape/,
    );
    const flags = readWebsiteKnowledgeFlags(identity);
    assert.equal(flags.hasDeepIntelligence, true);
    assert.equal(flags.hasInheritedWebsiteStudy, true);
  });

  it("does not invent inherited knowledge for an ordinary empty tenant", () => {
    assert.equal(hasInheritedWebsiteStudy(null), false);
    assert.equal(
      hasInheritedWebsiteStudy(
        sampleIdentity({
          website: null,
          website_intelligence: null,
        }),
      ),
      false,
    );

    const html = renderToStaticMarkup(
      createElement(IdentityWebsiteKnowledge, {
        identity: null,
        messages: en.identity,
        language: "en",
        trained: false,
        deepScrape: null,
      }),
    );
    assert.equal(html, "");
    assert.doesNotMatch(html, /Athena already studied/);
  });

  it("keeps a website URL without WI on the untrained will-study path", () => {
    const identity = sampleIdentity({ website_intelligence: null });
    assert.equal(hasInheritedWebsiteStudy(identity), false);
    const html = renderToStaticMarkup(
      createElement(IdentityWebsiteKnowledge, {
        identity,
        messages: en.identity,
        language: "en",
        trained: false,
        deepScrape: null,
      }),
    );
    assert.match(html, /Website knowledge/);
    assert.match(html, /Train Athena/);
    const website = read("components/identity/IdentityWebsiteKnowledge.tsx");
    assert.match(website, /page\.websiteWillStudy/);
    assert.match(website, /showInheritedStudy \? \(/);
  });

  it("wires untrained Identity to Website Knowledge without opening What Athena knows", () => {
    const page = read("app/identity/page.tsx");
    const untrainedStart = page.indexOf(") : (");
    const untrainedBlock = page.slice(untrainedStart);
    assert.match(untrainedBlock, /IdentityWebsiteKnowledge/);
    assert.doesNotMatch(untrainedBlock, /IdentityWhatAthenaKnows/);
    assert.doesNotMatch(untrainedBlock, /IdentityAdvancedUnderstanding/);
    assert.match(page, /hasSuccessfulAthenaTraining/);
    assert.match(untrainedBlock, /trained=\{trained\}/);
    assert.notEqual(fr.identity.page.websiteAlreadyStudied, en.identity.page.websiteAlreadyStudied);
  });
});
