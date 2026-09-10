/**
 * Prospect detail — GetOblic outbound Description / Knowledge Base CTAs.
 */

import assert from "node:assert/strict";
import { createElement, act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, it } from "node:test";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { JSDOM } from "jsdom";
import { GetOblicListingOutboundControls } from "../../components/prospects/GetOblicListingOutboundControls";
import { de } from "../../lib/tenantI18n/messages/de";
import { en } from "../../lib/tenantI18n/messages/en";
import { es } from "../../lib/tenantI18n/messages/es";
import { fr } from "../../lib/tenantI18n/messages/fr";
import { it as itMessages } from "../../lib/tenantI18n/messages/it";
import { pt } from "../../lib/tenantI18n/messages/pt";
import type { TenantMessages } from "../../lib/tenantI18n/types";
import { ORGANIZATION_LANGUAGES } from "../../services/organizationLanguage";
import {
  PROSPECT_UTILITY_CYAN_ACTION,
  PROSPECT_UTILITY_VIOLET_ACTION,
} from "../../lib/prospects/prospectDetailPresentation";

const ROOT = process.cwd();

function read(relativePath: string): string {
  return readFileSync(join(ROOT, relativePath), "utf8");
}

const DICTIONARIES: Record<string, TenantMessages> = {
  en,
  fr,
  es,
  it: itMessages,
  de,
  pt,
};

const I18N_KEYS = [
  "sendDescriptionToGetOblic",
  "sendKnowledgeBaseToGetOblic",
  "sendingToGetOblic",
  "sentToGetOblic",
  "sendDescriptionToGetOblicFailed",
  "sendKnowledgeBaseToGetOblicFailed",
  "sendDescriptionToGetOblicOverwrite",
  "sendKnowledgeBaseToGetOblicOverwrite",
  "sendDescriptionToGetOblicDisabled",
  "sendKnowledgeBaseToGetOblicDisabled",
] as const;

