import assert from "node:assert/strict";
import { existsSync, readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, it } from "node:test";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { CopyButton } from "../../components/deployment/CopyButton";
import { formatTenantDate } from "../../lib/tenantI18n/format";
import {
  getAdsCopyChrome,
  getLocalizedAdCampaignStatusLabel,
  getLocalizedAdGenerationStageLabel,
} from "../../lib/tenantI18n/adsPresentation";
import { interpolateTenantMessage } from "../../lib/tenantI18n/interpolate";
import { de } from "../../lib/tenantI18n/messages/de";
import { en } from "../../lib/tenantI18n/messages/en";
import { es } from "../../lib/tenantI18n/messages/es";
import { fr } from "../../lib/tenantI18n/messages/fr";
import { it as itMessages } from "../../lib/tenantI18n/messages/it";
import { pt } from "../../lib/tenantI18n/messages/pt";
import {
  getLocalizedSeoEffortLabel,
  getLocalizedSeoGenerationStageLabel,
  getLocalizedSeoGenerationTypeLabel,
  getLocalizedSeoReportStatusLabel,
  getLocalizedSeoTechnicalPriorityLabel,
  getSeoCopyChrome,
  localizeSeoExecutiveOverview,
  localizeSeoPriorityVisual,
} from "../../lib/tenantI18n/seoPresentation";
import type { TenantMessages } from "../../lib/tenantI18n/types";
import {
  ORGANIZATION_LANGUAGES,
  type OrganizationLanguage,
} from "../../services/organizationLanguage";
import {
  priorityVisual,
  seoScoreBandFromValue,
  type SeoExecutiveOverviewModel,
} from "../../services/seo/seoReportPresentation";
import { seoGenerationTypeLabel } from "../../services/seo/seoGenerationType";

const ROOT = process.cwd();

function read(relativePath: string): string {
  return readFileSync(join(ROOT, relativePath), "utf8");
}

