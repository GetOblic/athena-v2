import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, it } from "node:test";
import { getLicenseeLocalization } from "../../lib/licensee/getLicenseeLocalization";
import {
  buildLicenseePlanView,
  formatLicenseeLastVisit,
} from "../../lib/licensee/licenseeDashboardPresentation";
import { de } from "../../lib/tenantI18n/messages/de";
import { en } from "../../lib/tenantI18n/messages/en";
import { es } from "../../lib/tenantI18n/messages/es";
import { fr } from "../../lib/tenantI18n/messages/fr";
import { it as itMessages } from "../../lib/tenantI18n/messages/it";
import { pt } from "../../lib/tenantI18n/messages/pt";
import {
  ORGANIZATION_LANGUAGES,
  organizationLanguageLabel,
  type OrganizationLanguage,
} from "../../services/organizationLanguage";
import {
  buildEstimateConversationResponseLanguageInstruction,
  buildEstimateOutputLanguageInstruction,
} from "../../services/estimate/estimateOutputLanguage";
import { ESTIMATE_CONVERSATION_FORBIDDEN_KEYS } from "../../services/estimateConversation/estimateConversationValidation";

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

function collectLeaves(
  value: unknown,
  prefix = "",
): Array<{ path: string; text: string }> {
  if (typeof value === "string") {
    return prefix ? [{ path: prefix, text: value }] : [];
  }
  if (value === null || typeof value !== "object" || Array.isArray(value)) {
    return [];
  }
  return Object.keys(value as object).flatMap((key) =>
    collectLeaves(
      (value as Record<string, unknown>)[key],
      prefix ? `${prefix}.${key}` : key,
    ),
  );
}

const DICTIONARIES: Record<OrganizationLanguage, typeof en> = {
  en,
  fr,
  es,
  it: itMessages,
  de,
  pt,
};

describe("Licensee Master i18n — catalog", () => {
  it("all six catalogs have identical licensee key paths and no empty strings", () => {
    const canonical = collectKeyPaths(en.licensee);
    assert.ok(canonical.includes("common.logout"));
    assert.ok(canonical.includes("plan.defaultLanguage"));
    assert.ok(canonical.includes("dashboard.usefulLinksTitle"));
    assert.ok(canonical.includes("dashboard.usefulLinksDescription"));
    assert.ok(canonical.includes("usefulLinks.title"));
    assert.ok(canonical.includes("usefulLinks.intro"));
    assert.ok(canonical.includes("usefulLinks.aiAgents"));
    assert.ok(canonical.includes("usefulLinks.virtualPhone"));
    assert.ok(canonical.includes("usefulLinks.calendar"));
    assert.ok(canonical.includes("usefulLinks.unavailableTitle"));
    assert.ok(canonical.includes("usefulLinks.unavailableBody"));
    assert.ok(canonical.includes("usefulLinks.noOwnCompanyTitle"));
    assert.ok(canonical.includes("usefulLinks.noOwnCompanyBody"));
    assert.ok(canonical.includes("estimate.heroTitle"));
    assert.ok(canonical.includes("estimateAskAthena.title"));
    assert.ok(canonical.includes("quote.heroTitle"));
    assert.ok(canonical.includes("handoff.backToMaster"));
    assert.ok(canonical.includes("errors.generic"));
    for (const language of ORGANIZATION_LANGUAGES) {
      const paths = collectKeyPaths(DICTIONARIES[language].licensee);
      assert.deepEqual(
        paths.filter((path) => !canonical.includes(path)),
        [],
        `${language} extra licensee keys`,
      );
      assert.deepEqual(
        canonical.filter((path) => !paths.includes(path)),
        [],
        `${language} missing licensee keys`,
      );
      for (const leaf of collectLeaves(DICTIONARIES[language].licensee)) {
        assert.ok(leaf.text.trim().length > 0, `${language} ${leaf.path}`);
      }
      const links = DICTIONARIES[language].licensee.usefulLinks;
      assert.match(links.intro, /GetOblic/);
      assert.match(links.unavailableBody, /GetOblic/);
      assert.match(DICTIONARIES[language].licensee.dashboard.usefulLinksDescription, /GetOblic/);
      assert.doesNotMatch(
        `${links.intro} ${links.unavailableBody} ${DICTIONARIES[language].licensee.dashboard.usefulLinksDescription}`,
        /Getoblic|GETOBLIC/,
      );
      if (language !== "en") {
        assert.notEqual(links.title, en.licensee.usefulLinks.title);
        assert.notEqual(
          links.unavailableTitle,
          en.licensee.usefulLinks.unavailableTitle,
        );
      }
    }
  });

  it("reuses the canonical supported-language list", () => {
    const resolver = read("lib/licensee/getLicenseeLocalization.ts");
    assert.doesNotMatch(resolver, /\["en", "fr", "es", "it", "de", "pt"\]/);
    assert.match(resolver, /OrganizationLanguage/);
    assert.deepEqual([...ORGANIZATION_LANGUAGES], [
      "en",
      "fr",
      "es",
      "it",
      "de",
      "pt",
    ]);
  });
});