describe("GetOblic outbound controls placement", () => {
  it("clusters the two outbound actions beside Release and only when linked", () => {
    const page = read("app/prospects/[id]/page.tsx");
    const card = read("components/prospects/ProspectGetoblicDescriptionCard.tsx");
    assert.match(page, /GetOblicListingOutboundControls/);
    assert.match(page, /GetOblicListingReleaseControl/);
    assert.match(page, /relationship_status === "linked"/);
    assert.match(page, /hasGeneratedDescription/);
    assert.match(page, /hasCurrentKnowledgeBase/);
    assert.match(page, /hasCurrentKnowledgeBaseAsset/);
    assert.match(page, /generated_listing_description\?\.description/);
    assert.doesNotMatch(page, /Sync All|syncAll|sync-all/);
    assert.doesNotMatch(page, /wordpress_listing_id=\{/);
    assert.ok(
      page.indexOf("GetOblicListingOutboundControls") <
        page.indexOf("GetOblicListingReleaseControl"),
    );
    assert.equal(
      (page.match(/<GetOblicListingOutboundControls/g) ?? []).length,
      1,
    );
    assert.equal(
      (page.match(/<GetOblicListingReleaseControl/g) ?? []).length,
      1,
    );
    assert.match(page, /directoryAction=/);
    assert.doesNotMatch(page, /destructiveAction/);
    assert.doesNotMatch(page, /ProspectHeaderDeleteButton/);
    assert.doesNotMatch(card, /getoblic-directory\/description/);
    assert.doesNotMatch(card, /getoblic-directory\/knowledge-base/);
    assert.doesNotMatch(card, /Send Description to GetOblic/);
    assert.doesNotMatch(card, /Send Knowledge Base to GetOblic/);
    assert.doesNotMatch(card, /Apply to GetOblic|Publish|Sync/);
  });

  it("keeps Description write-back out of the Description card and refreshes after generate", () => {
    const card = read("components/prospects/ProspectGetoblicDescriptionCard.tsx");
    assert.match(card, /router\.refresh\(\)/);
    assert.match(card, /refreshPage\(\)/);
    assert.doesNotMatch(card, /getoblic-directory\/description/);
    assert.doesNotMatch(card, /Send Description to GetOblic/);
  });
});

describe("GetOblic outbound control UI", () => {
  it("renders both buttons with cyan and violet families when enabled", () => {
    const html = renderToStaticMarkup(
      createElement(GetOblicListingOutboundControls, {
        prospectId: "p1",
        hasGeneratedDescription: true,
        hasCurrentKnowledgeBase: true,
        messages: en,
      }),
    );
    assert.match(html, /Send Description to GetOblic/);
    assert.match(html, /Send Knowledge Base to GetOblic/);
    assert.match(html, /data-prospect-detail="getoblic-outbound"/);
    assert.match(html, /lucide-file-text/);
    assert.match(html, /lucide-book-open/);
    assert.match(
      html,
      new RegExp(escapeRegExp(PROSPECT_UTILITY_CYAN_ACTION)),
    );
    assert.match(
      html,
      new RegExp(escapeRegExp(PROSPECT_UTILITY_VIOLET_ACTION)),
    );
    assert.doesNotMatch(html, /Sync All|sync all/i);
    assert.doesNotMatch(html, /wordpress_listing_id/);
  });

  it("disables Description without generated copy and KB without a current asset", () => {
    const html = renderToStaticMarkup(
      createElement(GetOblicListingOutboundControls, {
        prospectId: "p1",
        hasGeneratedDescription: false,
        hasCurrentKnowledgeBase: false,
        messages: en,
      }),
    );
    assert.match(html, /disabled=""/);
    assert.match(html, /Generate a GetOblic description first/);
    assert.match(html, /Current Executive Version has no Knowledge Base asset/);
    const buttons = html.match(/<button\b[^>]*>/g) ?? [];
    assert.equal(buttons.length, 2);
    assert.equal(buttons.filter((button) => button.includes("disabled")).length, 2);
  });

  it("keeps required outbound strings in all six locales", () => {
    for (const language of ORGANIZATION_LANGUAGES) {
      const block = DICTIONARIES[language].prospects.detail;
      for (const key of I18N_KEYS) {
        assert.equal(typeof block[key], "string", `${language}.${key}`);
        assert.ok(block[key].trim(), `${language}.${key} empty`);
      }
      assert.match(block.sendDescriptionToGetOblic, /GetOblic/);
      assert.match(block.sendKnowledgeBaseToGetOblic, /GetOblic/);
    }
    assert.equal(
      en.prospects.detail.sendDescriptionToGetOblic,
      "Send Description to GetOblic",
    );
    assert.equal(
      en.prospects.detail.sendKnowledgeBaseToGetOblic,
      "Send Knowledge Base to GetOblic",
    );
    assert.equal(en.prospects.detail.sendingToGetOblic, "Sending…");
    assert.equal(en.prospects.detail.sentToGetOblic, "Sent successfully");
    for (const language of ORGANIZATION_LANGUAGES.filter((code) => code !== "en")) {
      assert.notEqual(
        DICTIONARIES[language].prospects.detail.sendDescriptionToGetOblic,
        en.prospects.detail.sendDescriptionToGetOblic,
        `${language}.sendDescriptionToGetOblic`,
      );
    }
  });

  it("uses independent pending and success states", async () => {
    const { root, container, restore } = mountOutboundControls({
      hasGeneratedDescription: true,
      hasCurrentKnowledgeBase: true,
    });
    let releaseDescription: ((value: Response) => void) | null = null;
    let releaseKnowledgeBase: ((value: Response) => void) | null = null;
    const originalFetch = globalThis.fetch;
    globalThis.fetch = (async (input) => {
      const url = String(input);
      if (url.includes("/description")) {
        return new Promise<Response>((resolve) => {
          releaseDescription = resolve;
        });
      }
      if (url.includes("/knowledge-base")) {
        return new Promise<Response>((resolve) => {
          releaseKnowledgeBase = resolve;
        });
      }
      throw new Error(`unexpected fetch ${url}`);
    }) as typeof fetch;

    try {
      const [descriptionButton, knowledgeBaseButton] = buttons(container);
      assert.ok(descriptionButton);
      assert.ok(knowledgeBaseButton);
      await act(async () => {
        descriptionButton.dispatchEvent(
          new globalThis.window.MouseEvent("click", { bubbles: true }),
        );
      });
      assert.match(container.textContent ?? "", /Sending…/);
      assert.match(container.textContent ?? "", /Send Knowledge Base to GetOblic/);
      assert.equal(knowledgeBaseButton.disabled, false);

      await act(async () => {
        knowledgeBaseButton.dispatchEvent(
          new globalThis.window.MouseEvent("click", { bubbles: true }),
        );
      });
      assert.equal(
        (container.textContent ?? "").match(/Sending…/g)?.length,
        2,
      );

      await act(async () => {
        releaseDescription?.(
          jsonResponse({ ok: true, success: true, description: { changed: true } }),
        );
      });
      assert.match(container.textContent ?? "", /Sent successfully/);
      assert.equal(
        (container.textContent ?? "").match(/Sending…/g)?.length,
        1,
      );

      await act(async () => {
        releaseKnowledgeBase?.(
          jsonResponse({ ok: true, success: true, knowledge_base: { outcome: "pushed" } }),
        );
      });
      assert.equal(
        (container.textContent ?? "").match(/Sent successfully/g)?.length,
        2,
      );
    } finally {
      globalThis.fetch = originalFetch;
      restore(root);
    }
  });

  it("POSTs only the prospect id in each outbound URL", async () => {
    const { root, container, restore } = mountOutboundControls({
      hasGeneratedDescription: true,
      hasCurrentKnowledgeBase: true,
    });
    const calls: Array<{ url: string; init?: RequestInit }> = [];
    const originalFetch = globalThis.fetch;
    globalThis.fetch = (async (input, init) => {
      calls.push({ url: String(input), init });
      return jsonResponse({ ok: true, success: true });
    }) as typeof fetch;

    try {
      const [descriptionButton, knowledgeBaseButton] = buttons(container);
      await act(async () => {
        descriptionButton.dispatchEvent(
          new globalThis.window.MouseEvent("click", { bubbles: true }),
        );
      });
      await act(async () => {
        knowledgeBaseButton.dispatchEvent(
          new globalThis.window.MouseEvent("click", { bubbles: true }),
        );
      });
      assert.equal(calls[0]?.url, "/api/prospects/p1/getoblic-directory/description");
      assert.equal(
        calls[1]?.url,
        "/api/prospects/p1/getoblic-directory/knowledge-base",
      );
      assert.equal(calls[0]?.init?.method, "POST");
      assert.equal(calls[1]?.init?.method, "POST");
      assert.equal(calls[0]?.init?.body, undefined);
      assert.equal(calls[1]?.init?.body, undefined);
    } finally {
      globalThis.fetch = originalFetch;
      restore(root);
    }
  });
});

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}

