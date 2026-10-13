/**
 * FUNNEL-LINKS-1 — Prospect Detail short-link hydration.
 * Server markup keeps the canonical URLs. Ensure runs after mount.
 */

import assert from "node:assert/strict";
import { createElement, act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, it } from "node:test";
import { JSDOM } from "jsdom";
import { ProspectFunnelShortLinks } from "../../components/prospects/ProspectFunnelShortLinks";

const LONG_AI =
  "https://claim.getoblic.com/business-portfolio-ai-agent-page?author_id=42&contact_id=9001&business_name=Acme";
const LONG_PHONE =
  "https://claim.getoblic.com/business-portfolio-virtual-line-page?author_id=42&contact_id=9001&business_name=Acme";
const LONG_CALENDAR =
  "https://claim.getoblic.com/business-portfolio-booking-page?author_id=42&contact_id=9001&business_name=Acme";
const LONG_CLAIM =
  "https://claim.getoblic.com/business-created-page?author_id=42&contact_id=946970&business_name=Acme";
const CALL = "tel:+33162045206,946970#";
const SHORT_AI = "https://link.getoblic.com/pf_ai_agents_slug";
const SHORT_PHONE = "https://link.getoblic.com/pf_virtual_phone_slug";
const SHORT_CALENDAR = "https://link.getoblic.com/pf_calendar_slug";
const SHORT_CLAIM = "https://link.getoblic.com/pf_claim_slug";
const NEXT_AI =
  "https://claim.getoblic.com/business-portfolio-agent-ia?author_id=42&contact_id=9001&business_name=Acme";
const NEXT_SHORT_AI = "https://link.getoblic.com/pf_ai_agents_next";

