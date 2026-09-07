/**
 * V2-UI-5C — Generate Traction presentation.
 * Source-contract checks only. Does not generate, persist, or alter backend tokens.
 */

import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, it } from "node:test";
import {
  isTenantNavActive,
  localizeTenantNav,
} from "../../components/dashboard/tenantNavigation";
import {
  AUDIENCE_ANALYSIS_SECTION_DEFS,
  audienceAnalysisKeys,
  groupAudienceAnalysisAssets,
} from "../../lib/personas/audienceAnalysisSections";
import {
  deriveAudienceLibrarySummary,
  formatAudienceLibrarySummary,
} from "../../lib/personas/audienceLibrarySummary";
import { REQUIRED_PERSONA_ANALYSIS_ASSET_KEYS } from "../../lib/personaDeploymentAssetContract";
import { interpolateTenantMessage } from "../../lib/tenantI18n/interpolate";
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

const TRACTION_ROUTES = [
  ["app/personas/page.tsx", '/personas"'],
  ["app/personas/import/page.tsx", "/personas/import"],
  ["app/personas/[id]/page.tsx", "`/personas/${id}`"],
  ["app/ads/page.tsx", '/ads"'],
  ["app/ads/new/page.tsx", "/ads/new"],
  ["app/ads/[id]/page.tsx", "`/ads/${id}`"],
  ["app/social-planner/page.tsx", "/social-planner"],
  ["app/social-planner/[id]/page.tsx", "`/social-planner/${id}`"],
] as const;