function ensureDom(): HTMLElement {
  if (globalThis.document?.getElementById("getoblic-outbound-test-root")) {
    return globalThis.document.getElementById("getoblic-outbound-test-root")!;
  }

  const dom = new JSDOM(
    "<!doctype html><html><body><div id='getoblic-outbound-test-root'></div></body></html>",
    { url: "http://localhost/", pretendToBeVisual: true },
  );
  const { window } = dom;
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
  (globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT =
    true;
  return window.document.getElementById("getoblic-outbound-test-root")!;
}

function mountOutboundControls(input: {
  hasGeneratedDescription: boolean;
  hasCurrentKnowledgeBase: boolean;
}): {
  root: Root;
  container: HTMLElement;
  restore: (root: Root) => void;
} {
  const container = ensureDom();
  container.replaceChildren();
  const root = createRoot(container);
  act(() => {
    root.render(
      createElement(GetOblicListingOutboundControls, {
        prospectId: "p1",
        hasGeneratedDescription: input.hasGeneratedDescription,
        hasCurrentKnowledgeBase: input.hasCurrentKnowledgeBase,
        messages: en,
      }),
    );
  });
  return {
    root,
    container,
    restore(mounted) {
      act(() => {
        mounted.unmount();
      });
      container.replaceChildren();
    },
  };
}

function buttons(container: HTMLElement): HTMLButtonElement[] {
  return [...container.querySelectorAll("button")];
}
