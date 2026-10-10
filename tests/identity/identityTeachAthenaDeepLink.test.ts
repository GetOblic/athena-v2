/**
 * FREE-4 Teach Athena deep-link: sidebar CTA, hash target, and same-page disclosure.
 */

import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { createElement, act } from "react";
import { createRoot } from "react-dom/client";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, it } from "node:test";
import { JSDOM } from "jsdom";
import { TenantSidebar } from "../../components/dashboard/TenantSidebar";
import { IdentityCalibrationGaps } from "../../components/identity/IdentityCalibrationGaps";
import { IdentityWebsiteKnowledge } from "../../components/identity/IdentityWebsiteKnowledge";
import {
  IDENTITY_FIELD_ANCHORS,
  IDENTITY_TEACH_ATHENA_HREF,
  IDENTITY_UPDATE_LOCATION_HREFS,
  isIdentityTeachAthenaHash,
  isIdentityTeachAthenaHref,
  resolveIdentityFieldHash,
} from "../../components/identity/identityPagePresentation";
import {
  activateIdentityLocationHash,
  activateIdentityTeachAthenaDeepLink,
  handleIdentityFieldDeepLinkClick,
  handleIdentityTeachAthenaDeepLinkClick,
  IdentityTeachAthenaDisclosure,
} from "../../components/identity/identityTeachAthenaDeepLink";
import { IdentityTeachAthenaSection } from "../../components/identity/IdentityTeachAthenaSection";
import type { AthenaIdentity } from "../../services/identity/identityService";
import { FREE_UNTRAINED_TEACH_HREF } from "../../lib/organization/freeUntrained";
import { en } from "../../lib/tenantI18n/messages/en";

const ROOT = process.cwd();

function read(relativePath: string): string {
  return readFileSync(join(ROOT, relativePath), "utf8");
}

function hrefsIn(html: string): string[] {
  return [...html.matchAll(/href="([^"]+)"/g)].map((match) => match[1]);
}

