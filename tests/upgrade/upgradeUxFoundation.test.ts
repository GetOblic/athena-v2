/**
 * FREE-15A — shared Upgrade UX presentation foundation.
 * Isolated component/contract verification. No product-page rollout.
 */

import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, it } from "node:test";
import { UpgradeCompletionCard } from "../../components/upgrade/UpgradeCompletionCard";
import { UpgradeExhaustedNotice } from "../../components/upgrade/UpgradeExhaustedNotice";
import { UpgradeHint } from "../../components/upgrade/UpgradeHint";
import { UpgradeInlineCTA } from "../../components/upgrade/UpgradeInlineCTA";
import { UpgradeSidebarInvite } from "../../components/upgrade/UpgradeSidebarInvite";
import { UpgradeUnavailableCard } from "../../components/upgrade/UpgradeUnavailableCard";
import {
  createUpgradeCapabilities,
  defaultUpgradeCtaTone,
  isUpgradeCtaActionInteractive,
  resolveUpgradeAccent,
  resolveUpgradeCtaAction,
  UPGRADE_ACCENTS,
  UPGRADE_CTA_TONES,
  UPGRADE_FEATURE_ACCENT,
  UPGRADE_FEATURE_KEYS,
  upgradeSidebarContent,
  type UpgradeContextualContent,
} from "../../lib/upgrade/upgradePresentation";
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

const FOUNDATION_FILES = [
  "lib/upgrade/upgradePresentation.ts",
  "components/upgrade/upgradeVisual.ts",
  "components/upgrade/UpgradeInlineCTA.tsx",
  "components/upgrade/UpgradeCapabilities.tsx",
  "components/upgrade/UpgradeSurface.tsx",
  "components/upgrade/UpgradeUnavailableCard.tsx",
  "components/upgrade/UpgradeHint.tsx",
  "components/upgrade/UpgradeExhaustedNotice.tsx",
  "components/upgrade/UpgradeCompletionCard.tsx",
  "components/upgrade/UpgradeSidebarInvite.tsx",
  "components/upgrade/index.ts",
] as const;

const FORBIDDEN_COPY =
  /pricing|trial|unlimited|unlock everything|all features|checkout|billing|paywall|quota|1\/1/i;

