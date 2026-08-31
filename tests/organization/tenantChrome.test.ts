import assert from "node:assert/strict";
import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, it } from "node:test";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { LogoutCta } from "../../components/auth/LogoutCta";
import { AthenaHeaderActions } from "../../components/auth/AthenaHeaderActions";
import {
  dashboardNavDefs,
  dashboardNavItems,
  localizeDashboardNavItems,
} from "../../components/dashboard/DashboardSidebar";
import { TenantBackLink } from "../../components/navigation/TenantBackLink";
import {
  AthenaConversationPanel,
  type AthenaConversationChrome,
} from "../../components/conversation/AthenaConversationPanel";
import type { ConfirmDeleteChrome } from "../../components/ui/ConfirmDeleteControl";
import { ORGANIZATION_LANGUAGES } from "../../services/organizationLanguage";
import { getTenantMessages } from "../../lib/tenantI18n/getTenantMessages";
import { de } from "../../lib/tenantI18n/messages/de";
import { en } from "../../lib/tenantI18n/messages/en";
import { es } from "../../lib/tenantI18n/messages/es";
import { fr } from "../../lib/tenantI18n/messages/fr";
import { it as itMessages } from "../../lib/tenantI18n/messages/it";
import { pt } from "../../lib/tenantI18n/messages/pt";
import type { TenantMessages } from "../../lib/tenantI18n/types";

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

const DICTIONARIES: Record<string, TenantMessages> = {
  en,
  fr,
  es,
  it: itMessages,
  de,
  pt,
};

const ENGLISH_NAV_LABELS = [
  "Dashboard",
  "Getting Started",
  "Athena Brain",
  "Intelligence Domains",
  "Inbox",
  "Discussions",
  "Prospects",
  "Personas",
  "Ads",
  "SEO Intelligence",
  "Social Planner",
  "Opportunities",
  "Briefings",
] as const;

const ENGLISH_NAV_HREFS = [
  "/",
  "/getting-started",
  "/identity",
  "/intelligence-domains",
  "/inbox",
  "/discussions",
  "/prospects",
  "/personas",
  "/ads",
  "/seo",
  "/social-planner",
  "/opportunities",
  "/briefings",
] as const;

function conversationChromeFrom(messages: TenantMessages): AthenaConversationChrome {
  return {
    you: messages.conversation.you,
    athena: messages.conversation.athena,
    copy: messages.common.copy,
    copied: messages.common.copied,
    thinking: messages.conversation.thinking,
    retry: messages.common.retry,
    asking: messages.conversation.asking,
    enterToSend: messages.conversation.enterToSend,
    supportReference: messages.conversation.supportReference,
    transportFailed: messages.conversation.transportFailed,
  };
}

function deleteChromeFrom(messages: TenantMessages): ConfirmDeleteChrome {
  return {
    delete: messages.common.delete,
    cancel: messages.common.cancel,
    confirmDelete: messages.common.confirmDelete,
    deleting: messages.common.deleting,
    confirmDeletion: messages.common.confirmDeletion,
  };
}