describe("FREE-4 Teach Athena destination contract", () => {
  it("points every disabled progression CTA at the stable Teach Athena destination", () => {
    assert.equal(FREE_UNTRAINED_TEACH_HREF, IDENTITY_TEACH_ATHENA_HREF);
    assert.equal(IDENTITY_TEACH_ATHENA_HREF, "/identity#identity-teach");
    assert.equal(IDENTITY_FIELD_ANCHORS.teach, "identity-teach");
    assert.equal(isIdentityTeachAthenaHref(FREE_UNTRAINED_TEACH_HREF), true);
    assert.equal(isIdentityTeachAthenaHref("/identity"), false);
    assert.equal(isIdentityTeachAthenaHref("/seo"), false);

    const desktop = renderToStaticMarkup(
      createElement(TenantSidebar, {
        currentPath: "/identity",
        messages: en,
        athenaPlan: "free",
        defineKind: "needs_setup",
      }),
    );
    const teachHrefs = hrefsIn(desktop).filter(
      (href) => href === IDENTITY_TEACH_ATHENA_HREF,
    );
    assert.equal(teachHrefs.length, 3);
    assert.equal(
      hrefsIn(desktop).filter((href) => href === "/identity").length,
      1,
    );
    assert.match(desktop, /Teach Athena →/);
    assert.equal(hrefsIn(desktop).includes("/seo"), false);
    assert.equal(hrefsIn(desktop).includes("/personas"), false);
    assert.equal(hrefsIn(desktop).includes("/prospects"), false);
    assert.match(desktop, /id="locked-growth-buildVisibility"/);
    assert.match(desktop, /group-hover:visible/);
    assert.match(desktop, /group-focus-within:visible/);

    const sidebar = read("components/dashboard/TenantSidebar.tsx");
    assert.match(sidebar, /IdentityTeachAthenaLink/);
    assert.match(
      sidebar,
      /lockedActionHref && item\.lockedActionLabel \? \(\s*<IdentityTeachAthenaLink/,
    );
  });

  it("exposes a stable Teach Athena DOM anchor without changing route guards", () => {
    const teach = read("components/identity/IdentityTeachAthenaSection.tsx");
    const disclosure = read(
      "components/identity/identityTeachAthenaDeepLink.tsx",
    );
    const page = read("app/identity/page.tsx");
    const guard = read("services/organization/freeProgressionState.ts");

    assert.match(teach, /IdentityTeachAthenaDisclosure/);
    assert.match(disclosure, /id=\{IDENTITY_FIELD_ANCHORS\.teach\}/);
    assert.match(disclosure, /hashchange/);
    assert.doesNotMatch(page, /redirectIfFreeUntrainedGrowthRoute/);
    assert.match(guard, /redirect\("\/identity"\)/);
    assert.doesNotMatch(guard, /identity-teach|IDENTITY_TEACH_ATHENA_HREF/);
    assert.doesNotMatch(read("middleware.ts"), /identity-teach|isFreeUntrained/);
  });
});

describe("ID-CTA-1B Identity field hash contract", () => {
  it("keeps the four update_location hrefs and resolves only their disclosures", () => {
    assert.equal(IDENTITY_UPDATE_LOCATION_HREFS["Your Voice"], "#identity-voice");
    assert.equal(
      IDENTITY_UPDATE_LOCATION_HREFS["Your Business Knowledge"],
      "#identity-knowledge",
    );
    assert.equal(
      IDENTITY_UPDATE_LOCATION_HREFS["Business Website"],
      "#identity-website",
    );
    assert.equal(
      IDENTITY_UPDATE_LOCATION_HREFS["Website content"],
      "#identity-website-knowledge",
    );
    assert.deepEqual(resolveIdentityFieldHash("#identity-voice"), {
      disclosure: "teach",
      targetId: "identity-voice",
    });
    assert.deepEqual(resolveIdentityFieldHash("identity-knowledge"), {
      disclosure: "teach",
      targetId: "identity-knowledge",
    });
    assert.deepEqual(resolveIdentityFieldHash("#identity-website"), {
      disclosure: "teach",
      targetId: "identity-website",
    });
    assert.deepEqual(resolveIdentityFieldHash("#identity-teach"), {
      disclosure: "teach",
      targetId: "identity-teach",
    });
    assert.deepEqual(resolveIdentityFieldHash("#identity-website-knowledge"), {
      disclosure: "websiteKnowledge",
      targetId: "identity-website-knowledge",
    });
    for (const href of Object.values(IDENTITY_UPDATE_LOCATION_HREFS)) {
      assert.notEqual(resolveIdentityFieldHash(href), null);
    }
    assert.equal(resolveIdentityFieldHash("#identity-other"), null);
    assert.equal(resolveIdentityFieldHash("#identity-website-knowledge-extra"), null);
    assert.equal(resolveIdentityFieldHash(""), null);
    assert.equal(resolveIdentityFieldHash(null), null);
    assert.equal(resolveIdentityFieldHash(undefined), null);
    assert.equal(isIdentityTeachAthenaHash("#identity-voice"), false);
    assert.equal(isIdentityTeachAthenaHash("#identity-teach"), true);

    const presentation = read("components/identity/identityPagePresentation.ts");
    const teachLink = read("components/identity/identityTeachAthenaDeepLink.tsx");
    const websiteLink = read(
      "components/identity/identityWebsiteKnowledgeDeepLink.tsx",
    );
    const gaps = read("components/identity/IdentityCalibrationGaps.tsx");
    const website = read("components/identity/IdentityWebsiteKnowledge.tsx");
    for (const source of [presentation, teachLink, websiteLink, gaps, website]) {
      assert.doesNotMatch(source, /fetch\(|upsertAthenaIdentity|saveIdentity/);
      assert.doesNotMatch(source, /localStorage|sessionStorage/);
    }
    const resolver = presentation.slice(
      presentation.indexOf("export function resolveIdentityFieldHash"),
      presentation.indexOf("const PAGE_GROUP_KEYS"),
    );
    assert.match(resolver, /IDENTITY_FIELD_HASH_DISCLOSURES/);
    assert.doesNotMatch(resolver, /what_is_unclear|why_it_matters/);
    assert.doesNotMatch(teachLink, /what_is_unclear|update_location|setTimeout|setInterval/);
    assert.doesNotMatch(websiteLink, /what_is_unclear|update_location|setTimeout|setInterval/);
    assert.match(teachLink, /preventScroll:\s*true/);
    assert.match(websiteLink, /preventScroll:\s*true/);
    assert.match(gaps, /href=\{href\}/);
    assert.match(gaps, /IdentityFieldDeepLink/);
    assert.match(gaps, /defaultOpen=\{false\}/);
    assert.doesNotMatch(gaps, /"use client"/);
    assert.doesNotMatch(website, /"use client"/);
    assert.match(website, /id=\{IDENTITY_FIELD_ANCHORS\.websiteKnowledge\}/);
    assert.match(website, /IdentityWebsiteKnowledgeDisclosure/);
    assert.doesNotMatch(
      read("components/ui/AthenaCollapsibleSection.tsx"),
      /resolveIdentityFieldHash|identity-voice/,
    );
  });
});

describe("FREE-4 Teach Athena disclosure behavior", { concurrency: false }, () => {
  it("keeps Teach Athena collapsed on a normal Identity render", () => {
    const html = renderToStaticMarkup(
      createElement(IdentityTeachAthenaSection, {
        identity: null,
        messages: en.identity,
        action: async () => undefined,
        trainLabel: "Train Athena",
        pendingLabel: "Training Athena...",
      }),
    );
    assert.match(html, /id="identity-teach"/);
    assert.match(html, /aria-expanded="false"/);
    assert.doesNotMatch(html, /name="greeting_name"/);
    assert.equal(isIdentityTeachAthenaHash(""), false);
    assert.equal(isIdentityTeachAthenaHash(undefined), false);
  });

  it("expands, scrolls, and focuses Teach Athena from the deep link, including same-page /identity", async () => {
    const { container, restore, fetches, focusCalls, scrollCalls } =
      mountDisclosure("http://localhost/identity");
    try {
      const closed = container.querySelector("#identity-teach button[aria-expanded]");
      assert.ok(closed);
      assert.equal(closed.getAttribute("aria-expanded"), "false");
      assert.equal(container.textContent?.includes("workflow body"), false);

      await act(async () => {
        handleIdentityTeachAthenaDeepLinkClick({
          preventDefault() {
            /* same-page activation */
          },
        });
      });
      await flushReveal();

      const opened = container.querySelector("#identity-teach button[aria-expanded]");
      assert.ok(opened);
      assert.equal(opened.getAttribute("aria-expanded"), "true");
      assert.match(container.textContent ?? "", /workflow body/);
      assert.equal(globalThis.document.activeElement, opened);
      assert.equal(focusCalls.at(-1)?.element, opened);
      assert.equal(focusCalls.at(-1)?.preventScroll, true);
      assert.equal(scrollCalls.at(-1)?.id, "identity-teach");
      assert.equal(scrollCalls.at(-1)?.block, "start");
      assert.equal(globalThis.window.location.hash, "#identity-teach");
      assert.equal(fetches.length, 0);
    } finally {
      restore();
    }
  });

  it("expands Teach Athena when Identity loads with the hash already present", async () => {
    const { container, restore, fetches } = mountDisclosure(
      "http://localhost/identity#identity-teach",
    );
    try {
      await flushReveal();
      const trigger = container.querySelector("#identity-teach button[aria-expanded]");
      assert.ok(trigger);
      assert.equal(trigger.getAttribute("aria-expanded"), "true");
      assert.match(container.textContent ?? "", /workflow body/);
      assert.equal(fetches.length, 0);
    } finally {
      restore();
    }
  });

  it("does not generate, train, or call APIs from the deep-link action", () => {
    const disclosure = read(
      "components/identity/identityTeachAthenaDeepLink.tsx",
    );
    const helper = read("lib/organization/freeUntrained.ts");
    const page = read("app/identity/page.tsx");
    for (const source of [disclosure, helper]) {
      assert.doesNotMatch(source, /fetch\(|upsertAthenaIdentity|saveIdentity/);
      assert.doesNotMatch(source, /\/api\/identity|compileMasterIdentityProfile/);
      assert.doesNotMatch(source, /localStorage|sessionStorage/);
    }
    assert.doesNotMatch(disclosure, /auto-?train|auto-?submit/i);
    assert.match(page, /IdentityTeachAthenaSection/);
    assert.doesNotMatch(page, /activateIdentityTeachAthenaDeepLink/);

    let prevented = false;
    const previousPath = "http://localhost/seo";
    const { restore } = mountWindow(previousPath);
    try {
      handleIdentityTeachAthenaDeepLinkClick({
        preventDefault() {
          prevented = true;
        },
      });
      assert.equal(prevented, false);
      assert.equal(globalThis.window.location.pathname, "/seo");
      activateIdentityTeachAthenaDeepLink();
      assert.equal(globalThis.window.location.hash, "#identity-teach");
    } finally {
      restore();
    }
  });

  it("keeps Teach Athena and Website Knowledge closed on an ordinary visit", async () => {
    const mounted = mountNavigation("http://localhost/identity");
    try {
      await flushReveal();
      assert.equal(expanded(mounted.container, "identity-teach"), "false");
      assert.equal(
        expanded(mounted.container, "identity-website-knowledge"),
        "false",
      );
      assert.equal(mounted.container.querySelector("#identity-voice"), null);
      assert.equal(mounted.focusCalls.length, 0);
      assert.equal(mounted.scrollCalls.length, 0);
      assert.equal(mounted.fetches.length, 0);
      assert.equal(mounted.actionCalls, 0);
    } finally {
      mounted.restore();
    }
  });

  it("opens a closed Teach Athena card and focuses Voice, Knowledge, and Website", async () => {
    const fields = [
      { hash: "#identity-voice", id: "identity-voice", selector: "textarea" },
      {
        hash: "#identity-knowledge",
        id: "identity-knowledge",
        selector: "textarea",
      },
      { hash: "#identity-website", id: "identity-website", selector: "input" },
    ] as const;

    for (const field of fields) {
      const mounted = mountNavigation("http://localhost/identity");
      try {
        assert.equal(expanded(mounted.container, "identity-teach"), "false");
        assert.equal(
          expanded(mounted.container, "identity-website-knowledge"),
          "false",
        );
        assert.equal(mounted.container.querySelector(`#${field.id}`), null);

        await revealHash(field.hash);

        assert.equal(expanded(mounted.container, "identity-teach"), "true");
        assert.equal(
          expanded(mounted.container, "identity-website-knowledge"),
          "false",
        );
        const target = mounted.container.querySelector(`#${field.id}`);
        assert.ok(target);
        const control = target.querySelector(field.selector);
        assert.ok(control);
        assert.equal(globalThis.document.activeElement, control);
        assert.equal(mounted.focusCalls.at(-1)?.element, control);
        assert.equal(mounted.focusCalls.at(-1)?.preventScroll, true);
        assert.equal(mounted.scrollCalls.at(-1)?.id, field.id);
        assert.equal(mounted.scrollCalls.at(-1)?.block, "start");
        assert.equal(globalThis.window.location.hash, field.hash);
        assert.equal(mounted.fetches.length, 0);
        assert.equal(mounted.actionCalls, 0);
      } finally {
        mounted.restore();
      }
    }
  });

  it("opens Teach Athena from a field hash that is already in the URL", async () => {
    const mounted = mountNavigation(
      "http://localhost/identity#identity-knowledge",
    );
    try {
      await flushReveal();
      assert.equal(expanded(mounted.container, "identity-teach"), "true");
      assert.equal(
        expanded(mounted.container, "identity-website-knowledge"),
        "false",
      );
      const control = mounted.container.querySelector(
        "#identity-knowledge textarea",
      );
      assert.equal(globalThis.document.activeElement, control);
      assert.equal(mounted.focusCalls.at(-1)?.preventScroll, true);
      assert.equal(mounted.fetches.length, 0);
    } finally {
      mounted.restore();
    }
  });

  it("repeats same-hash clicks from separate recommendation cards", async () => {
    const mounted = mountNavigation("http://localhost/identity", {
      includeGaps: true,
    });
    try {
      const gapsToggle = [...mounted.container.querySelectorAll("button")].find(
        (button) => button.textContent?.includes(en.identity.page.gapsTitle),
      );
      assert.ok(gapsToggle);
      await act(async () => {
        gapsToggle.click();
      });
      await flushReveal();

      const links = [
        ...mounted.container.querySelectorAll("a[href='#identity-voice']"),
      ].filter((anchor) =>
        anchor.textContent?.includes(en.identity.page.gapsGoToField),
      );
      assert.equal(links.length, 2);

      let prevented = 0;
      const events: string[] = [];
      globalThis.window.addEventListener("hashchange", () => {
        events.push(globalThis.window.location.hash);
      });

      const before = mounted.focusCalls.length;
      await act(async () => {
        links[0]?.dispatchEvent(
          new globalThis.window.MouseEvent("click", {
            bubbles: true,
            cancelable: true,
          }),
        );
      });
      await flushReveal();
      assert.equal(globalThis.window.location.hash, "#identity-voice");
      assert.equal(expanded(mounted.container, "identity-teach"), "true");
      const voice = mounted.container.querySelector("#identity-voice textarea");
      assert.equal(globalThis.document.activeElement, voice);
      assert.ok(mounted.focusCalls.length > before);
      assert.equal(mounted.focusCalls.at(-1)?.preventScroll, true);
      assert.equal(mounted.scrollCalls.at(-1)?.id, "identity-voice");

      const afterFirst = mounted.focusCalls.length;
      const eventsAfterFirst = events.length;
      await act(async () => {
        handleIdentityFieldDeepLinkClick(
          {
            preventDefault() {
              prevented += 1;
            },
          },
          "#identity-voice",
        );
        links[1]?.dispatchEvent(
          new globalThis.window.MouseEvent("click", {
            bubbles: true,
            cancelable: true,
          }),
        );
      });
      await flushReveal();

      assert.equal(prevented, 1);
      assert.equal(globalThis.window.location.hash, "#identity-voice");
      assert.ok(events.length > eventsAfterFirst);
      assert.ok(mounted.focusCalls.length > afterFirst);
      assert.equal(globalThis.document.activeElement, voice);
      assert.equal(mounted.focusCalls.at(-1)?.element, voice);
      assert.equal(mounted.focusCalls.at(-1)?.preventScroll, true);
      assert.equal(
        expanded(mounted.container, "identity-website-knowledge"),
        "false",
      );
      assert.equal(mounted.fetches.length, 0);
      assert.equal(mounted.actionCalls, 0);
    } finally {
      mounted.restore();
    }
  });

  it("dispatches hashchange for an unchanged field hash and ignores other pages", () => {
    const { restore } = mountWindow("http://localhost/identity#identity-knowledge");
    try {
      let events = 0;
      let prevented = false;
      globalThis.window.addEventListener("hashchange", () => {
        events += 1;
      });
      handleIdentityFieldDeepLinkClick(
        {
          preventDefault() {
            prevented = true;
          },
        },
        "#identity-knowledge",
      );
      assert.equal(prevented, true);
      assert.equal(events, 1);
      assert.equal(globalThis.window.location.hash, "#identity-knowledge");
    } finally {
      restore();
    }

    const offPage = mountWindow("http://localhost/seo");
    try {
      let prevented = false;
      handleIdentityFieldDeepLinkClick(
        {
          preventDefault() {
            prevented = true;
          },
        },
        "#identity-voice",
      );
      assert.equal(prevented, false);
      assert.equal(globalThis.window.location.pathname, "/seo");
      assert.equal(globalThis.window.location.hash, "");
    } finally {
      offPage.restore();
    }
  });

  it("opens Website Knowledge from its hash and leaves unknown hashes closed", async () => {
    const unknown = mountNavigation("http://localhost/identity");
    try {
      await revealHash("#identity-other");
      assert.equal(expanded(unknown.container, "identity-teach"), "false");
      assert.equal(
        expanded(unknown.container, "identity-website-knowledge"),
        "false",
      );
      assert.equal(unknown.focusCalls.length, 0);

      await revealHash("#identity-voice");
      assert.equal(expanded(unknown.container, "identity-teach"), "true");
      assert.equal(
        expanded(unknown.container, "identity-website-knowledge"),
        "false",
      );
    } finally {
      unknown.restore();
    }

    const website = mountNavigation("http://localhost/identity");
    try {
      await revealHash("#identity-website-knowledge");
      assert.equal(expanded(website.container, "identity-teach"), "false");
      assert.equal(
        expanded(website.container, "identity-website-knowledge"),
        "true",
      );
      const trigger = website.container.querySelector(
        "#identity-website-knowledge button[aria-expanded]",
      );
      assert.ok(trigger);
      assert.equal(globalThis.document.activeElement, trigger);
      assert.equal(website.focusCalls.at(-1)?.element, trigger);
      assert.equal(website.focusCalls.at(-1)?.preventScroll, true);
      assert.equal(website.scrollCalls.at(-1)?.id, "identity-website-knowledge");
      assert.equal(website.scrollCalls.at(-1)?.block, "start");

      const afterFirst = website.focusCalls.length;
      await revealHash("#identity-website-knowledge");
      assert.ok(website.focusCalls.length > afterFirst);
      assert.equal(website.focusCalls.at(-1)?.preventScroll, true);
      assert.equal(globalThis.document.activeElement, trigger);
      assert.equal(expanded(website.container, "identity-teach"), "false");
      assert.equal(website.fetches.length, 0);
      assert.equal(website.actionCalls, 0);
    } finally {
      website.restore();
    }
  });

  it("scrolls read-only generation-locked fields without focusing them", async () => {
    const mounted = mountNavigation("http://localhost/identity", {
      generationLocked: true,
    });
    try {
      assert.equal(mounted.container.querySelector("#identity-voice"), null);
      for (const id of [
        "identity-voice",
        "identity-knowledge",
        "identity-website",
      ]) {
        await revealHash(`#${id}`);
        assert.equal(expanded(mounted.container, "identity-teach"), "true");
        const target = mounted.container.querySelector(`#${id}`);
        assert.ok(target);
        assert.equal(target.querySelector("textarea, input"), null);
        assert.equal(mounted.scrollCalls.at(-1)?.id, id);
        assert.equal(
          expanded(mounted.container, "identity-website-knowledge"),
          "false",
        );
      }
      assert.equal(mounted.focusCalls.length, 0);
      assert.equal(globalThis.document.activeElement, globalThis.document.body);
      assert.equal(mounted.fetches.length, 0);
      assert.equal(mounted.actionCalls, 0);
    } finally {
      mounted.restore();
    }
  });

  it("scrolls a read-only control and an absent field without forcing focus", async () => {
    const readOnly = mountNode(
      "http://localhost/identity",
      createElement(
        IdentityTeachAthenaDisclosure,
        { title: "Teach Athena", defaultOpen: false },
        createElement(
          "label",
          { id: "identity-voice" },
          createElement("textarea", {
            name: "about_you",
            readOnly: true,
            defaultValue: "Locked voice",
          }),
        ),
      ),
    );
    try {
      await revealHash("#identity-voice");
      assert.equal(expanded(readOnly.container, "identity-teach"), "true");
      assert.equal(readOnly.scrollCalls.at(-1)?.id, "identity-voice");
      assert.equal(readOnly.focusCalls.length, 0);
      assert.notEqual(
        globalThis.document.activeElement,
        readOnly.container.querySelector("textarea"),
      );
      assert.equal(readOnly.fetches.length, 0);
    } finally {
      readOnly.restore();
    }

    const absent = mountDisclosure("http://localhost/identity");
    try {
      await revealHash("#identity-knowledge");
      assert.equal(expanded(absent.container, "identity-teach"), "true");
      assert.match(absent.container.textContent ?? "", /workflow body/);
      assert.equal(absent.container.querySelector("#identity-knowledge"), null);
      assert.equal(absent.scrollCalls.at(-1)?.id, "identity-teach");
      assert.equal(absent.focusCalls.length, 0);
      assert.equal(absent.fetches.length, 0);
    } finally {
      absent.restore();
    }
  });
});

function flushReveal(): Promise<void> {
  return act(async () => {
    await new Promise<void>((resolve) => {
      setTimeout(resolve, 0);
    });
  });
}

function mountDisclosure(url: string) {
  return mountNode(
    url,
    createElement(
      IdentityTeachAthenaDisclosure,
      {
        title: "Teach Athena",
        summary: "Help Athena understand the business.",
        defaultOpen: false,
      },
      createElement("p", null, "workflow body"),
    ),
  );
}

function fieldIdentity(): AthenaIdentity {
  return {
    id: "id-1",
    user_id: "user-1",
    organization_id: "org-1",
    greeting_name: "Laurent",
    about_you: "A steady voice",
    expertise: "Business knowledge",
    website: "https://example.com",
    brain_status: "ready",
    brain_last_updated: "2026-08-31T12:00:00.000Z",
    master_profile: null,
    master_profile_version: null,
    master_profile_generated_at: null,
    created_at: "2026-08-01T00:00:00.000Z",
    updated_at: "2026-08-31T12:00:00.000Z",
  };
}

function expanded(container: HTMLElement, id: string): string | null {
  return (
    container
      .querySelector(`#${id} button[aria-expanded]`)
      ?.getAttribute("aria-expanded") ?? null
  );
}

async function revealHash(hash: string): Promise<void> {
  await act(async () => {
    activateIdentityLocationHash(hash);
  });
  await flushReveal();
}

function mountNavigation(
  url: string,
  options: { generationLocked?: boolean; includeGaps?: boolean } = {},
) {
  const actions = { count: 0 };
  const children = [
    createElement(IdentityTeachAthenaSection, {
      identity: fieldIdentity(),
      messages: en.identity,
      action: async () => {
        actions.count += 1;
      },
      trainLabel: "Train Athena",
      pendingLabel: "Training Athena...",
      generationLocked: options.generationLocked ?? false,
    }),
    createElement(IdentityWebsiteKnowledge, {
      identity: fieldIdentity(),
      messages: en.identity,
      language: "en",
      trained: true,
      deepScrape: null,
    }),
  ];
  if (options.includeGaps) {
    children.push(
      createElement(IdentityCalibrationGaps, {
        gaps: [
          {
            what_is_unclear: "Offer priority",
            why_it_matters: "Downstream assets may drift",
            update_location: "Your Voice",
          },
          {
            what_is_unclear: "Tone",
            why_it_matters: "Copy may drift",
            update_location: "Your Voice",
          },
        ],
        messages: en.identity,
      }),
    );
  }
  const mounted = mountNode(url, createElement("div", null, ...children));
  return {
    ...mounted,
    get actionCalls() {
      return actions.count;
    },
  };
}

function mountNode(url: string, node: ReturnType<typeof createElement>) {
  const windowMount = mountWindow(url);
  const fetches: string[] = [];
  const originalFetch = globalThis.fetch;
  globalThis.fetch = (async (input) => {
    fetches.push(String(input));
    return new Response("{}", { status: 200 });
  }) as typeof fetch;
  const root = createRoot(windowMount.container);
  act(() => {
    root.render(node);
  });
  return {
    container: windowMount.container,
    fetches,
    scrollCalls: windowMount.scrollCalls,
    focusCalls: windowMount.focusCalls,
    restore() {
      act(() => {
        root.unmount();
      });
      globalThis.fetch = originalFetch;
      windowMount.restore();
    },
  };
}

function mountWindow(url: string): {
  container: HTMLElement;
  scrollCalls: Array<{ id: string; block?: string }>;
  focusCalls: Array<{ element: HTMLElement; preventScroll: boolean }>;
  restore: () => void;
} {
  const previous = {
    window: globalThis.window,
    document: globalThis.document,
    navigator: globalThis.navigator,
    HTMLElement: globalThis.HTMLElement,
    Node: globalThis.Node,
    MutationObserver: globalThis.MutationObserver,
    getComputedStyle: globalThis.getComputedStyle,
    HashChangeEvent: (globalThis as { HashChangeEvent?: typeof HashChangeEvent })
      .HashChangeEvent,
  };
  const dom = new JSDOM(
    "<!doctype html><html><body><div id='teach-athena-deep-link-root'></div></body></html>",
    { url, pretendToBeVisual: true },
  );
  const { window } = dom;
  const scrollCalls: Array<{ id: string; block?: string }> = [];
  const focusCalls: Array<{ element: HTMLElement; preventScroll: boolean }> =
    [];
  const ieEvents = window.HTMLElement.prototype as HTMLElement & {
    attachEvent?: () => void;
    detachEvent?: () => void;
  };
  ieEvents.attachEvent = function attachEvent() {};
  ieEvents.detachEvent = function detachEvent() {};
  const originalFocus = window.HTMLElement.prototype.focus;
  window.HTMLElement.prototype.scrollIntoView = function scrollIntoView(
    this: HTMLElement,
    options?: boolean | ScrollIntoViewOptions,
  ) {
    scrollCalls.push({
      id: this.id,
      block: typeof options === "object" && options ? options.block : undefined,
    });
  };
  window.HTMLElement.prototype.focus = function focus(
    this: HTMLElement,
    options?: FocusOptions,
  ) {
    focusCalls.push({
      element: this,
      preventScroll: options?.preventScroll === true,
    });
    return originalFocus.call(this, options);
  };
  Object.defineProperty(globalThis, "window", {
    configurable: true,
    writable: true,
    value: window,
  });
  Object.defineProperty(globalThis, "document", {
    configurable: true,
    writable: true,
    value: window.document,
  });
  Object.defineProperty(globalThis, "navigator", {
    configurable: true,
    writable: true,
    value: window.navigator,
  });
  globalThis.HTMLElement = window.HTMLElement;
  globalThis.Node = window.Node;
  globalThis.MutationObserver = window.MutationObserver;
  globalThis.getComputedStyle = window.getComputedStyle.bind(window);
  (globalThis as { HashChangeEvent?: typeof window.HashChangeEvent }).HashChangeEvent =
    window.HashChangeEvent;
  (globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT =
    true;

  return {
    container: window.document.getElementById("teach-athena-deep-link-root")!,
    scrollCalls,
    focusCalls,
    restore() {
      Object.defineProperty(globalThis, "window", {
        configurable: true,
        writable: true,
        value: previous.window,
      });
      Object.defineProperty(globalThis, "document", {
        configurable: true,
        writable: true,
        value: previous.document,
      });
      Object.defineProperty(globalThis, "navigator", {
        configurable: true,
        writable: true,
        value: previous.navigator,
      });
      globalThis.HTMLElement = previous.HTMLElement;
      globalThis.Node = previous.Node;
      globalThis.MutationObserver = previous.MutationObserver;
      globalThis.getComputedStyle = previous.getComputedStyle;
      (globalThis as { HashChangeEvent?: typeof HashChangeEvent }).HashChangeEvent =
        previous.HashChangeEvent;
    },
  };
}