const FORBIDDEN_IMPORTS =
  /from ["'][^"']*(supabase|stripe|organization\/free|services\/athenaPlan|organizationService)/i;

const SUCCESS_COPY = "Your Visibility analysis is ready.";

const convertContent: UpgradeContextualContent = {
  feature: "convert",
  eyebrow: en.upgrade.fullAthena,
  headline: "Continue prospecting",
  capabilities: createUpgradeCapabilities([
    "Research additional businesses",
    "Use the GetOblic Directory",
    "Keep building your opportunity pipeline",
  ]),
  ctaLabel: en.upgrade.continueWithFullAthena,
};

const visibilityContent: UpgradeContextualContent = {
  feature: "visibility",
  eyebrow: en.upgrade.fullAthena,
  headline: "Continue Visibility",
  capabilities: createUpgradeCapabilities([
    "Create additional Visibility analyses",
    "Website Technical Health",
  ]),
  ctaLabel: en.upgrade.continueWithFullAthena,
};

describe("FREE-15A Upgrade UX foundation", () => {
  it("keeps a feature-specific capability contract for future rollouts", () => {
    assert.deepEqual([...UPGRADE_FEATURE_KEYS], [
      "identity",
      "identityAsk",
      "helpAsk",
      "visibility",
      "audience",
      "personaAsk",
      "advertising",
      "social",
      "convert",
      "getoblicDirectory",
      "personaCsv",
      "prospectCsv",
      "technicalSeo",
    ]);
    assert.equal(resolveUpgradeAccent("identity"), "identity");
    assert.equal(resolveUpgradeAccent("visibility"), "visibility");
    assert.equal(resolveUpgradeAccent("audience"), "audience");
    assert.equal(resolveUpgradeAccent("advertising"), "advertising");
    assert.equal(resolveUpgradeAccent("social"), "social");
    assert.equal(resolveUpgradeAccent("convert"), "convert");
    assert.equal(resolveUpgradeAccent("helpAsk"), "help");
    assert.equal(resolveUpgradeAccent("technicalSeo"), "visibility");
    assert.equal(UPGRADE_FEATURE_ACCENT.convert, "convert");
  });

  it("renders caller-supplied feature capabilities instead of generic marketing copy", () => {
    const html = renderToStaticMarkup(
      createElement(UpgradeCompletionCard, convertContent),
    );

    assert.match(html, /data-upgrade-feature="convert"/);
    assert.match(html, /Continue prospecting/);
    assert.match(html, /Research additional businesses/);
    assert.match(html, /Use the GetOblic Directory/);
    assert.match(html, /Keep building your opportunity pipeline/);
    assert.doesNotMatch(html, /unlock everything|unlimited|all features|get more/i);
    assert.doesNotMatch(html, FORBIDDEN_COPY);
  });

  it("renders multiple feature-specific capabilities without inferring entitlement copy", () => {
    const convertHtml = renderToStaticMarkup(
      createElement(UpgradeUnavailableCard, convertContent),
    );
    const visibilityHtml = renderToStaticMarkup(
      createElement(UpgradeUnavailableCard, {
        ...visibilityContent,
        capabilities: createUpgradeCapabilities([
          "Create another Visibility Strategy",
          "Open Website Technical Health",
        ]),
      }),
    );

    assert.match(convertHtml, /Research additional businesses/);
    assert.doesNotMatch(convertHtml, /Create another Visibility Strategy/);
    assert.match(visibilityHtml, /Create another Visibility Strategy/);
    assert.doesNotMatch(visibilityHtml, /Research additional businesses/);
    assert.match(visibilityHtml, /data-upgrade-feature="visibility"/);
  });

  it("does not replace caller success copy", () => {
    const html = renderToStaticMarkup(
      createElement(
        "div",
        null,
        createElement("p", null, SUCCESS_COPY),
        createElement(UpgradeCompletionCard, visibilityContent),
      ),
    );

    assert.match(html, /Your Visibility analysis is ready\./);
    assert.match(html, /Continue Visibility/);
    assert.match(html, /Create additional Visibility analyses/);

    const cardOnly = renderToStaticMarkup(
      createElement(UpgradeCompletionCard, visibilityContent),
    );
    assert.doesNotMatch(cardOnly, /Your Visibility analysis is ready/);
    assert.doesNotMatch(
      read("components/upgrade/UpgradeCompletionCard.tsx"),
      /successHeadline|replaceSuccess|completionValue/,
    );
    assert.doesNotMatch(
      read("lib/upgrade/upgradePresentation.ts"),
      /successHeadline|replaceSuccess|completionValue/,
    );
  });

  it("does not invent a CTA destination", () => {
    const html = renderToStaticMarkup(
      createElement(UpgradeCompletionCard, convertContent),
    );

    assert.doesNotMatch(html, /href=/);
    assert.doesNotMatch(html, /\/pricing|\/checkout|\/billing|\/upgrade/);

    for (const file of FOUNDATION_FILES) {
      const source = read(file);
      assert.doesNotMatch(source, /href:\s*["']\//);
      assert.doesNotMatch(source, /\/pricing|\/checkout|\/billing/);
    }
  });

  it("can render without a CTA action and accept one later", () => {
    const withoutAction = renderToStaticMarkup(
      createElement(UpgradeExhaustedNotice, convertContent),
    );
    assert.doesNotMatch(withoutAction, /<button/);
    assert.doesNotMatch(withoutAction, /<a /);
    assert.match(withoutAction, /Continue prospecting/);

    const withHandler = renderToStaticMarkup(
      createElement(UpgradeExhaustedNotice, {
        ...convertContent,
        action: { kind: "handler", onContinue() {} },
      }),
    );
    assert.match(withHandler, /<button type="button"/);
    assert.match(withHandler, /data-upgrade-cta-kind="handler"/);
    assert.match(withHandler, /Continue with Full Athena/);
    assert.doesNotMatch(withHandler, /href=/);

    const withHref = renderToStaticMarkup(
      createElement(UpgradeInlineCTA, {
        label: en.upgrade.continueWithFullAthena,
        tone: "primary",
        action: { kind: "href", href: "/test-supplied-destination" },
      }),
    );
    assert.match(withHref, /href="\/test-supplied-destination"/);
    assert.match(withHref, /data-upgrade-cta-kind="href"/);

    assert.equal(isUpgradeCtaActionInteractive(undefined), false);
    assert.equal(resolveUpgradeCtaAction(undefined).kind, "none");
    assert.equal(
      isUpgradeCtaActionInteractive({ kind: "handler", onContinue() {} }),
      true,
    );
  });

  it("exposes quiet / medium / primary CTA hierarchy", () => {
    assert.deepEqual([...UPGRADE_CTA_TONES], ["quiet", "medium", "primary"]);
    assert.equal(defaultUpgradeCtaTone("hint"), "quiet");
    assert.equal(defaultUpgradeCtaTone("unavailable"), "quiet");
    assert.equal(defaultUpgradeCtaTone("sidebar"), "quiet");
    assert.equal(defaultUpgradeCtaTone("exhausted"), "medium");
    assert.equal(defaultUpgradeCtaTone("completion"), "medium");

    const quiet = renderToStaticMarkup(
      createElement(UpgradeHint, convertContent),
    );
    const medium = renderToStaticMarkup(
      createElement(UpgradeExhaustedNotice, convertContent),
    );
    const primary = renderToStaticMarkup(
      createElement(UpgradeCompletionCard, {
        ...convertContent,
        ctaTone: "primary",
        action: { kind: "handler", onContinue() {} },
      }),
    );

    assert.match(quiet, /data-upgrade-cta-tone="quiet"/);
    assert.match(medium, /data-upgrade-cta-tone="medium"/);
    assert.match(primary, /data-upgrade-cta-tone="primary"/);
  });

  it("keeps semantic feature accents instead of one marketing theme", () => {
    assert.deepEqual([...UPGRADE_ACCENTS], [
      "identity",
      "visibility",
      "audience",
      "advertising",
      "social",
      "convert",
      "help",
      "chrome",
    ]);

    const identity = renderToStaticMarkup(
      createElement(UpgradeUnavailableCard, {
        ...convertContent,
        feature: "identity",
        headline: "Continue Identity",
        capabilities: createUpgradeCapabilities([
          "Retrain Athena Brain",
          "Run Identity Deep Scrape again",
        ]),
      }),
    );
    const advertising = renderToStaticMarkup(
      createElement(UpgradeUnavailableCard, {
        ...convertContent,
        feature: "advertising",
        headline: "Continue advertising",
        capabilities: createUpgradeCapabilities([
          "Create another advertising campaign",
        ]),
      }),
    );

    assert.match(identity, /data-upgrade-accent="identity"/);
    assert.match(advertising, /data-upgrade-accent="advertising"/);
    assert.match(identity, /athena-success/);
    assert.match(advertising, /245,158,11/);
  });

  it("keeps the unavailable surface non-interactive except for a supplied CTA", () => {
    const inert = renderToStaticMarkup(
      createElement(UpgradeUnavailableCard, convertContent),
    );
    assert.match(inert, /role="note"/);
    assert.doesNotMatch(inert, /<button/);
    assert.doesNotMatch(inert, /<a /);
    assert.doesNotMatch(inert, /role="button"/);

    const withCta = renderToStaticMarkup(
      createElement(UpgradeUnavailableCard, {
        ...convertContent,
        action: { kind: "handler", onContinue() {} },
      }),
    );
    assert.equal(withCta.match(/<button /g)?.length, 1);
    assert.match(withCta, /role="note"/);
  });

  it("exposes accessibility relationships for headings, notes, and CTAs", () => {
    const html = renderToStaticMarkup(
      createElement(UpgradeCompletionCard, {
        ...convertContent,
        supportingText: "Athena already completed this Free research.",
        action: { kind: "handler", onContinue() {} },
      }),
    );

    assert.match(html, /<h2 id="/);
    assert.match(html, /role="region"/);
    assert.match(html, /aria-labelledby="/);
    assert.match(html, /<ul id="/);
    assert.match(html, /Research additional businesses/);
    assert.match(html, /aria-describedby="/);
    assert.match(html, /Athena already completed this Free research/);

    const hint = renderToStaticMarkup(
      createElement(UpgradeHint, {
        feature: "personaCsv",
        eyebrow: en.upgrade.availableWithFullAthena,
        headline: "CSV import stays with Full Athena",
        capabilities: createUpgradeCapabilities([
          "Import additional audiences from CSV",
        ]),
      }),
    );
    assert.match(hint, /role="note"/);
    assert.match(hint, /aria-labelledby="/);
    assert.match(hint, /Import additional audiences from CSV/);
  });

  it("keeps shared foundation copy free of pricing language", () => {
    for (const language of ORGANIZATION_LANGUAGES) {
      const copy = DICTIONARIES[language].upgrade;
      for (const value of Object.values(copy)) {
        assert.doesNotMatch(value, FORBIDDEN_COPY, language);
      }
    }

    for (const file of FOUNDATION_FILES) {
      assert.doesNotMatch(read(file), FORBIDDEN_COPY, file);
    }
  });

  it("keeps six-language shared upgrade key parity", () => {
    const canonical = collectKeyPaths(en.upgrade);
    assert.deepEqual(canonical, [
      "availableWithFullAthena",
      "continueWithFullAthena",
      "fullAthena",
      "sidebarEyebrow",
      "sidebarHeadline",
      "sidebarSupportingText",
    ]);

    for (const language of ORGANIZATION_LANGUAGES) {
      const paths = collectKeyPaths(DICTIONARIES[language].upgrade);
      assert.deepEqual(paths, canonical, language);
    }

    assert.equal(en.upgrade.fullAthena, "Full Athena");
    assert.equal(en.upgrade.continueWithFullAthena, "Continue with Full Athena");
    assert.equal(
      en.upgrade.availableWithFullAthena,
      "Available with Full Athena",
    );
  });

  it("treats capability copy as caller context, not entitlement inference", () => {
    const presentation = read("lib/upgrade/upgradePresentation.ts");
    const surface = read("components/upgrade/UpgradeSurface.tsx");
    assert.doesNotMatch(presentation, /athenaPlan|isFreeTrained|freeAudience/);
    assert.doesNotMatch(surface, /athenaPlan|isFreeTrained|shouldShow/);

    const sameFeatureDifferentCopy = renderToStaticMarkup(
      createElement(UpgradeHint, {
        feature: "social",
        headline: "Continue this calendar",
        capabilities: createUpgradeCapabilities([
          "Create additional social weeks",
        ]),
      }),
    );
    assert.match(sameFeatureDifferentCopy, /Create additional social weeks/);
    assert.doesNotMatch(sameFeatureDifferentCopy, /Evergreen/);
  });

  it("stays presentation-only and renders the sidebar invite without feature capabilities", () => {
    for (const file of FOUNDATION_FILES) {
      assert.doesNotMatch(read(file), FORBIDDEN_IMPORTS, file);
    }

    const sidebar = upgradeSidebarContent(en.upgrade);
    const html = renderToStaticMarkup(
      createElement(UpgradeSidebarInvite, sidebar),
    );

    assert.match(html, /ATHENA FREE/);
    assert.match(html, /Unlock the full power of Athena/);
    assert.match(
      html,
      /Access the complete Intelligence OS and continue beyond Free limits\./,
    );
    assert.match(html, /Continue with Full Athena/);
    assert.ok(
      html.indexOf("ATHENA FREE") < html.indexOf("Unlock the full power of Athena"),
    );
    assert.ok(
      html.indexOf("Unlock the full power of Athena") <
        html.indexOf(
          "Access the complete Intelligence OS and continue beyond Free limits.",
        ),
    );
    assert.ok(
      html.indexOf(
        "Access the complete Intelligence OS and continue beyond Free limits.",
      ) < html.indexOf("Continue with Full Athena"),
    );
    assert.match(html, /data-upgrade-variant="sidebar"/);
    assert.match(html, /data-upgrade-cta-tone="quiet"/);
    assert.match(html, /data-upgrade-cta-kind="none"/);
    assert.doesNotMatch(html, /<ul/);
    assert.doesNotMatch(html, /<button/);
    assert.doesNotMatch(html, /<a /);
  });
});
