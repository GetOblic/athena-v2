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
import {
  IDENTITY_FIELD_ANCHORS,
  IDENTITY_TEACH_ATHENA_HREF,
  isIdentityTeachAthenaHash,
  isIdentityTeachAthenaHref,
} from "../../components/identity/identityPagePresentation";
import {
  activateIdentityTeachAthenaDeepLink,
  handleIdentityTeachAthenaDeepLinkClick,
  IdentityTeachAthenaDisclosure,
} from "../../components/identity/identityTeachAthenaDeepLink";
import { IdentityTeachAthenaSection } from "../../components/identity/IdentityTeachAthenaSection";
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
    const { container, restore, fetches } = mountDisclosure("http://localhost/identity");
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
});

function flushReveal(): Promise<void> {
  return act(async () => {
    await new Promise<void>((resolve) => {
      setTimeout(resolve, 0);
    });
  });
}

function mountDisclosure(url: string): {
  container: HTMLElement;
  fetches: string[];
  restore: () => void;
} {
  const { container, restore: restoreWindow } = mountWindow(url);
  const fetches: string[] = [];
  const originalFetch = globalThis.fetch;
  globalThis.fetch = (async (input) => {
    fetches.push(String(input));
    return new Response("{}", { status: 200 });
  }) as typeof fetch;

  const root = createRoot(container);
  act(() => {
    root.render(
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
  });

  return {
    container,
    fetches,
    restore() {
      act(() => {
        root.unmount();
      });
      globalThis.fetch = originalFetch;
      restoreWindow();
    },
  };
}

function mountWindow(url: string): {
  container: HTMLElement;
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
  window.HTMLElement.prototype.scrollIntoView = function scrollIntoView() {
    /* jsdom */
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