function ensureDom(): HTMLElement {
  const dom = new JSDOM("<!doctype html><html><body><div id='root'></div></body></html>", {
    url: "http://localhost/prospects/prospect-1",
    pretendToBeVisual: true,
  });
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
  (globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
  return window.document.getElementById("root")!;
}

function props(aiAgentsHref: string) {
  return {
    prospectId: "prospect-1",
    aiAgentsHref,
    virtualPhoneHref: LONG_PHONE,
    calendarHref: LONG_CALENDAR,
    claimHref: LONG_CLAIM,
    callHref: CALL,
    aiAgentsLabel: "AI Agents",
    virtualPhoneLabel: "Virtual Phone",
    calendarLabel: "Calendar",
    callLabel: "Call your AI",
    claimLabel: "Claim your AI",
  };
}

function hrefs(container: HTMLElement): Record<string, string> {
  const found: Record<string, string> = {};
  for (const anchor of container.querySelectorAll("a")) {
    const action = anchor.getAttribute("data-prospect-header-action");
    if (action) found[action] = anchor.getAttribute("href") ?? "";
  }
  return found;
}

describe("Prospect Funnel short-link hydration", () => {
  it("does not call ensure while rendering the server markup", () => {
    let fetches = 0;
    const originalFetch = globalThis.fetch;
    globalThis.fetch = (() => {
      fetches += 1;
      throw new Error("server render must not ensure short links");
    }) as typeof fetch;
    try {
      const html = renderToStaticMarkup(
        createElement(ProspectFunnelShortLinks, props(LONG_AI)),
      );
      assert.equal(fetches, 0);
      assert.match(
        html,
        /business-portfolio-ai-agent-page\?author_id=42&amp;contact_id=9001&amp;business_name=Acme/,
      );
      assert.match(html, /href="tel:\+33162045206,946970#"/);
      assert.match(html, /target="_blank"/);
      assert.match(html, /rel="noopener noreferrer"/);
      assert.match(html, /AI Agents/);
      assert.match(html, /Call your AI/);
      assert.doesNotMatch(html, /link\.getoblic\.com/);
    } finally {
      globalThis.fetch = originalFetch;
    }
  });

  it("ensures once after mount, swaps the four HTTPS CTAs, and leaves Call on tel", async () => {
    const container = ensureDom();
    const root: Root = createRoot(container);
    const calls: Array<{ url: string; init?: RequestInit }> = [];
    const releases: Array<(response: Response) => void> = [];
    const originalFetch = globalThis.fetch;
    const storageWrites: string[] = [];
    const historyWrites: string[] = [];
    const browser = globalThis.window;
    const storage = browser.localStorage;
    const originalSetItem = storage.setItem.bind(storage);
    storage.setItem = ((key: string, value: string) => {
      storageWrites.push(key);
      originalSetItem(key, value);
    }) as typeof storage.setItem;
    const originalPushState = browser.history.pushState.bind(browser.history);
    browser.history.pushState = ((...args: Parameters<History["pushState"]>) => {
      historyWrites.push(String(args[2] ?? ""));
      return originalPushState(...args);
    }) as History["pushState"];
    globalThis.fetch = (async (input, init) => {
      calls.push({ url: String(input), init });
      return new Promise<Response>((resolve) => {
        releases.push(resolve);
      });
    }) as typeof fetch;

    const shortLinks = {
      ok: true,
      links: {
        ai_agents: SHORT_AI,
        virtual_phone: SHORT_PHONE,
        calendar: SHORT_CALENDAR,
        claim_your_ai: SHORT_CLAIM,
        call_your_ai: "https://link.getoblic.com/pf_call_must_be_ignored",
      },
    };

    try {
      await act(async () => {
        root.render(createElement(ProspectFunnelShortLinks, props(LONG_AI)));
      });
      assert.equal(calls.length, 1);
      assert.equal(calls[0]?.url, "/api/prospects/prospect-1/funnel-links");
      assert.equal(calls[0]?.init?.method, "POST");
      assert.equal(calls[0]?.init?.body, "{}");
      assert.equal(calls[0]?.init?.cache, "no-store");
      assert.equal(hrefs(container)["getoblic-funnel-ai-agents"], LONG_AI);
      assert.equal(hrefs(container)["getoblic-funnel-call-your-ai"], CALL);

      await act(async () => {
        root.render(createElement(ProspectFunnelShortLinks, props(LONG_AI)));
      });
      assert.equal(calls.length, 1);

      await act(async () => {
        releases[0]?.(
          new Response(JSON.stringify(shortLinks), {
            status: 200,
            headers: { "Content-Type": "application/json" },
          }),
        );
      });

      const current = hrefs(container);
      assert.equal(current["getoblic-funnel-ai-agents"], SHORT_AI);
      assert.equal(current["getoblic-funnel-virtual-phone"], SHORT_PHONE);
      assert.equal(current["getoblic-funnel-calendar"], SHORT_CALENDAR);
      assert.equal(current["getoblic-funnel-claim-your-ai"], SHORT_CLAIM);
      assert.equal(current["getoblic-funnel-call-your-ai"], CALL);
      assert.equal(
        container.querySelectorAll('a[target="_blank"]').length,
        4,
      );
      assert.equal(
        container.querySelectorAll('a[rel="noopener noreferrer"]').length,
        4,
      );
      const callAnchor = container.querySelector(
        '[data-prospect-header-action="getoblic-funnel-call-your-ai"]',
      );
      assert.equal(callAnchor?.getAttribute("target"), null);
      assert.match(container.textContent ?? "", /AI Agents/);
      assert.match(container.textContent ?? "", /Virtual Phone/);
      assert.match(container.textContent ?? "", /Calendar/);
      assert.match(container.textContent ?? "", /Claim your AI/);
      assert.match(container.textContent ?? "", /Call your AI/);
      assert.equal(storageWrites.length, 0);
      assert.equal(historyWrites.length, 0);

      await act(async () => {
        root.render(createElement(ProspectFunnelShortLinks, props(NEXT_AI)));
      });
      assert.equal(hrefs(container)["getoblic-funnel-ai-agents"], NEXT_AI);
      assert.notEqual(hrefs(container)["getoblic-funnel-ai-agents"], SHORT_AI);
      assert.equal(calls.length, 2);

      await act(async () => {
        releases[0]?.(
          new Response(
            JSON.stringify({
              ok: true,
              links: { ai_agents: SHORT_AI },
            }),
            { status: 200, headers: { "Content-Type": "application/json" } },
          ),
        );
        releases[1]?.(
          new Response(
            JSON.stringify({
              ok: true,
              links: {
                ai_agents: NEXT_SHORT_AI,
                virtual_phone: null,
                calendar: null,
                claim_your_ai: null,
              },
            }),
            { status: 200, headers: { "Content-Type": "application/json" } },
          ),
        );
      });
      assert.equal(hrefs(container)["getoblic-funnel-ai-agents"], NEXT_SHORT_AI);
      assert.equal(hrefs(container)["getoblic-funnel-virtual-phone"], LONG_PHONE);
      assert.equal(hrefs(container)["getoblic-funnel-call-your-ai"], CALL);
      assert.equal(storageWrites.length, 0);
      assert.equal(historyWrites.length, 0);
    } finally {
      storage.setItem = originalSetItem;
      browser.history.pushState = originalPushState;
      globalThis.fetch = originalFetch;
      await act(async () => {
        root.unmount();
      });
    }
  });

  it("keeps canonical URLs when ensure fails", async () => {
    const container = ensureDom();
    const root = createRoot(container);
    const originalFetch = globalThis.fetch;
    globalThis.fetch = (async () => {
      throw new Error("worker unavailable");
    }) as typeof fetch;
    try {
      await act(async () => {
        root.render(createElement(ProspectFunnelShortLinks, props(LONG_AI)));
      });
      await act(async () => {
        await Promise.resolve();
      });
      assert.equal(hrefs(container)["getoblic-funnel-ai-agents"], LONG_AI);
      assert.equal(hrefs(container)["getoblic-funnel-claim-your-ai"], LONG_CLAIM);
      assert.equal(hrefs(container)["getoblic-funnel-call-your-ai"], CALL);
    } finally {
      globalThis.fetch = originalFetch;
      await act(async () => {
        root.unmount();
      });
    }
  });
});