describe("V31 L3.2 tenant chrome — navigation labels", () => {
  it("keeps English nav labels visually unchanged", () => {
    assert.deepEqual(
      dashboardNavItems.map((item) => item.label),
      [...ENGLISH_NAV_LABELS],
    );
    assert.deepEqual(
      localizeDashboardNavItems(en).map((item) => item.label),
      [...ENGLISH_NAV_LABELS],
    );
    assert.deepEqual(
      localizeDashboardNavItems(getTenantMessages("en")).map(
        (item) => item.label,
      ),
      [...ENGLISH_NAV_LABELS],
    );
  });

  it("returns French tenant nav labels", () => {
    const labels = localizeDashboardNavItems(fr).map((item) => item.label);
    assert.deepEqual(labels, [
      "Tableau de bord",
      "Premiers pas",
      "Athena Brain",
      "Intelligence Domains",
      "Boîte de réception",
      "Discussions",
      "Prospects",
      "Personas",
      "Publicités",
      "Intelligence SEO",
      "Social Planner",
      "Opportunités",
      "Briefings",
    ]);
  });

  it("returns Spanish tenant nav labels", () => {
    const labels = localizeDashboardNavItems(es).map((item) => item.label);
    assert.deepEqual(labels, [
      "Panel",
      "Primeros pasos",
      "Athena Brain",
      "Intelligence Domains",
      "Bandeja de entrada",
      "Discusiones",
      "Prospectos",
      "Personas",
      "Anuncios",
      "Inteligencia SEO",
      "Social Planner",
      "Oportunidades",
      "Briefings",
    ]);
  });

  it("returns Italian tenant nav labels", () => {
    const labels = localizeDashboardNavItems(itMessages).map(
      (item) => item.label,
    );
    assert.deepEqual(labels, [
      "Pannello",
      "Per iniziare",
      "Athena Brain",
      "Intelligence Domains",
      "Posta in arrivo",
      "Discussioni",
      "Prospect",
      "Personas",
      "Annunci",
      "Intelligenza SEO",
      "Social Planner",
      "Opportunità",
      "Briefing",
    ]);
  });

  it("returns German tenant nav labels", () => {
    const labels = localizeDashboardNavItems(de).map((item) => item.label);
    assert.deepEqual(labels, [
      "Übersicht",
      "Einstieg",
      "Athena Brain",
      "Intelligence Domains",
      "Posteingang",
      "Diskussionen",
      "Interessenten",
      "Personas",
      "Anzeigen",
      "SEO Intelligence",
      "Social Planner",
      "Chancen",
      "Briefings",
    ]);
  });

  it("returns Portuguese tenant nav labels", () => {
    const labels = localizeDashboardNavItems(pt).map((item) => item.label);
    assert.deepEqual(labels, [
      "Painel",
      "Primeiros passos",
      "Athena Brain",
      "Intelligence Domains",
      "Caixa de entrada",
      "Discussões",
      "Prospects",
      "Personas",
      "Anúncios",
      "Intelligence SEO",
      "Social Planner",
      "Oportunidades",
      "Briefings",
    ]);
  });

  it("preserves nav hrefs and order across all six languages", () => {
    const englishHrefs = localizeDashboardNavItems(en).map((item) => item.href);
    assert.deepEqual(englishHrefs, [...ENGLISH_NAV_HREFS]);
    assert.deepEqual(
      dashboardNavItems.map((item) => item.href),
      [...ENGLISH_NAV_HREFS],
    );
    assert.deepEqual(
      dashboardNavDefs.map((item) => item.href),
      [...ENGLISH_NAV_HREFS],
    );
    for (const language of ORGANIZATION_LANGUAGES) {
      const localized = localizeDashboardNavItems(getTenantMessages(language));
      assert.deepEqual(
        localized.map((item) => item.href),
        englishHrefs,
        `${language} hrefs drifted`,
      );
      assert.deepEqual(
        localized.map((item) => item.key),
        dashboardNavDefs.map((item) => item.key),
        `${language} keys drifted`,
      );
    }
  });

  it("does not duplicate nav route definitions per language", () => {
    const sidebar = read("components/dashboard/DashboardSidebar.tsx");
    assert.match(sidebar, /localizeDashboardNavItems\(messages\)/);
    assert.doesNotMatch(sidebar, /getTenantLocalization|resolveOrganizationLanguage/);
    assert.doesNotMatch(sidebar, /dashboardNavItemsFr|navItemsByLanguage/);
    assert.equal(
      (sidebar.match(/href: "\/getting-started"/g) ?? []).length,
      1,
    );
  });
});

describe("V31 L3.2 tenant chrome — AthenaBrandLink isolation", () => {
  it("does not import tenantI18n or resolve organization language", () => {
    const brand = read("components/branding/AthenaBrandLink.tsx");
    assert.doesNotMatch(brand, /tenantI18n/);
    assert.doesNotMatch(brand, /getTenantLocalization|getTenantMessages/);
    assert.doesNotMatch(brand, /resolveOrganizationLanguage/);
    assert.doesNotMatch(brand, /navigator\.language/);
    assert.match(brand, /tagline = "Intelligence OS"/);
  });

  it("lets tenant callers pass a localized tagline", () => {
    const sidebar = read("components/dashboard/DashboardSidebar.tsx");
    const dashboard = read("app/page.tsx");
    assert.match(sidebar, /tagline=\{messages\.chrome\.tagline\}/);
    assert.match(dashboard, /tagline=\{messages\.chrome\.tagline\}/);
    assert.match(dashboard, /getTenantLocalization/);
    assert.equal(fr.chrome.tagline, "Intelligence OS");
    assert.equal(fr.chrome.logOut, "Se déconnecter");
  });

  it("keeps login, Licensee, and Super Admin on default English chrome", () => {
    const login = read("app/login/page.tsx");
    const licensee = read("app/licensee/page.tsx");
    const licenseeLogin = read("app/licensee/login/page.tsx");
    const superPage = read("app/super/page.tsx");
    const superLogin = read("app/super/login/page.tsx");
    for (const source of [login, licensee, licenseeLogin, superPage, superLogin]) {
      assert.match(source, /<AthenaBrandLink/);
      assert.doesNotMatch(source, /TenantAthenaBrandLink/);
      assert.doesNotMatch(source, /tagline=/);
      assert.doesNotMatch(source, /logoutLabel=/);
      assert.doesNotMatch(source, /tenantI18n/);
    }
  });
});