describe("V2-UI-5C Generate Traction presentation", () => {
  it("wraps all eight routes in TenantAppShell and removes standalone chrome", () => {
    for (const [file, pathFragment] of TRACTION_ROUTES) {
      const source = read(file);
      assert.match(source, /TenantAppShell/);
      assert.match(source, new RegExp(pathFragment.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")));
      assert.doesNotMatch(source, /AthenaBrandLink/);
      assert.doesNotMatch(source, /TenantBackLink/);
    }
  });

  it("activates Generate Traction on all eight routes and keeps Ads/Social alsoActiveFor", () => {
    const items = localizeTenantNav(en);
    const traction = items.find((item) => item.key === "generateTraction");
    const ads = items.find((item) => item.key === "ads");
    const social = items.find((item) => item.key === "socialPlanner");
    assert.ok(traction && ads && social);
    assert.deepEqual(traction.alsoActiveFor, ["/ads", "/social-planner"]);
    for (const path of [
      "/personas",
      "/personas/import",
      "/personas/abc",
      "/ads",
      "/ads/new",
      "/ads/abc",
      "/social-planner",
      "/social-planner/abc",
    ]) {
      assert.equal(isTenantNavActive(path, traction), true, path);
    }
    assert.equal(isTenantNavActive("/ads", ads), true);
    assert.equal(isTenantNavActive("/social-planner", social), true);
    assert.equal(isTenantNavActive("/personas", ads), false);
    const adsPage = read("app/ads/page.tsx");
    const socialPage = read("app/social-planner/page.tsx");
    assert.match(adsPage, /currentPath="\/ads"/);
    assert.match(socialPage, /currentPath="\/social-planner"/);
    assert.doesNotMatch(adsPage, /currentPath="\/personas"/);
    assert.doesNotMatch(socialPage, /currentPath="\/personas"/);
  });

  it("uses Audience terminology in tenant chrome without rewriting generated bodies", () => {
    assert.equal(en.personas.list.createCta, "Create audience");
    assert.equal(en.personas.list.createFirstCta, "Define your first audience");
    assert.equal(en.personas.metadata.personaName, "Audience name");
    assert.equal(en.personas.conversation.title, "Ask Athena about this audience");
    assert.equal(en.personas.executive.deploymentAssetsTitle, "Outreach drafts");
    const library = read("components/personas/PersonasLibraryClient.tsx");
    const generate = read("components/personas/PersonaGenerateForm.tsx");
    assert.doesNotMatch(library, /display_opportunity_score_label/);
    assert.doesNotMatch(library, /sortScore|Opportunity Score/);
    assert.match(generate, /candidate\.persona_name|candidate\[key\]/);
    assert.doesNotMatch(generate, /replace\(.*Persona/);
  });

  it("does not introduce Traction Score, audience pickers, or a unified Campaign stepper", () => {
    const surfaces = [
      "app/personas/page.tsx",
      "app/personas/import/page.tsx",
      "app/personas/[id]/page.tsx",
      "app/ads/page.tsx",
      "app/ads/new/page.tsx",
      "app/ads/[id]/page.tsx",
      "app/social-planner/page.tsx",
      "app/social-planner/[id]/page.tsx",
      "components/personas/PersonasLibraryClient.tsx",
      "components/ads/AdCampaignGenerateForm.tsx",
      "components/socialPlanner/SocialPlannerCreateForm.tsx",
    ];
    for (const file of surfaces) {
      const source = read(file);
      assert.doesNotMatch(source, /Traction Score/);
      assert.doesNotMatch(
        source,
        /selectedPersona|AudiencePicker|PersonaPicker|selected audience/,
      );
      assert.doesNotMatch(source, /Create a campaign for this selected audience/);
      assert.doesNotMatch(source, /unifiedCampaign|campaignStepper/);
    }
  });

  it("keeps Ads package sections and free-text audience, and Social 7-day contract", () => {
    const detail = read("components/ads/AdCampaignDetailView.tsx");
    assert.match(detail, /copy\.detail\.campaignStrategy/);
    assert.match(detail, /copy\.detail\.facebook/);
    assert.match(detail, /copy\.detail\.instagram/);
    assert.match(detail, /copy\.detail\.tiktok/);
    assert.match(detail, /copy\.detail\.googleSearchAds/);
    assert.match(detail, /copy\.detail\.recommendedKeywordThemes/);
    const form = read("components/ads/AdCampaignGenerateForm.tsx");
    assert.match(form, /audience: audience\.trim\(\) \|\| undefined/);
    assert.doesNotMatch(form, /<select[^>]+audience|personaIds/);
    const calendar = read("components/socialPlanner/SocialCalendarDetail.tsx");
    assert.match(calendar, /assets\.slice\(0, 7\)/);
    assert.doesNotMatch(calendar, /personaIds/);
    const day = read("components/socialPlanner/SocialCalendarDayCard.tsx");
    assert.doesNotMatch(day, /personaIds/);
    assert.match(day, /whoThisIsFor/);
  });

  it("does not claim publish, schedule, export, or deploy on Traction surfaces", () => {
    const surfaces = [
      "components/personas/PersonasLibraryClient.tsx",
      "components/ads/AdsLibraryClient.tsx",
      "components/ads/AdCampaignDetailView.tsx",
      "components/socialPlanner/SocialPlannerWorkspace.tsx",
      "components/socialPlanner/SocialCalendarDetail.tsx",
    ];
    for (const file of surfaces) {
      const source = read(file);
      assert.doesNotMatch(source, /\bPublish\b|\bSchedule\b|\bExport\b|\bDeploy\b/);
    }
  });

  it("widens only the expanded manual create surface and two-columns collapsed groups", () => {
    const forms = read("components/personas/PersonaImportForms.tsx");
    const block = read("components/personas/PersonaCreationBlock.tsx");
    const generate = read("components/personas/PersonaGenerateForm.tsx");
    const csv = read("components/personas/PersonaCsvImport.tsx");

    const generateWrapper = forms.slice(
      forms.indexOf("<div className=\"mx-auto w-full min-w-0 max-w-3xl\">"),
      forms.indexOf("<PersonaCreationBlock"),
    );
    assert.match(generateWrapper, /<PersonaGenerateForm/);
    assert.doesNotMatch(generateWrapper, /max-w-6xl/);

    const csvWrapper = forms.slice(forms.lastIndexOf("<div className=\"mx-auto w-full min-w-0 max-w-3xl\">"));
    assert.match(csvWrapper, /<PersonaCsvImport/);
    assert.doesNotMatch(csvWrapper, /max-w-6xl/);

    assert.match(forms, /panelId="persona-creation-manual"/);
    assert.match(forms, /className="mx-auto w-full min-w-0 max-w-3xl"/);
    assert.match(forms, /expandedClassName="lg:max-w-6xl"/);
    assert.match(block, /expandedClassName/);
    assert.match(block, /open \? expandedClassName/);

    assert.match(forms, /grid grid-cols-1 gap-4 pt-2 lg:grid-cols-2/);
    assert.match(forms, /open \? "lg:col-span-2"/);
    assert.match(forms, /defaultOpen=\{false\}/);
    assert.match(forms, /PERSONA_ADVANCED_FIELD_GROUPS\.map/);
    assert.match(forms, /value=\{manual\.persona_name/);
    assert.match(forms, /value=\{manual\.short_description/);
    assert.match(forms, /body: JSON\.stringify\(manual\)/);

    assert.doesNotMatch(generate, /lg:max-w-6xl/);
    assert.doesNotMatch(generate, /lg:grid-cols-2/);
    assert.doesNotMatch(csv, /lg:max-w-6xl/);
    assert.doesNotMatch(csv, /lg:grid-cols-2/);
  });

  it("preserves import AI, manual, and CSV contracts and the 14 analysis keys", () => {
    const forms = read("components/personas/PersonaImportForms.tsx");
    const generateIndex = forms.indexOf("<PersonaGenerateForm");
    const manualIndex = forms.indexOf("persona-creation-manual");
    const csvIndex = forms.indexOf("<PersonaCsvImport");
    assert.ok(generateIndex > 0 && generateIndex < manualIndex);
    assert.ok(manualIndex > 0 && manualIndex < csvIndex);
    assert.match(forms, /\/api\/personas/);
    const generate = read("components/personas/PersonaGenerateForm.tsx");
    assert.match(generate, /\/api\/personas\/generate/);
    assert.match(generate, /source: "generated"/);
    assert.deepEqual(audienceAnalysisKeys(), [
      ...REQUIRED_PERSONA_ANALYSIS_ASSET_KEYS,
    ]);
    assert.equal(AUDIENCE_ANALYSIS_SECTION_DEFS.length, 14);
    const grouped = groupAudienceAnalysisAssets([
      { assetKey: "persona_executive_profile", title: "Persona Executive Profile" },
      { assetKey: "objection_handling", title: "Objection Handling" },
    ]);
    assert.deepEqual(
      grouped.map((item) => item.def.key),
      ["PERSONA_EXECUTIVE_PROFILE", "OBJECTION_HANDLING"],
    );
  });

  it("derives audience summary only from loaded rows", () => {
    const summary = deriveAudienceLibrarySummary([
      { display_status: "Ready" },
      { display_status: "Ready" },
      { display_status: "Processing" },
    ]);
    assert.deepEqual(summary, { total: 3, ready: 2, generating: 1 });
    const label = formatAudienceLibrarySummary(
      summary,
      {
        audiencesOne: "1 audience",
        audiencesMany: "{count} audiences",
        readyOne: "1 with intelligence ready",
        readyMany: "{count} with intelligence ready",
        generatingOne: "1 still generating",
        generatingMany: "{count} still generating",
      },
      interpolateTenantMessage,
    );
    assert.equal(
      label,
      "3 audiences · 2 with intelligence ready · 1 still generating",
    );
  });

  it("aligns new Traction chrome keys across six dictionaries", () => {
    const required = [
      "personas.question",
      "personas.traction.audiences",
      "personas.list.createFirstCta",
      "personas.import.createThisAudience",
      "personas.detail.refreshIntelligence",
      "ads.traction.audienceHelp",
      "socialPlanner.whoThisIsFor",
      "socialPlanner.traction.helper",
    ];
    const canonical = collectKeyPaths(en);
    for (const path of required) {
      assert.ok(canonical.includes(path), path);
    }
    for (const language of ORGANIZATION_LANGUAGES) {
      const paths = collectKeyPaths(DICTIONARIES[language]);
      assert.deepEqual(
        required.filter((item) => !paths.includes(item)),
        [],
        `${language} missing Traction keys`,
      );
    }
    assert.notEqual(fr.personas.list.createCta, en.personas.list.createCta);
    assert.notEqual(es.ads.title, en.ads.title);
    assert.notEqual(de.socialPlanner.title, en.socialPlanner.title);
  });
});
