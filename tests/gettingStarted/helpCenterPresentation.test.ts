/**
 * Help Center page composition, chrome, and V2 visual grammar.
 */

import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, it } from "node:test";
import { HelpCenterHero } from "../../components/getting-started/HelpCenterHero";
import { HelpCenterView } from "../../components/getting-started/HelpCenterView";
import { HELP_SECTION_ANCHORS } from "../../lib/gettingStarted/helpCenterCatalog";
import { HELP_COLLAPSIBLE_TONE } from "../../lib/gettingStarted/helpCenterPresentation";
import { de } from "../../lib/tenantI18n/messages/de";
import { en } from "../../lib/tenantI18n/messages/en";
import { es } from "../../lib/tenantI18n/messages/es";
import { fr } from "../../lib/tenantI18n/messages/fr";
import { it as itMessages } from "../../lib/tenantI18n/messages/it";
import { pt } from "../../lib/tenantI18n/messages/pt";
import { tenantConversationWrapperChrome } from "../../lib/tenantI18n/conversationChrome";
import { ORGANIZATION_LANGUAGES } from "../../services/organizationLanguage";

const ROOT = process.cwd();

function read(relativePath: string): string {
  return readFileSync(join(ROOT, relativePath), "utf8");
}

function conversationChrome() {
  return tenantConversationWrapperChrome(en);
}

function renderHelp(initialTopicId?: string | null) {
  return renderToStaticMarkup(
    createElement(HelpCenterView, {
      copy: en.gettingStarted,
      initialTopicId,
      conversationChrome: conversationChrome(),
    }),
  );
}

function conversationRegion(html: string): string {
  const start = html.indexOf('id="getting-started-conversation"');
  assert.ok(start >= 0, "expected a single Ask Athena conversation panel");
  return html.slice(start, start + 800);
}

const ASK_COPY_BY_LANGUAGE: Record<string, { cta: string; hint: string }> = {
  en: { cta: en.gettingStarted.askAthenaCta, hint: en.gettingStarted.askAthenaHint },
  fr: { cta: fr.gettingStarted.askAthenaCta, hint: fr.gettingStarted.askAthenaHint },
  es: { cta: es.gettingStarted.askAthenaCta, hint: es.gettingStarted.askAthenaHint },
  it: { cta: itMessages.gettingStarted.askAthenaCta, hint: itMessages.gettingStarted.askAthenaHint },
  de: { cta: de.gettingStarted.askAthenaCta, hint: de.gettingStarted.askAthenaHint },
  pt: { cta: pt.gettingStarted.askAthenaCta, hint: pt.gettingStarted.askAthenaHint },
};