describe("V31 L3.2 tenant chrome — logout / session", () => {
  it("localizes logout chrome without changing auth behavior", () => {
    const logout = read("components/auth/LogoutCta.tsx");
    const actions = read("components/auth/AthenaHeaderActions.tsx");
    assert.match(logout, /action="\/api\/auth\/logout"/);
    assert.match(logout, /method="post"/);
    assert.match(logout, /label = "Log out"/);
    assert.doesNotMatch(logout, /tenantI18n|getTenantLocalization/);
    assert.match(actions, /sessionActionsLabel = "Session actions"/);
    assert.match(actions, /BackToMasterCta/);
    assert.doesNotMatch(actions, /tenantI18n|getTenantLocalization/);

    const english = renderToStaticMarkup(createElement(LogoutCta));
    assert.match(english, /Log out/);
    const french = renderToStaticMarkup(
      createElement(LogoutCta, { label: fr.chrome.logOut }),
    );
    assert.match(french, /Se déconnecter/);
    assert.doesNotMatch(french, /Log out/);

    const session = renderToStaticMarkup(
      createElement(AthenaHeaderActions, {
        logoutLabel: fr.chrome.logOut,
        sessionActionsLabel: fr.chrome.sessionActions,
      }),
    );
    assert.match(session, /aria-label="Actions de session"/);
    assert.match(session, /Se déconnecter/);
  });
});