function listTsFiles(dir: string): string[] {
  const absolute = join(ROOT, dir);
  let entries;
  try {
    entries = readdirSync(absolute, { withFileTypes: true });
  } catch {
    return [];
  }
  const files: string[] = [];
  for (const entry of entries) {
    const relative = join(dir, entry.name);
    if (entry.isDirectory()) {
      files.push(...listTsFiles(relative));
    } else if (/\.(ts|tsx)$/.test(entry.name)) {
      files.push(relative);
    }
  }
  return files;
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

const DICTIONARIES: Record<OrganizationLanguage, TenantMessages> = {
  en,
  fr,
  es,
  it: itMessages,
  de,
  pt,
};

const STORED_CAMPAIGN_NAME = "Lyon summer launch campaign";
const STORED_HEADLINE = "Book Today";
const STORED_GUIDANCE = "User-entered campaign guidance must remain verbatim.";
const STORED_REPORT_TITLE = "Lyon boutique SEO audit";
const STORED_URL = "https://maison-dupont.example/boutique";
const STORED_KEYWORD = "user-entered keyword must remain verbatim";
const STORED_FINDING = "Generated SEO finding must remain verbatim.";
const STORED_SEO_RECOMMENDATION = "Generated SEO recommendation must remain verbatim.";
const STORED_REPORT_BODY = "Generated SEO report body must remain verbatim.";
const ARBITRARY_ERROR = "WORKER_ADS_TIMEOUT: upstream model 503";

describe("V31 L3.8 tenant ads + seo — list chrome", () => {
  it("keeps English Ads and SEO list chrome canonical", () => {
    assert.equal(en.ads.title, "Advertising");
    assert.equal(en.ads.eyebrow, "Generate Traction");
    assert.equal(en.ads.emptyTitle, "No campaigns yet.");
    assert.equal(en.ads.generateAds, "Create campaign");
    assert.equal(en.ads.actionOpen, "Open");
    assert.equal(en.seo.title, "SEO");
    assert.equal(en.seo.eyebrow, "SEO Workspace");
    assert.equal(en.seo.emptyTitle, "No SEO reports yet");
    assert.equal(en.seo.generateIntelligence, "Generate SEO Intelligence");
    assert.equal(en.seo.generateTechnical, "Generate Technical SEO");
    const adsPage = read("app/ads/page.tsx");
    const seoPage = read("app/seo/page.tsx");
    assert.match(adsPage, /getTenantLocalization/);
    assert.match(seoPage, /getTenantLocalization/);
    assert.match(adsPage, /TenantAppShell/);
    assert.match(seoPage, /TenantAppShell/);
    assert.doesNotMatch(seoPage, /TenantBackLink/);
    assert.match(adsPage, /copy\.title/);
    assert.match(seoPage, /copy\.visibility\.title/);
    assert.doesNotMatch(seoPage, /copy\.generateIntelligence/);
    assert.doesNotMatch(seoPage, /copy\.generateTechnical/);
    assert.match(seoPage, /copy\.visibility\.analyzeCta|copy\.visibility\.newAnalysisCta/);
    assert.equal((adsPage.match(/getTenantLocalization\(\)/g) ?? []).length, 1);
    assert.equal((seoPage.match(/getTenantLocalization\(\)/g) ?? []).length, 1);
  });

  it("localizes Ads and SEO list chrome in all five non-English languages", () => {
    for (const [language, dictionary] of Object.entries(DICTIONARIES) as Array<
      [OrganizationLanguage, TenantMessages]
    >) {
      if (language === "en") continue;
      assert.notEqual(dictionary.ads.subtitle, en.ads.subtitle);
      assert.notEqual(dictionary.ads.emptyTitle, en.ads.emptyTitle);
      assert.notEqual(dictionary.seo.subtitle, en.seo.subtitle);
      assert.notEqual(dictionary.seo.emptyTitle, en.seo.emptyTitle);
    }
    assert.match(fr.ads.title, /Publicit/i);
    assert.match(es.ads.emptyTitle, /campaña/i);
    assert.match(itMessages.seo.actionOpen, /Apri/i);
    assert.match(de.ads.title, /Werbung/i);
    assert.equal(de.ads.eyebrow, "Generate Traction");
    assert.match(pt.seo.emptyTitle, /relat/i);
  });

  it("keeps stored campaign names, report titles, URLs, and generated summaries verbatim", () => {
    const adsLibrary = read("components/ads/AdsLibraryClient.tsx");
    const seoLibrary = read("components/seo/SeoLibraryClient.tsx");
    assert.match(adsLibrary, /\{campaign\.name\}/);
    assert.match(adsLibrary, /campaign\.objective/);
    assert.match(adsLibrary, /campaign\.campaignTheme/);
    assert.match(seoLibrary, /\{report\.name\}/);
    assert.match(seoLibrary, /report\.summary/);
    assert.doesNotMatch(adsLibrary, /translateCampaign|localizeName/);
    assert.doesNotMatch(seoLibrary, /translateReport|localizeSummary/);
    assert.doesNotMatch(fr.ads.title, new RegExp(STORED_CAMPAIGN_NAME));
    assert.doesNotMatch(fr.seo.title, new RegExp(STORED_REPORT_TITLE));
    assert.doesNotMatch(fr.seo.subtitle, new RegExp(STORED_URL));
  });
});

describe("V31 L3.8 tenant ads + seo — create / generate chrome", () => {
  it("localizes generate chrome and keeps request bodies language-free", () => {
    const adsForm = read("components/ads/AdCampaignGenerateForm.tsx");
    const seoForm = read("components/seo/SeoReportGenerateForm.tsx");
    const adsNew = read("app/ads/new/page.tsx");
    const seoNew = read("app/seo/new/page.tsx");
    assert.equal(en.ads.new.generate, "Create campaign");
    assert.equal(en.seo.new.generateIntelligence, "Generate SEO Intelligence");
    assert.match(adsNew, /getTenantLocalization/);
    assert.match(seoNew, /getTenantLocalization/);
    assert.match(adsForm, /copy\.generate/);
    assert.match(seoForm, /copy\.chooseWhat/);
    assert.match(seoForm, /copy\.startAnalysis/);
    assert.equal((seoForm.match(/type="submit"/g) ?? []).length, 1);
    assert.doesNotMatch(seoForm, /\{copy\.generateIntelligence\}/);
    assert.doesNotMatch(seoForm, /\{copy\.generateTechnical\}/);
    assert.match(adsForm, /name: name\.trim\(\) \|\| undefined/);
    assert.match(adsForm, /guidance: guidance\.trim\(\) \|\| undefined/);
    assert.match(seoForm, /generationType,/);
    assert.doesNotMatch(adsForm, /language:/);
    assert.doesNotMatch(seoForm, /language:/);
    assert.doesNotMatch(adsForm, /organizationLanguage|navigator\.language/);
    assert.doesNotMatch(seoForm, /organizationLanguage|navigator\.language/);
  });
});

describe("V31 L3.8 tenant ads + seo — detail chrome and content boundary", () => {
  it("localizes application chrome around verbatim generated Ads content", () => {
    const detail = read("components/ads/AdCampaignDetailView.tsx");
    assert.match(detail, /\{campaign\.name\}/);
    assert.match(detail, /pkg\.facebook\.headline/);
    assert.match(detail, /pkg\.facebook\.primaryText/);
    assert.match(detail, /pkg\.strategy\.rationale/);
    assert.match(detail, /copy\.detail\.headline/);
    assert.match(detail, /copy\.detail\.campaignStrategy/);
    assert.doesNotMatch(detail, /translateHeadline|localizePackage/);
    assert.equal(en.ads.detail.headline, "Headline");
    assert.notEqual(fr.ads.detail.headline, en.ads.detail.headline);
  });

  it("localizes application chrome around verbatim generated SEO content", () => {
    const detail = read("components/seo/SeoReportDetailView.tsx");
    const technical = read("components/seo/SeoTechnicalReportDetailView.tsx");
    assert.match(detail, /\{report\.name\}/);
    assert.match(detail, /pkg\.executiveAssessment\.overallAssessment/);
    assert.match(detail, /gap\.recommendation/);
    assert.match(detail, /opportunity\.title/);
    assert.match(detail, /copy\.detail\.executiveAssessment/);
    assert.match(technical, /\{report\.name\}/);
    assert.match(technical, /label: page\.url/);
    assert.match(technical, /item\.title/);
    assert.match(technical, /item\.recommendedAction/);
    assert.match(technical, /pkg\.disclaimer/);
    assert.doesNotMatch(detail, /translateFinding|localizeReportBody/);
    assert.doesNotMatch(technical, /translateFinding|localizeReportBody/);
  });

  it("keeps user-entered guidance out of generation requests as a language field", () => {
    const adsForm = read("components/ads/AdCampaignGenerateForm.tsx");
    const seoForm = read("components/seo/SeoReportGenerateForm.tsx");
    assert.match(adsForm, /guidance: guidance\.trim\(\) \|\| undefined/);
    assert.match(seoForm, /guidance: guidance\.trim\(\) \|\| undefined/);
    assert.doesNotMatch(adsForm, /language:\s*messages|language:\s*language/);
    assert.doesNotMatch(seoForm, /language:\s*messages|language:\s*language/);
    assert.doesNotMatch(fr.ads.new.guidancePlaceholder, new RegExp(STORED_GUIDANCE));
    assert.doesNotMatch(fr.seo.new.guidancePlaceholder, new RegExp(STORED_KEYWORD));
  });
});

describe("V31 L3.8 tenant ads + seo — status presentation", () => {
  it("keeps English status labels canonical and localizes presentation only", () => {
    assert.equal(en.ads.status.queued, "Starting");
    assert.equal(en.ads.status.ready, "Ready");
    assert.equal(en.ads.status.processingFailed, "Failed");
    assert.equal(getLocalizedAdCampaignStatusLabel(en, "Queued"), "Starting");
    assert.equal(getLocalizedAdCampaignStatusLabel(fr, "Queued"), fr.ads.status.queued);
    assert.equal(getLocalizedAdCampaignStatusLabel(es, "Ready"), es.ads.status.ready);
    assert.equal(
      getLocalizedAdCampaignStatusLabel(itMessages, "Processing Failed"),
      itMessages.ads.status.processingFailed,
    );
    assert.equal(
      getLocalizedSeoReportStatusLabel(de, "Processing"),
      de.seo.status.processing,
    );
    assert.equal(getLocalizedSeoReportStatusLabel(pt, "Ready"), pt.seo.status.ready);
    assert.equal(getLocalizedAdCampaignStatusLabel(fr, "Custom Token"), "Custom Token");
    assert.equal(getLocalizedSeoReportStatusLabel(fr, "Custom Token"), "Custom Token");
  });

  it("does not let localized labels become query or API tokens", () => {
    const adsLibrary = read("components/ads/AdsLibraryClient.tsx");
    const seoLibrary = read("components/seo/SeoLibraryClient.tsx");
    const adsStatus = read("components/ads/AdCampaignStatusPanel.tsx");
    const seoStatus = read("components/seo/SeoReportStatusPanel.tsx");
    assert.match(adsLibrary, /campaign\.status/);
    assert.match(seoLibrary, /report\.status/);
    assert.match(adsStatus, /status === "Queued" \|\| status === "Processing"/);
    assert.match(seoStatus, /status === "Queued" \|\| status === "Processing"/);
    assert.match(adsStatus, /setStatus\("Processing"\)/);
    assert.match(seoStatus, /setStatus\("Processing"\)/);
    assert.doesNotMatch(adsStatus, /setStatus\(copy|setStatus\(fr/);
    const types = read("services/ads/adCampaignTypes.ts");
    assert.match(types, /"Queued"/);
    assert.match(types, /"Processing Failed"/);
    assert.doesNotMatch(types, /En file|En cola|In coda/);
    const seoTypes = read("services/seo/seoReportTypes.ts");
    assert.match(seoTypes, /"Queued"/);
    assert.doesNotMatch(seoTypes, /En file|En cola/);
  });

  it("maps structured generation stages without parsing English worker labels", () => {
    assert.equal(
      getLocalizedAdGenerationStageLabel(en, "assembling_context"),
      "Assembling organization context",
    );
    assert.equal(
      getLocalizedAdGenerationStageLabel(fr, "assembling_context"),
      fr.ads.stages.assemblingContext,
    );
    assert.equal(
      getLocalizedSeoGenerationStageLabel(en, "executive_assessment"),
      "Generating executive SEO assessment",
    );
    assert.equal(
      getLocalizedSeoGenerationStageLabel(de, "failed"),
      de.seo.stages.failed,
    );
    assert.equal(
      getLocalizedAdGenerationStageLabel(fr, "unknown_stage"),
      "unknown_stage",
    );
    const adsStatus = read("components/ads/AdCampaignStatusPanel.tsx");
    const seoStatus = read("components/seo/SeoReportStatusPanel.tsx");
    assert.match(adsStatus, /getLocalizedAdGenerationStageLabel/);
    assert.match(seoStatus, /getLocalizedSeoGenerationStageLabel/);
    assert.doesNotMatch(adsStatus, /stageLabel\.includes\(|parseStage/);
    assert.doesNotMatch(seoStatus, /stageLabel\.includes\(|parseStage/);
  });
});

describe("V31 L3.8 tenant ads + seo — dates, copy, delete, errors", () => {
  it("formats visible library dates with the tenant locale map", () => {
    const adsLibrary = read("components/ads/AdsLibraryClient.tsx");
    const seoLibrary = read("components/seo/SeoLibraryClient.tsx");
    assert.match(adsLibrary, /formatTenantDate/);
    assert.match(seoLibrary, /formatTenantDate/);
    assert.doesNotMatch(adsLibrary, /toLocaleDateString\("en-US"/);
    assert.doesNotMatch(seoLibrary, /toLocaleDateString\("en-US"/);
    assert.match(formatTenantDate("2026-08-20T15:04:00.000Z", "en"), /2026/);
    assert.notEqual(
      formatTenantDate("2026-08-20T15:04:00.000Z", "fr"),
      formatTenantDate("2026-08-20T15:04:00.000Z", "en"),
    );
  });

  it("localizes copy chrome while keeping generated clipboard text exact", () => {
    const generated = STORED_HEADLINE;
    const english = renderToStaticMarkup(
      createElement(CopyButton, {
        text: generated,
        tracking: null,
        showContinue: false,
      }),
    );
    assert.match(english, />Copy</);
    const french = renderToStaticMarkup(
      createElement(CopyButton, {
        text: generated,
        tracking: null,
        showContinue: false,
        chrome: getAdsCopyChrome(fr),
      }),
    );
    assert.match(french, />Copier</);
    assert.doesNotMatch(french, />Copy</);
    const spanish = renderToStaticMarkup(
      createElement(CopyButton, {
        text: STORED_REPORT_BODY,
        tracking: null,
        showContinue: false,
        chrome: getSeoCopyChrome(es),
      }),
    );
    assert.match(spanish, />Copiar</);
    const asset = read("components/ads/AdAssetSection.tsx");
    const section = read("components/seo/SeoReportSection.tsx");
    assert.match(asset, /text=\{field\.value\}/);
    assert.match(section, /text=\{field\.value\}/);
  });

  it("localizes delete confirmation chrome and preserves English defaults", () => {
    const adsDelete = read("components/ads/AdCampaignHeaderDeleteButton.tsx");
    const seoDelete = read("components/seo/SeoReportHeaderDeleteButton.tsx");
    assert.match(
      adsDelete,
      /Delete this Ad campaign permanently\? This cannot be undone\./,
    );
    assert.match(
      seoDelete,
      /Delete this SEO Intelligence report permanently\? This cannot be undone\./,
    );
    assert.match(adsDelete, /confirmMessage=/);
    assert.match(seoDelete, /confirmMessage=/);
    assert.match(adsDelete, /chrome=\{chrome\}/);
    assert.match(seoDelete, /chrome=\{chrome\}/);
    assert.equal(
      en.ads.delete.confirm,
      "Delete this Ad campaign permanently? This cannot be undone.",
    );
    assert.notEqual(fr.ads.delete.confirm, en.ads.delete.confirm);
    assert.notEqual(fr.seo.delete.confirm, en.seo.delete.confirm);
  });

  it("preserves arbitrary server errors and localizes only fallbacks", () => {
    const adsForm = read("components/ads/AdCampaignGenerateForm.tsx");
    const seoForm = read("components/seo/SeoReportGenerateForm.tsx");
    const adsPage = read("app/ads/page.tsx");
    const seoPage = read("app/seo/page.tsx");
    assert.match(adsForm, /payload\.error\?\.message \|\| copy\.generateFailed/);
    assert.match(seoForm, /payload\.error\?\.message \|\|/);
    assert.match(adsPage, /error instanceof Error \? error\.message : copy\.loadFailed/);
    assert.match(seoPage, /error instanceof Error \? error\.message : copy\.loadFailed/);
    assert.doesNotMatch(adsForm, /translateError|localizeErrorMessage/);
    assert.doesNotMatch(seoForm, /translateError|localizeErrorMessage/);
    assert.doesNotMatch(fr.ads.new.generateFailed, new RegExp(ARBITRARY_ERROR));
  });
});

describe("V31 L3.8 tenant ads + seo — SEO presentation mapping", () => {
  it("localizes generation-type and score/priority presentation without changing tokens", () => {
    assert.equal(seoGenerationTypeLabel("intelligence"), "SEO Intelligence");
    assert.equal(seoGenerationTypeLabel("technical"), "Technical SEO");
    assert.equal(
      getLocalizedSeoGenerationTypeLabel(fr, "intelligence"),
      fr.seo.generationType.intelligence,
    );
    assert.equal(
      getLocalizedSeoGenerationTypeLabel(es, "technical"),
      es.seo.generationType.technical,
    );
    const typeSource = read("services/seo/seoGenerationType.ts");
    assert.match(typeSource, /"intelligence"/);
    assert.match(typeSource, /"technical"/);
    assert.doesNotMatch(typeSource, /tenantI18n/);

    const visual = priorityVisual("P0", "low");
    assert.equal(visual.label, "Fast Win");
    assert.equal(localizeSeoPriorityVisual(fr, visual).label, fr.seo.priority.fastWin);
    assert.equal(visual.key, "fast_win");
    assert.equal(
      getLocalizedSeoTechnicalPriorityLabel(de, "Critical"),
      de.seo.technicalPriority.critical,
    );
    assert.equal(getLocalizedSeoTechnicalPriorityLabel(de, "Obscure"), "Obscure");
    assert.equal(getLocalizedSeoEffortLabel(itMessages, "low"), itMessages.seo.effort.low);
  });

  it("localizes only the deterministic coverage-gap fallback on executive overview", () => {
    const generated: SeoExecutiveOverviewModel = {
      overallScore: { value: 80, stars: 4, label: "Strong" },
      commercialReadiness: { value: 70, stars: 4, label: "Solid" },
      contentCoverage: { value: 40, stars: 2, label: "Emerging" },
      trustAuthority: { value: 20, stars: 1, label: "Early" },
      biggestOpportunity: STORED_SEO_RECOMMENDATION,
      biggestRisk: STORED_FINDING,
      fastestWin: STORED_REPORT_BODY,
      recommendedNextAction: STORED_SEO_RECOMMENDATION,
      summary: STORED_REPORT_BODY,
    };
    const localized = localizeSeoExecutiveOverview(fr, generated);
    assert.equal(localized.biggestOpportunity, STORED_SEO_RECOMMENDATION);
    assert.equal(localized.biggestRisk, STORED_FINDING);
    assert.equal(localized.fastestWin, STORED_REPORT_BODY);
    assert.equal(localized.summary, STORED_REPORT_BODY);
    assert.equal(localized.overallScore.label, fr.seo.scores.strong);
    assert.equal(localized.overallScore.value, 80);
    assert.equal(localized.overallScore.stars, 4);
    const fallback: SeoExecutiveOverviewModel = {
      ...generated,
      biggestRisk: en.seo.detail.coverageGapsFallback,
    };
    assert.equal(
      localizeSeoExecutiveOverview(fr, fallback).biggestRisk,
      fr.seo.detail.coverageGapsFallback,
    );
  });

  it("localizes score labels from numeric band authority, not English display text", () => {
    const mismatchedEnglish: SeoExecutiveOverviewModel = {
      overallScore: { value: 80, stars: 4, label: "Early" },
      commercialReadiness: { value: 50, stars: 3, label: "Strong" },
      contentCoverage: { value: 34, stars: 2, label: "Solid" },
      trustAuthority: { value: 65, stars: 3, label: "Developing" },
      biggestOpportunity: STORED_SEO_RECOMMENDATION,
      biggestRisk: STORED_FINDING,
      fastestWin: STORED_REPORT_BODY,
      recommendedNextAction: STORED_SEO_RECOMMENDATION,
      summary: STORED_REPORT_BODY,
    };
    const localized = localizeSeoExecutiveOverview(fr, mismatchedEnglish);
    assert.equal(seoScoreBandFromValue(80), "strong");
    assert.equal(localized.overallScore.label, fr.seo.scores.strong);
    assert.equal(localized.overallScore.value, 80);
    assert.equal(localized.commercialReadiness.label, fr.seo.scores.developing);
    assert.equal(localized.contentCoverage.label, fr.seo.scores.early);
    assert.equal(localized.trustAuthority.label, fr.seo.scores.solid);
    assert.notEqual(localized.overallScore.label, fr.seo.scores.early);
    const source = read("lib/tenantI18n/seoPresentation.ts");
    assert.doesNotMatch(source, /SCORE_LABEL_KEYS/);
    assert.doesNotMatch(source, /Strong:\s*"strong"/);
    assert.match(source, /seoScoreBandFromValue\(score\.value\)/);
  });

  it("localizes roadmap priority from visual.key, not the English label", () => {
    const visual = priorityVisual("P0");
    assert.equal(visual.key, "P0");
    assert.equal(visual.label, "High Priority");
    const relabeled = { ...visual, label: "Totally Different English" };
    assert.equal(
      localizeSeoPriorityVisual(fr, relabeled).label,
      fr.seo.priority.highPriority,
    );
    assert.equal(localizeSeoPriorityVisual(fr, relabeled).key, "P0");
    assert.equal(
      localizeSeoPriorityVisual(fr, relabeled).className,
      visual.className,
    );
    const unknown = {
      key: "custom_generated" as typeof visual.key,
      label: "Generated priority wording must remain verbatim.",
      symbol: "•",
      className: visual.className,
    };
    assert.equal(
      localizeSeoPriorityVisual(es, unknown).label,
      "Generated priority wording must remain verbatim.",
    );
  });

  it("localizes effort from canonical low|medium|high tokens, not English phrases", () => {
    assert.equal(getLocalizedSeoEffortLabel(fr, "low"), fr.seo.effort.low);
    assert.equal(getLocalizedSeoEffortLabel(fr, "medium"), fr.seo.effort.medium);
    assert.equal(getLocalizedSeoEffortLabel(fr, "high"), fr.seo.effort.high);
    assert.equal(getLocalizedSeoEffortLabel(fr, "Low effort"), "Low effort");
    assert.equal(getLocalizedSeoEffortLabel(fr, "Medium"), "Medium");
    assert.equal(
      getLocalizedSeoEffortLabel(de, "Generated effort wording must remain verbatim."),
      "Generated effort wording must remain verbatim.",
    );
  });

  it("keeps technical priority CSS on canonical Critical|High tokens", () => {
    const technicalView = read("components/seo/SeoTechnicalReportDetailView.tsx");
    assert.match(technicalView, /priority === "Critical"/);
    assert.match(technicalView, /priority === "High"/);
    assert.match(technicalView, /priorityClass\(item\.priority\)/);
    assert.match(technicalView, /getLocalizedSeoTechnicalPriorityLabel/);
    assert.equal(
      getLocalizedSeoTechnicalPriorityLabel(pt, "Improvement"),
      pt.seo.technicalPriority.improvement,
    );
    assert.equal(
      getLocalizedSeoTechnicalPriorityLabel(pt, "Generated priority wording"),
      "Generated priority wording",
    );
  });

  it("keeps seoGenerationTypeLabel English while canonical tokens stay authoritative", () => {
    assert.equal(seoGenerationTypeLabel("intelligence"), "SEO Intelligence");
    assert.equal(seoGenerationTypeLabel("technical"), "Technical SEO");
    const badge = read("components/seo/SeoGenerationTypeBadge.tsx");
    assert.match(badge, /label \?\? seoGenerationTypeLabel\(generationType\)/);
    assert.match(badge, /generationType === "technical"/);
    const presentation = read("lib/tenantI18n/seoPresentation.ts");
    assert.match(presentation, /generationType === "technical"/);
    assert.doesNotMatch(
      read("services/seo/seoReportPresentation.ts"),
      /tenantI18n/,
    );
    assert.doesNotMatch(read("services/seo/seoGenerationType.ts"), /tenantI18n/);
  });
});

describe("V31 L3.8 tenant ads + seo — boundaries", () => {
  it("does not change Social Planner, Opportunities, Briefings, Personas, Prospects, or Discussions chrome imports", () => {
    for (const file of [
      "app/social-planner/page.tsx",
      "app/opportunities/page.tsx",
      "app/briefings/page.tsx",
      "app/personas/page.tsx",
      "app/prospects/page.tsx",
      "app/discussions/page.tsx",
    ]) {
      if (!existsSync(join(ROOT, file))) continue;
      assert.doesNotMatch(read(file), /messages\.ads|messages\.seo/);
    }
  });

  it("does not add generation-language, Client resolvers, providers, or browser locale authority", () => {
    const hits: string[] = [];
    for (const dir of [
      "workers",
      "services/ai/prompts",
      "services/identity/prompts",
      "services/assetBlueprints/prompts",
      "services/brain",
      "services/generationJobs",
      "services/ads",
      "services/seo",
    ]) {
      for (const file of listTsFiles(dir)) {
        if (/tenantI18n|lib\/tenantI18n/.test(read(file))) {
          hits.push(file);
        }
      }
    }
    assert.deepEqual(hits, []);
    assert.equal(
      existsSync(
        join(ROOT, "components/tenantI18n/TenantLocalizationProvider.tsx"),
      ),
      false,
    );
    for (const file of [
      "components/ads/AdsLibraryClient.tsx",
      "components/ads/AdCampaignGenerateForm.tsx",
      "components/seo/SeoLibraryClient.tsx",
      "components/seo/SeoReportGenerateForm.tsx",
    ]) {
      const source = read(file);
      assert.doesNotMatch(source, /getTenantLocalization/);
      assert.doesNotMatch(source, /resolveOrganizationLanguage/);
      assert.doesNotMatch(source, /navigator\.language/);
      assert.doesNotMatch(source, /document\.cookie/);
    }
  });

  it("leaves Licensee, Super Admin, and login unchanged", () => {
    for (const file of [
      "app/login/page.tsx",
      "app/licensee/page.tsx",
      "app/super/page.tsx",
    ]) {
      assert.doesNotMatch(read(file), /messages\.ads|messages\.seo/);
      assert.doesNotMatch(read(file), /getTenantLocalization/);
    }
  });

  it("keeps all six dictionaries structurally complete after L3.8 expansion", () => {
    const canonical = collectKeyPaths(en);
    assert.ok(canonical.includes("ads.generateAds"));
    assert.ok(canonical.includes("ads.status.processingFailed"));
    assert.ok(canonical.includes("ads.detail.headline"));
    assert.ok(canonical.includes("seo.generateIntelligence"));
    assert.ok(canonical.includes("seo.status.ready"));
    assert.ok(canonical.includes("seo.detail.executiveAssessment"));
    assert.ok(canonical.includes("seo.technical.actionPlan"));
    for (const language of ORGANIZATION_LANGUAGES) {
      const paths = collectKeyPaths(DICTIONARIES[language]);
      assert.deepEqual(
        canonical.filter((path) => !paths.includes(path)),
        [],
        `${language} missing keys`,
      );
      assert.deepEqual(
        paths.filter((path) => !canonical.includes(path)),
        [],
        `${language} extra keys`,
      );
    }
  });

  it("preserves locked product terms", () => {
    for (const dictionary of Object.values(DICTIONARIES)) {
      assert.match(dictionary.ads.subtitle, /Athena/);
      assert.match(dictionary.seo.subtitle, /Athena/);
      assert.match(dictionary.seo.subtitle, /Deep Scrape/);
      assert.match(dictionary.seo.detail.pagesEmpty, /Deep Scrape/);
      assert.match(dictionary.seo.detail.pagesEmpty, /Athena Brain/);
      assert.equal(dictionary.ads.detail.facebook, "Facebook");
      assert.equal(dictionary.ads.detail.instagram, "Instagram");
      assert.equal(dictionary.ads.detail.tiktok, "TikTok");
      assert.equal(dictionary.ads.detail.googleSearchAds, "Google Search Ads");
    }
  });

  it("does not regress L3.5 / L3.6 / L3.7 delivery or shared-component isolation", () => {
    assert.match(read("app/discussions/[id]/page.tsx"), /messages\.discussions\.executive/);
    assert.match(read("app/personas/page.tsx"), /messages\.personas/);
    assert.match(read("app/prospects/page.tsx"), /messages\.prospects/);
    assert.match(read("app/opportunities/page.tsx"), /messages\.opportunities/);
    assert.match(read("app/briefings/page.tsx"), /messages\.briefings/);
    for (const file of [
      "components/deployment/CopyButton.tsx",
      "components/deployment/ContinueButton.tsx",
      "components/ui/ConfirmDeleteControl.tsx",
      "components/ui/AthenaCollapsibleSection.tsx",
      "components/websiteLearning/WebsiteAnalyzedPagesList.tsx",
    ]) {
      assert.doesNotMatch(read(file), /tenantI18n|getTenantLocalization/);
    }
  });
});

describe("V31 L3.8 tenant ads + seo — interpolation", () => {
  it("keeps interpolated stored values verbatim inside localized templates", () => {
    const named = interpolateTenantMessage(fr.seo.detail.sourceMeta, {
      source: STORED_REPORT_TITLE,
    });
    assert.match(named, new RegExp(STORED_REPORT_TITLE));
    const effort = interpolateTenantMessage(de.seo.detail.effortMeta, {
      effort: getLocalizedSeoEffortLabel(de, "low"),
    });
    assert.match(effort, new RegExp(de.seo.effort.low));
  });
});
