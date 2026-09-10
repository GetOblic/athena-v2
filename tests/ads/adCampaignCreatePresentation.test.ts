/**
 * /ads/new presentation contracts.
 * Does not generate campaigns or change brief / API / inferred-guided semantics.
 */

import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, it } from "node:test";
import {
  AD_DETAIL_DEFAULT_OPEN,
  AD_DETAIL_SECTION_KEYS,
  AD_HEADER_ICON_WELL,
  AD_HEADER_PRIMARY_CLASS,
  AD_BACK_LINK_CLASS,
} from "../../lib/ads/adCampaignDetailPresentation";
import {
  AD_CREATE_ADVANCED_ICON,
  AD_CREATE_ADVANCED_SURFACE,
  AD_CREATE_BACK_LINK_CLASS,
  AD_CREATE_BRIEF_ICON,
  AD_CREATE_BRIEF_SURFACE,
  AD_CREATE_CONTEXT_ICON,
  AD_CREATE_CONTEXT_SURFACE,
  AD_CREATE_FIELD_CLASS,
  AD_CREATE_HEADER_ICON_WELL,
  AD_CREATE_PRIMARY_CLASS,
  AD_CREATE_TEXTAREA_CLASS,
} from "../../lib/ads/adCampaignCreatePresentation";
import { de } from "../../lib/tenantI18n/messages/de";
import { en } from "../../lib/tenantI18n/messages/en";
import { es } from "../../lib/tenantI18n/messages/es";
import { fr } from "../../lib/tenantI18n/messages/fr";
import { it as itMessages } from "../../lib/tenantI18n/messages/it";
import { pt } from "../../lib/tenantI18n/messages/pt";
import type { TenantMessages } from "../../lib/tenantI18n/types";
import { ORGANIZATION_LANGUAGES } from "../../services/organizationLanguage";

const ROOT = process.cwd();

function read(relativePath: string): string {
  return readFileSync(join(ROOT, relativePath), "utf8");
}

function collectKeyPaths(value: unknown, prefix = ""): string[] {
  if (value === null || typeof value !== "object" || Array.isArray(value)) {
    return prefix ? [prefix] : [];
  }
  const paths = prefix ? [prefix] : [];
  for (const key of Object.keys(value as object).sort()) {
    const next = prefix ? `${prefix}.${key}` : key;
    paths.push(
      ...collectKeyPaths((value as Record<string, unknown>)[key], next),
    );
  }
  return paths;
}

const DICTIONARIES: Record<string, TenantMessages> = {
  en,
  fr,
  es,
  it: itMessages,
  de,
  pt,
};

const CREATE_CHROME_KEYS = [
  "ads.new.contextTitle",
  "ads.new.contextSourcesLead",
  "ads.new.contextSourceBrain",
  "ads.new.contextSourceAudiences",
  "ads.new.contextSourceProspects",
  "ads.new.contextSourceWebsite",
  "ads.new.contextSourcesNote",
  "ads.new.briefTitle",
  "ads.new.briefHelper",
] as const;