describe("help center presentation", () => {
  it("page stays behind login and does not provision org context", () => {
    const page = read("app/getting-started/page.tsx");
    assert.match(page, /createSupabaseServerClient/);
    assert.match(page, /supabase\.auth\.getUser/);
    assert.match(page, /redirect\("\/login"\)/);
    assert.match(page, /HelpCenterView/);
    assert.match(page, /copy\.title|messages\.gettingStarted/);
    assert.match(page, /copy\.intro|messages\.gettingStarted/);
    assert.doesNotMatch(page, /requireCurrentOrganizationContext/);
    assert.doesNotMatch(page, /provisionTenantForAuthenticatedUser/);
    assert.doesNotMatch(page, /TenantBackLink/);
    assert.doesNotMatch(page, /<main\b/);
    assert.match(
      page,
      /<TenantAppShell currentPath="\/getting-started" messages=\{messages\}>/,
    );
  });

  it("does not recreate V1 onboarding pamphlet content", () => {
    const page = read("app/getting-started/page.tsx");
    const view = read("components/getting-started/HelpCenterView.tsx");
    const dictionary = read("lib/tenantI18n/messages/en.ts");
    for (const source of [page, view, dictionary]) {
      assert.doesNotMatch(source, /AI Market Intelligence Partner/);
      assert.doesNotMatch(source, /Open Inbox/);
      assert.doesNotMatch(source, /href="\/inbox"/);
      assert.doesNotMatch(source, /href="\/discussions"/);
      assert.doesNotMatch(source, /href="\/opportunities"/);
      assert.doesNotMatch(source, /href="\/briefings"/);
      assert.doesNotMatch(source, /href="\/licensee"/);
      assert.doesNotMatch(source, /href="\/super"/);
    }
    assert.doesNotMatch(
      dictionary,
      /Import the conversations that matter to your business/,
    );
    assert.match(dictionary, /Help Center is the product guide/);
    assert.match(en.gettingStarted.title, /How Athena works/);
    assert.match(en.gettingStarted.quickStart.steps.trainBrain.title, /Athena Brain/);
  });

  it("reuses accepted V2 visual grammar", () => {
    const presentation = read("lib/gettingStarted/helpCenterPresentation.ts");
    assert.match(presentation, /rounded-\[24px\]/);
    assert.match(presentation, /athena-card/);
    assert.match(presentation, /athena-orange/);
    assert.match(presentation, /rounded-2xl/);
    assert.equal(HELP_COLLAPSIBLE_TONE, "intelligence");
    const view = read("components/getting-started/HelpCenterView.tsx");
    assert.match(view, /HelpCenterHero/);
    assert.match(view, /HelpCenterTopicNav/);
    assert.match(view, /HelpOutcomeGrid/);
    assert.match(view, /HelpTopicSection/);
    assert.match(view, /HelpWorkflowList/);
    assert.match(view, /GettingStartedConversationPanel/);
    assert.match(view, /#start|#quick-start|HELP_SECTION_ANCHORS/);
  });

  it("renders Start here, Quick start, outcomes, and Ask Athena from localized copy", () => {
    const html = renderToStaticMarkup(
      createElement(HelpCenterView, {
        copy: en.gettingStarted,
        conversationChrome: tenantConversationWrapperChrome(en),
      }),
    );
    assert.match(html, /How Athena works/);
    assert.match(html, /Start here/);
    assert.match(html, /Quick start/);
    assert.match(html, /Define Your Business/);
    assert.match(html, /Build Visibility/);
    assert.match(html, /Generate Traction/);
    assert.match(html, /Convert Opportunities/);
    assert.match(html, /Ask Athena how to use Athena/);
    assert.match(html, /id="start"/);
    assert.match(html, /id="quick-start"/);
    assert.match(html, /id="define"/);
    assert.match(html, /id="ask"/);
    assert.doesNotMatch(html, /Open Inbox/);
    assert.doesNotMatch(html, /AI Market Intelligence Partner/);
  });

  it("opens a valid topic from the query and ignores unknown topics", () => {
    const known = renderToStaticMarkup(
      createElement(HelpCenterView, {
        copy: en.gettingStarted,
        initialTopicId: "howto-audience-vs-prospect",
        conversationChrome: tenantConversationWrapperChrome(en),
      }),
    );
    assert.match(known, /Understand Audience vs Prospect/);

    const unknown = renderToStaticMarkup(
      createElement(HelpCenterView, {
        copy: en.gettingStarted,
        initialTopicId: "not-a-real-topic",
        conversationChrome: tenantConversationWrapperChrome(en),
      }),
    );
    assert.match(unknown, /How Athena works/);
    assert.doesNotMatch(unknown, /not-a-real-topic/);
  });

  it("renders a hero Ask Athena CTA that targets the existing Ask destination", () => {
    const html = renderHelp();
    const hero = read("components/getting-started/HelpCenterHero.tsx");
    assert.match(html, /data-help-ask-cta=""/);
    assert.match(html, new RegExp(`href="#${HELP_SECTION_ANCHORS.ask}"`));
    assert.match(html, /Ask Athena/);
    assert.match(html, /Ask how Athena works/);
    assert.match(hero, /HELP_SECTION_ANCHORS\.ask/);
    assert.match(hero, /onAskAthena/);
    assert.match(hero, /HELP_ASK_CTA_CLASS/);
    assert.equal((html.match(/data-help-ask-cta=""/g) ?? []).length, 1);
    assert.ok(
      html.indexOf("data-help-ask-cta") < html.indexOf('id="help-center-topic-filter"'),
      "Ask Athena CTA must sit in the hero header, not under Find a topic",
    );
    assert.match(hero, /lg:justify-between/);
    assert.match(hero, /lg:items-end/);
  });

  it("keeps Ask Athena closed on a normal first load", () => {
    const html = renderHelp();
    assert.match(html, /id="start"/);
    assert.match(html, /id="quick-start"/);
    assert.match(conversationRegion(html), /aria-expanded="false"/);
    assert.match(html, /data-help-ask-destination=""/);
  });

  it("opens Ask Athena from a valid Help deep-link and keeps a single conversation panel", () => {
    const opened = renderHelp("ask");
    assert.match(opened, /data-help-ask-destination=""/);
    assert.match(conversationRegion(opened), /aria-expanded="true"/);
    assert.equal(
      (opened.match(/id="getting-started-conversation"/g) ?? []).length,
      1,
    );
    assert.equal((opened.match(/data-help-ask-destination=""/g) ?? []).length, 1);

    const topicDeepLink = renderHelp("howto-audience-vs-prospect");
    assert.match(conversationRegion(topicDeepLink), /aria-expanded="false"/);

    const view = read("components/getting-started/HelpCenterView.tsx");
    assert.match(view, /isHelpAskDestination/);
    assert.match(view, /open=\{conversationOpen\}/);
    assert.equal(
      (view.match(/<GettingStartedConversationPanel/g) ?? []).length,
      1,
    );
    assert.doesNotMatch(view, /\/getting-started\/ask/);
  });

  it("keeps Ask Athena hero copy present across six locales", () => {
    for (const language of ORGANIZATION_LANGUAGES) {
      const copy = ASK_COPY_BY_LANGUAGE[language];
      assert.ok(copy.cta.trim(), `${language} askAthenaCta`);
      assert.ok(copy.hint.trim(), `${language} askAthenaHint`);
    }
    assert.equal(en.gettingStarted.askAthenaCta, "Ask Athena");
    assert.equal(en.gettingStarted.askAthenaHint, "Ask how Athena works");
    assert.notEqual(fr.gettingStarted.askAthenaHint, en.gettingStarted.askAthenaHint);
    const hero = renderToStaticMarkup(
      createElement(HelpCenterHero, {
        copy: fr.gettingStarted,
        query: "",
        onQueryChange() {},
        onAskAthena() {},
      }),
    );
    assert.match(hero, /Ask Athena/);
    assert.match(hero, /Demandez comment Athena fonctionne/);
    assert.match(hero, /href="#ask"/);
  });
});