describe("V31 L3.2 tenant chrome — conversation panel", () => {
  const baseProps = {
    title: "Ask Athena how it works",
    description: "Feature wrapper description stays English.",
    placeholder: "Ask a question about Athena…",
    examplePrompts: ["What should I complete first?"] as const,
    storageKey: "athena:l32-chrome-test",
    conversationEndpoint: "/api/getting-started/conversation",
    defaultOpen: true,
  };

  it("accepts localized generic chrome and keeps English defaults", () => {
    const english = renderToStaticMarkup(
      createElement(AthenaConversationPanel, baseProps),
    );
    assert.match(english, /Enter to send · Shift\+Enter for a new line/);
    assert.match(english, /Clear conversation/);
    assert.match(english, /Ask Athena/);
    assert.match(english, /Ask Athena how it works/);
    assert.match(english, /What should I complete first\?/);

    const french = renderToStaticMarkup(
      createElement(AthenaConversationPanel, {
        ...baseProps,
        chrome: conversationChromeFrom(fr),
      }),
    );
    assert.match(
      french,
      /Entrée pour envoyer · Maj\+Entrée pour une nouvelle ligne/,
    );
    assert.doesNotMatch(
      french,
      /Enter to send · Shift\+Enter for a new line/,
    );
    assert.match(french, /Ask Athena how it works/);
    assert.match(french, /Feature wrapper description stays English/);
    assert.match(french, /What should I complete first\?/);
  });

  it("does not transform conversation message bodies or history", () => {
    const panel = read("components/conversation/AthenaConversationPanel.tsx");
    assert.match(panel, /\{message\.content\}/);
    assert.match(panel, /role: "user", content: trimmed/);
    assert.match(panel, /content: outcome\.result\.message\.content/);
    assert.doesNotMatch(panel, /getTenantLocalization|getTenantMessages/);
    assert.doesNotMatch(panel, /resolveOrganizationLanguage/);
    assert.doesNotMatch(panel, /navigator\.language/);
    assert.match(panel, /writeAthenaConversationSession\(storage, storageKey/);
  });
});

describe("V31 L3.2 tenant chrome — confirm delete", () => {
  it("can localize generic actions while preserving caller confirmation text", () => {
    const control = read("components/ui/ConfirmDeleteControl.tsx");
    assert.match(control, /delete: "Delete"/);
    assert.match(control, /cancel: "Cancel"/);
    assert.match(control, /confirmDelete: "Confirm Delete"/);
    assert.match(control, /deleting: "Deleting\.\.\."/);
    assert.match(control, /\{confirmMessage\}/);
    assert.doesNotMatch(control, /getTenantLocalization|tenantI18n/);
    assert.doesNotMatch(control, /navigator\.language/);

    const frenchChrome = deleteChromeFrom(fr);
    assert.equal(frenchChrome.delete, "Supprimer");
    assert.equal(frenchChrome.cancel, "Annuler");
    assert.equal(frenchChrome.confirmDelete, "Confirmer la suppression");
    const callerMessage =
      "Delete this Ad campaign permanently? This cannot be undone.";
    assert.notEqual(frenchChrome.confirmDelete, callerMessage);
    assert.match(
      read("components/ads/AdCampaignHeaderDeleteButton.tsx"),
      /Delete this Ad campaign permanently\? This cannot be undone\./,
    );
  });
});

describe("V31 L3.2 tenant chrome — collapsible and back link", () => {
  it("keeps AthenaCollapsibleSection English by default for cross-surface callers", () => {
    const section = read("components/ui/AthenaCollapsibleSection.tsx");
    assert.match(section, /"▲ Collapse"/);
    assert.match(section, /"▼ Expand"/);
    assert.doesNotMatch(section, /tenantI18n|getTenantLocalization/);
    assert.doesNotMatch(section, /expandLabel|collapseLabel/);

    const licensee = read("components/licensee/estimate/EstimateAskAthenaPanel.tsx");
    const superAdmin = read("components/superAdmin/SuperAdminDashboardClient.tsx");
    assert.match(licensee, /AthenaCollapsibleSection/);
    assert.match(superAdmin, /AthenaCollapsibleSection/);
    assert.doesNotMatch(licensee, /expandLabel|collapseLabel/);
    assert.doesNotMatch(superAdmin, /expandLabel|collapseLabel/);
  });

  it("establishes a tenant-only back link that does not resolve language", () => {
    const back = read("components/navigation/TenantBackLink.tsx");
    assert.match(back, /label: string/);
    assert.match(back, /href: string/);
    assert.doesNotMatch(back, /tenantI18n|getTenantLocalization/);
    assert.doesNotMatch(back, /resolveOrganizationLanguage|navigator\.language/);
    assert.doesNotMatch(back, /"use client"/);

    const html = renderToStaticMarkup(
      createElement(TenantBackLink, {
        href: "/",
        label: `← ${fr.nav.dashboard}`,
      }),
    );
    assert.match(html, /href="\/"/);
    assert.match(html, /← Tableau de bord/);
  });

  it("does not add Back to Master to tenant dictionaries", () => {
    for (const language of ORGANIZATION_LANGUAGES) {
      for (const leaf of collectLeaves(DICTIONARIES[language])) {
        assert.notEqual(leaf.text, "Back to Master");
        assert.doesNotMatch(leaf.path, /backToMaster|returnToMaster/i);
      }
    }
    const back = read("components/licensee/BackToMasterCta.tsx");
    assert.match(back, /Back to Master/);
    assert.doesNotMatch(back, /tenantI18n|getTenantLocalization/);
  });
});

describe("V31 L3.2 tenant chrome — client delivery and dictionaries", () => {
  it("does not let Client modules resolve organization language or browser locale", () => {
    const forbidden = [
      /resolveOrganizationLanguage/,
      /getTenantLocalization/,
      /navigator\.language/,
      /accept-language/i,
      /document\.cookie/,
    ];
    const clientHits: string[] = [];
    for (const dir of ["app", "components", "lib"]) {
      for (const file of listTsFiles(dir)) {
        const source = read(file);
        if (!source.includes('"use client"')) continue;
        if (forbidden.some((pattern) => pattern.test(source))) {
          clientHits.push(file);
        }
      }
    }
    assert.deepEqual(clientHits, []);
  });

  it("keeps all six dictionaries structurally complete after chrome expansion", () => {
    const canonical = collectKeyPaths(en);
    assert.ok(canonical.includes("chrome.tagline"));
    assert.ok(canonical.includes("chrome.logOut"));
    assert.ok(canonical.includes("chrome.sessionActions"));
    assert.ok(canonical.includes("conversation.enterToSend"));
    assert.ok(canonical.includes("conversation.supportReference"));
    assert.ok(canonical.includes("common.confirmDelete"));
    for (const language of ORGANIZATION_LANGUAGES) {
      const paths = collectKeyPaths(DICTIONARIES[language]);
      assert.deepEqual(
        paths.filter((path) => !canonical.includes(path)),
        [],
        `${language} extra keys`,
      );
      assert.deepEqual(
        canonical.filter((path) => !paths.includes(path)),
        [],
        `${language} missing keys`,
      );
    }
  });

  it("preserves product terminology in chrome strings", () => {
    for (const language of ORGANIZATION_LANGUAGES) {
      const messages = DICTIONARIES[language];
      assert.equal(messages.chrome.tagline, "Intelligence OS");
      assert.match(messages.chrome.poweredByGetOblic, /GetOblic/);
      assert.equal(messages.nav.athenaBrain, "Athena Brain");
      assert.equal(messages.nav.intelligenceDomains, "Intelligence Domains");
      assert.equal(messages.nav.socialPlanner, "Social Planner");
      assert.equal(messages.conversation.askAthena, "Ask Athena");
      assert.equal(messages.conversation.athena, "Athena");
    }
  });
});