describe("/ads/new campaign create presentation", () => {
  it("uses ArrowLeft back treatment and Megaphone Ads header identity", () => {
    const page = read("app/ads/new/page.tsx");
    assert.match(page, /<ArrowLeft /);
    assert.match(page, /AD_CREATE_BACK_LINK_CLASS/);
    assert.match(page, /copy\.detail\.backLabel/);
    assert.match(page, /<Megaphone /);
    assert.match(page, /AD_CREATE_HEADER_ICON_WELL/);
    assert.match(page, /TractionPageHeader/);
    assert.match(page, /copy\.new\.eyebrow/);
    assert.match(page, /copy\.new\.title/);
    assert.match(page, /copy\.new\.subtitle/);
    assert.doesNotMatch(page, /TractionSiblingNav/);
    assert.equal(AD_CREATE_BACK_LINK_CLASS, AD_BACK_LINK_CLASS);
    assert.equal(AD_CREATE_HEADER_ICON_WELL, AD_HEADER_ICON_WELL);
  });

  it("renders Brain context and Target campaign-brief cards", () => {
    const form = read("components/ads/AdCampaignGenerateForm.tsx");
    assert.match(form, /<Brain /);
    assert.match(form, /AD_CREATE_CONTEXT_SURFACE/);
    assert.match(form, /AD_CREATE_CONTEXT_ICON/);
    assert.match(form, /copy\.contextTitle/);
    assert.match(form, /copy\.briefOptional/);
    assert.match(form, /copy\.contextSourceBrain/);
    assert.match(form, /copy\.contextSourceAudiences/);
    assert.match(form, /copy\.contextSourceProspects/);
    assert.match(form, /copy\.contextSourceWebsite/);
    assert.match(form, /<Target /);
    assert.match(form, /AD_CREATE_BRIEF_SURFACE/);
    assert.match(form, /AD_CREATE_BRIEF_ICON/);
    assert.match(form, /copy\.briefTitle/);
    assert.match(form, /copy\.briefHelper/);
    assert.match(form, /copy\.objectiveLabel/);
    assert.match(form, /copy\.offerLabel/);
    assert.match(form, /copy\.audienceLabel/);
    assert.match(form, /copy\.guidanceLabel/);
    assert.match(AD_CREATE_CONTEXT_SURFACE, /167,139,250/);
    assert.match(AD_CREATE_BRIEF_SURFACE, /167,139,250/);
    assert.match(AD_CREATE_CONTEXT_ICON, /violet/);
    assert.match(AD_CREATE_BRIEF_ICON, /violet/);
  });

  it("keeps Advanced collapsed with intelligence tone and SlidersHorizontal", () => {
    const form = read("components/ads/AdCampaignGenerateForm.tsx");
    assert.match(form, /tone="intelligence"/);
    assert.match(form, /<SlidersHorizontal /);
    assert.match(form, /defaultOpen=\{false\}/);
    assert.match(form, /AD_CREATE_ADVANCED_SURFACE/);
    assert.match(form, /AD_CREATE_ADVANCED_ICON/);
    assert.match(form, /copy\.moreDetail/);
    assert.match(form, /copy\.nameLabel/);
    assert.match(form, /copy\.geographyLabel/);
    assert.match(form, /copy\.landingPageLabel/);
    assert.match(form, /copy\.constraintsLabel/);
    assert.doesNotMatch(form, /showToggleLabel/);
    assert.match(AD_CREATE_ADVANCED_SURFACE, /167,139,250/);
    assert.match(AD_CREATE_ADVANCED_ICON, /167,139,250/);
  });

  it("applies Ads-new field grammar and the accepted primary CTA", () => {
    const form = read("components/ads/AdCampaignGenerateForm.tsx");
    assert.match(form, /AD_CREATE_FIELD_CLASS/);
    assert.match(form, /AD_CREATE_TEXTAREA_CLASS/);
    assert.match(form, /AD_CREATE_PRIMARY_CLASS/);
    assert.match(form, /AD_CREATE_ERROR_CLASS/);
    assert.match(form, /<AlertTriangle /);
    assert.equal(AD_CREATE_PRIMARY_CLASS, AD_HEADER_PRIMARY_CLASS);
    assert.match(AD_CREATE_FIELD_CLASS, /border-white\/\[0\.10\]/);
    assert.match(AD_CREATE_FIELD_CLASS, /bg-black\/20/);
    assert.match(AD_CREATE_FIELD_CLASS, /focus:border-\[rgba\(167,139,250/);
    assert.match(AD_CREATE_TEXTAREA_CLASS, /AD_CREATE_FIELD_CLASS|border-white\/\[0\.10\]/);
  });

  it("preserves all eight optional fields, payload names, and submit guards", () => {
    const form = read("components/ads/AdCampaignGenerateForm.tsx");
    assert.match(form, /submittingRef/);
    assert.match(form, /if \(submittingRef\.current\) return/);
    assert.match(form, /fetch\("\/api\/ads"/);
    assert.match(form, /name: name\.trim\(\) \|\| undefined/);
    assert.match(form, /guidance: guidance\.trim\(\) \|\| undefined/);
    assert.match(form, /objective: objective\.trim\(\) \|\| undefined/);
    assert.match(form, /offer: offer\.trim\(\) \|\| undefined/);
    assert.match(form, /audience: audience\.trim\(\) \|\| undefined/);
    assert.match(form, /geography: geography\.trim\(\) \|\| undefined/);
    assert.match(form, /landingPage: landingPage\.trim\(\) \|\| undefined/);
    assert.match(form, /constraints: constraints\.trim\(\) \|\| undefined/);
    assert.match(form, /setName, 120, "input"/);
    assert.match(form, /setGeography, 200, "textarea"/);
    assert.match(form, /setLandingPage, 500, "textarea"/);
    assert.match(form, /setConstraints, 1000, "textarea"/);
    assert.match(form, /maxLength=\{500\}/);
    assert.match(form, /maxLength=\{4000\}/);
    assert.match(form, /maxLength=\{max\}/);
    assert.match(form, /router\.push\(`\/ads\/\$\{payload\.campaign\.id\}`\)/);
    assert.match(form, /router\.refresh\(\)/);
    assert.match(form, /payload\.error\?\.message \|\| copy\.generateFailed/);
    assert.doesNotMatch(form, /required[:=]|required=\{|required"/);
    assert.doesNotMatch(form, /\brequired\b/);
    assert.doesNotMatch(form, /language:/);
    assert.doesNotMatch(form, /<select/);
    assert.doesNotMatch(form, /PersonaPicker|AudiencePicker|ProspectPicker/);
    assert.doesNotMatch(form, /campaignType|platformPicker|Facebook\/Instagram/);
    assert.doesNotMatch(form, /Traction Score|Readiness score|Quality score|Confidence score/);
    assert.doesNotMatch(form, /inferred\/guided|briefMode/);
  });

  it("does not add fake product features or generation progress on /ads/new", () => {
    const page = read("app/ads/new/page.tsx");
    const form = read("components/ads/AdCampaignGenerateForm.tsx");
    for (const source of [page, form]) {
      assert.doesNotMatch(source, /TractionSiblingNav/);
      assert.doesNotMatch(source, /Traction Score/);
      assert.doesNotMatch(source, /budget|startDate|endDate/i);
      assert.doesNotMatch(source, /PersonaPicker|AudiencePicker/);
      assert.doesNotMatch(source, /generation progress|AdCampaignStatusPanel/);
    }
  });

  it("adds create chrome keys in all six locales without rewriting generated copy", () => {
    const canonical = collectKeyPaths(en);
    for (const path of CREATE_CHROME_KEYS) {
      assert.ok(canonical.includes(path), path);
    }
    for (const language of ORGANIZATION_LANGUAGES) {
      const paths = collectKeyPaths(DICTIONARIES[language]);
      assert.deepEqual(
        CREATE_CHROME_KEYS.filter((item) => !paths.includes(item)),
        [],
        `${language} missing Ads-new chrome keys`,
      );
    }
    assert.equal(en.ads.new.contextTitle, "Athena already has context");
    assert.equal(en.ads.new.briefTitle, "Campaign brief");
    assert.equal(en.ads.new.moreDetail, "Advanced");
    assert.equal(en.ads.new.generate, "Create campaign");
    assert.equal(en.ads.new.objectiveLabel, "What are you trying to achieve?");
    assert.notEqual(fr.ads.new.contextTitle, en.ads.new.contextTitle);
    assert.notEqual(fr.ads.new.briefHelper, en.ads.new.briefHelper);
    assert.notEqual(de.ads.new.generate, en.ads.new.generate);
    assert.doesNotMatch(fr.ads.new.briefHelper, /Book Today|Spring Launch/);
  });

  it("does not change Ads-detail collapse defaults or shared component defaults", () => {
    const create = read("lib/ads/adCampaignCreatePresentation.ts");
    const detail = read("lib/ads/adCampaignDetailPresentation.ts");
    const collapsible = read("components/ui/AthenaCollapsibleSection.tsx");
    const header = read("components/traction/TractionPageHeader.tsx");
    const sibling = read("components/traction/TractionSiblingNav.tsx");
    const copyButton = read("components/deployment/CopyButton.tsx");
    const shell = read("components/dashboard/TenantAppShell.tsx");
    for (const key of AD_DETAIL_SECTION_KEYS) {
      assert.equal(AD_DETAIL_DEFAULT_OPEN[key], false);
    }
    assert.match(detail, /export const AD_DETAIL_DEFAULT_OPEN/);
    assert.doesNotMatch(create, /export const AD_DETAIL_DEFAULT_OPEN|AD_DETAIL_DEFAULT_OPEN\s*=/);
    assert.match(collapsible, /tone = "default"/);
    assert.match(collapsible, /defaultOpen = false/);
    assert.doesNotMatch(header, /Megaphone|AD_CREATE|AD_HEADER_ICON_WELL/);
    assert.doesNotMatch(sibling, /ads\/new|AD_CREATE/);
    assert.match(copyButton, /variant\?: "default" \| "utility"/);
    assert.doesNotMatch(shell, /AD_CREATE|adCampaignCreatePresentation/);
  });
});