describe("Licensee Master i18n — resolver", () => {
  it("exposes Master language, locale, and licensee messages only", () => {
    const french = getLicenseeLocalization("fr");
    assert.equal(french.language, "fr");
    assert.equal(french.locale, "fr-FR");
    assert.equal(french.messages.brand.masterDashboard, fr.licensee.brand.masterDashboard);
    assert.equal(french.messages.plan.title, fr.licensee.plan.title);
    const resolver = read("lib/licensee/getLicenseeLocalization.ts");
    assert.match(resolver, /getTenantMessages/);
    assert.match(resolver, /toFormattingLocale/);
    assert.doesNotMatch(
      resolver,
      /from ["']@\/lib\/tenantI18n\/getTenantLocalization["']/,
    );
    assert.doesNotMatch(
      resolver,
      /from ["']@\/services\/organizationService["']/,
    );
    assert.doesNotMatch(resolver, /organizations\.language/);
  });
});

describe("Licensee Master i18n — dashboard", () => {
  it("French Master uses French dashboard and plan chrome; language value stays an autonym", () => {
    const { messages } = getLicenseeLocalization("fr");
    assert.equal(messages.brand.athenaBusinessLicensee.includes("Athena"), true);
    assert.match(messages.brand.masterDashboard, /Tableau de bord Master/);
    assert.equal(messages.common.logout, "Déconnexion");
    assert.equal(messages.plan.defaultLanguage, "Langue par défaut");
    assert.equal(messages.plan.languageSupport, "Par défaut pour les nouveaux sous-comptes");
    assert.match(messages.plan.perMonth, /mois/);
    assert.equal(messages.dashboard.searchPlaceholder.includes("Rechercher"), true);
    assert.equal(messages.dashboard.createSubAccount.includes("sous-compte"), true);
    assert.equal(messages.subAccountCard.openAthena.includes("Athena"), true);
    assert.equal(messages.dashboard.emptyTitle.length > 0, true);
    const view = buildLicenseePlanView(
      {
        defaultLanguage: "fr",
        licenseeMonthlyFeeUsd: 10.5,
        subAccountMonthlyFeeUsd: 0,
      },
      {
        languageSupport: messages.plan.languageSupport,
        perMonth: messages.plan.perMonth,
        perMonthPerActiveSubAccount: messages.plan.perMonthPerActiveSubAccount,
      },
    );
    assert.equal(view.defaultLanguageLabel, organizationLanguageLabel("fr"));
    assert.equal(view.defaultLanguageLabel, "Français");
    assert.equal(view.languageSupport, messages.plan.languageSupport);
    assert.match(view.licenseeFeeDisplay, /mois/);
  });

  it("formats last visit with Master locale", () => {
    const now = new Date();
    const today = formatLicenseeLastVisit(now.toISOString(), "fr-FR", {
      neverVisited: fr.licensee.common.neverVisited,
      today: fr.licensee.common.today,
      yesterday: fr.licensee.common.yesterday,
      separator: fr.licensee.common.lastVisitSeparator,
    });
    assert.match(today, /Aujourd/);
    assert.equal(
      formatLicenseeLastVisit(null, "fr-FR", {
        neverVisited: fr.licensee.common.neverVisited,
        today: fr.licensee.common.today,
        yesterday: fr.licensee.common.yesterday,
        separator: fr.licensee.common.lastVisitSeparator,
      }),
      "Jamais visité",
    );
  });

  it("preserves accepted dashboard visual grammar", () => {
    const client = read("components/licensee/LicenseeDashboardClient.tsx");
    const page = read("app/licensee/page.tsx");
    assert.match(page, /LICENSEE_DASHBOARD_SHELL_CLASS/);
    assert.match(page, /LicenseePlanSection/);
    assert.match(client, /LICENSEE_OWN_COMPANY_CARD_CLASS/);
    assert.match(client, /LICENSEE_PRIMARY_CTA_CLASS/);
    assert.match(client, /from "lucide-react"/);
  });
});

describe("Licensee Master i18n — Estimate UI", () => {
  it("Estimate page and client use Master catalog", () => {
    const page = read("app/licensee/estimate/page.tsx");
    const client = read("components/licensee/estimate/LicenseeEstimateClient.tsx");
    assert.match(page, /getLicenseeLocalization/);
    assert.match(page, /messages=\{messages\}/);
    assert.match(client, /messages\.estimate/);
    assert.match(client, /messages\.estimate\.statusQueued/);
    assert.match(client, /estimate\.describeNeed/);
    assert.match(client, /EstimateAskAthenaPanel/);
  });

  it("Ask Athena UI is catalog-driven", () => {
    const panel = read("components/licensee/estimate/EstimateAskAthenaPanel.tsx");
    assert.match(panel, /estimateAskAthena|getLicenseeLocalization/);
    assert.match(panel, /ask\.you/);
    assert.match(panel, /ask\.thinking/);
  });
});

describe("Licensee Master i18n — Estimate generation language", () => {
  it("prompt receives Master language and does not read selected organization language", () => {
    const instruction = buildEstimateOutputLanguageInstruction("fr");
    assert.match(instruction, /Français/);
    assert.match(instruction, /OUTPUT LANGUAGE/);
    const executor = read(
      "services/estimate/estimateGenerationJobs/estimateGenerationJobExecutor.ts",
    );
    const pipeline = read("services/estimate/estimateGenerationPipeline.ts");
    const prompt = read("services/ai/prompts/estimate/estimateUserPrompt.ts");
    assert.match(executor, /getLicenseeAccountById/);
    assert.match(executor, /buildEstimateOutputLanguageInstruction/);
    assert.match(executor, /outputLanguageInstruction/);
    assert.doesNotMatch(executor, /organizations\.language/);
    assert.doesNotMatch(executor, /getTenantMessages|tenantI18n/);
    assert.match(pipeline, /outputLanguageInstruction/);
    assert.match(prompt, /outputLanguageInstruction/);
    assert.doesNotMatch(prompt, /tenantI18n|getTenantMessages/);
    assert.doesNotMatch(pipeline, /tenantI18n|getTenantMessages/);
  });
});

describe("Licensee Master i18n — Ask Athena language", () => {
  it("response language uses Master default_language and rejects client override", () => {
    const instruction = buildEstimateConversationResponseLanguageInstruction("de");
    assert.match(instruction, /Deutsch/);
    const service = read(
      "services/estimateConversation/estimateConversationService.ts",
    );
    const validation = read(
      "services/estimateConversation/estimateConversationValidation.ts",
    );
    assert.match(service, /masterAccount\.default_language/);
    assert.match(service, /buildEstimateConversationResponseLanguageInstruction/);
    assert.doesNotMatch(service, /request\.language|body\.language/);
    assert.ok(ESTIMATE_CONVERSATION_FORBIDDEN_KEYS.includes("language"));
    assert.ok(ESTIMATE_CONVERSATION_FORBIDDEN_KEYS.includes("outputLanguage"));
    assert.match(validation, /"language"/);
  });
});

describe("Licensee Master i18n — Quote + GHL exclusion", () => {
  it("Athena wrapper is localized and GHL embed is unchanged", () => {
    const page = read("app/licensee/quote/page.tsx");
    const embed = read("components/quote/AthenaQuoteFormEmbed.tsx");
    assert.match(page, /getLicenseeLocalization/);
    assert.match(page, /quote\.heroTitle/);
    assert.match(page, /AthenaQuoteFormEmbed/);
    assert.doesNotMatch(page, /iframe|go\.getoblic\.com|form_embed/);
    assert.match(embed, /NQfn7tnDbGyyq9JVei6Q/);
    assert.match(embed, /go\.getoblic\.com\/widget\/form/);
    assert.match(embed, /data-form-name/);
    assert.doesNotMatch(embed, /getLicenseeLocalization|tenantI18n/);
  });
});

describe("Licensee Master i18n — sub-account create", () => {
  it("Master French chrome stays French when selector is Italian", () => {
    const page = read("app/licensee/sub-accounts/new/page.tsx");
    assert.match(page, /getLicenseeLocalization/);
    assert.match(page, /licenseeAccount\.default_language/);
    assert.match(page, /ORGANIZATION_LANGUAGE_LABELS/);
    assert.match(page, /name="accountLanguage"/);
    assert.match(page, /messages\.subAccountCreate/);
    assert.doesNotMatch(page, /getTenantLocalization/);
    const french = getLicenseeLocalization("fr").messages.subAccountCreate;
    assert.match(french.createSubAccountTitle, /sous-compte/i);
    assert.equal(organizationLanguageLabel("it"), "Italiano");
  });
});

describe("Licensee Master i18n — login", () => {
  it("unauthenticated login stays English and does no pre-auth language lookup", () => {
    const login = read("app/licensee/login/page.tsx");
    assert.doesNotMatch(login, /default_language/);
    assert.doesNotMatch(login, /getLicenseeLocalization|getTenantLocalization/);
    assert.match(login, /Master sign in/);
  });
});

describe("Licensee Master i18n — handoff", () => {
  it("origin returns Master language without identity and CTA uses it", () => {
    const origin = read("app/api/licensee/origin/route.ts");
    const cta = read("components/licensee/BackToMasterCta.tsx");
    assert.match(origin, /getLicenseeAccountById/);
    assert.match(origin, /body\.language/);
    assert.doesNotMatch(origin, /account\.email|user_id/);
    assert.match(origin, /canReturnToMaster: true/);
    assert.match(cta, /getLicenseeLocalization/);
    assert.match(cta, /payload\.language/);
    assert.doesNotMatch(cta, /getTenantLocalization/);
  });
});

describe("Licensee Master i18n — isolation", () => {
  it("workers and prompt modules stay free of tenantI18n catalogs", () => {
    for (const file of [
      "workers/athenaWorker.ts",
      "services/ai/prompts/estimate/estimateUserPrompt.ts",
      "services/ai/prompts/estimate/estimateSystemPrompt.ts",
      "services/ai/prompts/estimateConversation/estimateConversationSystemPrompt.ts",
      "services/estimateConversation/estimateConversationPrompt.ts",
      "services/estimate/estimateOutputLanguage.ts",
    ]) {
      assert.doesNotMatch(read(file), /tenantI18n|getTenantMessages/);
    }
  });

  it("does not localize Super Admin and does not contaminate persona-import", () => {
    assert.doesNotMatch(read("app/super/page.tsx"), /getLicenseeLocalization/);
    assert.doesNotMatch(
      read("app/personas/import/page.tsx"),
      /getLicenseeLocalization/,
    );
    assert.doesNotMatch(
      read("lib/personas/personaImportPresentation.ts"),
      /getLicenseeLocalization|licensee\./,
    );
  });
});

describe("Licensee Master i18n — Useful Links", () => {
  it("dashboard card and destination page use the Master catalog", () => {
    const page = read("app/licensee/page.tsx");
    const destination = read("app/licensee/useful-links/page.tsx");
    const card = read("components/licensee/LicenseeUsefulLinksCard.tsx");
    const panel = read("components/licensee/LicenseeUsefulLinksPanel.tsx");
    assert.match(page, /LicenseeUsefulLinksCard/);
    assert.match(card, /messages\.dashboard\.usefulLinksTitle/);
    assert.match(card, /messages\.dashboard\.usefulLinksDescription/);
    assert.match(card, /messages\.common\.open/);
    assert.match(destination, /getLicenseeLocalization/);
    assert.match(destination, /licenseeAccount\.default_language/);
    assert.match(destination, /messages\.brand\.businessLicensee/);
    assert.match(destination, /messages\.usefulLinks\.title/);
    assert.match(destination, /messages\.usefulLinks\.intro/);
    assert.match(destination, /messages\.common\.backToMasterDashboard/);
    assert.match(panel, /messages\.usefulLinks\.aiAgents/);
    assert.match(panel, /messages\.usefulLinks\.virtualPhone/);
    assert.match(panel, /messages\.usefulLinks\.calendar/);
    assert.match(panel, /messages\.usefulLinks\.unavailableTitle/);
    assert.match(panel, /messages\.usefulLinks\.noOwnCompanyTitle/);
    assert.match(panel, /messages\.common\.open/);
  });
});

describe("Licensee Master i18n — hard-coded copy audit", () => {
  it("catches new raw English Licensee UI literals outside documented exceptions", () => {
    const allowed = [
      /Athena/,
      /GetOblic/,
      /Brain/,
      /Ask Athena/,
      /Intelligence OS/,
      /Business Licensee/,
      /Master/,
      /SEO/,
      /Ads/,
      /USD/,
      /ASAP/,
      /SSL/,
      /DNS/,
      /CRM/,
      /API/,
      /Cloudflare/,
      /WordPress/,
    ];
    const forbidden = [
      "Search businesses, emails, notes...",
      "Know What to Charge.",
      "You Sell It. We Build It.",
      "Back to Master dashboard",
      "Create Sub-account",
      "Your Licensee Plan",
      "Master dashboard",
      "Useful Links",
      "Links unavailable",
      "AI Agents",
      "Virtual Phone",
      "Calendar",
    ];
    const surfaces = [
      "app/licensee/page.tsx",
      "app/licensee/estimate/page.tsx",
      "app/licensee/quote/page.tsx",
      "app/licensee/useful-links/page.tsx",
      "app/licensee/sub-accounts/new/page.tsx",
      "components/licensee/LicenseeDashboardClient.tsx",
      "components/licensee/LicenseePlanSection.tsx",
      "components/licensee/LicenseeUsefulLinksCard.tsx",
      "components/licensee/LicenseeUsefulLinksPanel.tsx",
      "components/licensee/estimate/LicenseeEstimateClient.tsx",
      "components/licensee/BackToMasterCta.tsx",
    ];
    for (const file of surfaces) {
      const source = read(file);
      for (const phrase of forbidden) {
        assert.doesNotMatch(
          source,
          new RegExp(`["'\`]${phrase.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}["'\`]`),
          `${file} still hard-codes "${phrase}"`,
        );
      }
      void allowed;
    }
  });
});
