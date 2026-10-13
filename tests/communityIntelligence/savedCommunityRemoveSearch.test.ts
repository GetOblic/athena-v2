/**
 * COMM-SAVED-UX-1 — remove from Saved and client-side saved search.
 * Renders the Saved tab. Does not call a provider or a database.
 */
import "./savedCommunityNotesTestDom";

import assert from "node:assert/strict";
import { createElement, act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { describe, it } from "node:test";
import { CommunityIntelligenceWorkspace } from "../../components/communityIntelligence/CommunityIntelligenceWorkspace";
import {
  requestRemoveSavedCommunity,
  savedCommunityMatchesSearch,
  type SavedCommunityCard,
} from "../../lib/communityIntelligence/communityDiscoveryClient";
import { en } from "../../lib/tenantI18n/messages/en";

const copy = en.communityIntelligence;
const GROUP_A = "https://www.facebook.com/groups/123456789012345";
const GROUP_B = "https://www.facebook.com/groups/223456789012345";

function card(
  overrides: Partial<SavedCommunityCard> & Pick<SavedCommunityCard, "id" | "canonicalUrl">,
): SavedCommunityCard {
  return {
    displayName: "Independent Retailers",
    qualification: "relevant",
    notes: "keep this note",
    ...overrides,
  };
}

const SAVED_A = card({
  id: "save-a",
  canonicalUrl: GROUP_A,
  displayName: "Independent Retailers",
});
const SAVED_B = card({
  id: "save-b",
  canonicalUrl: GROUP_B,
  displayName: "Shop Owners",
  notes: "other note",
});

function commitValue(element: HTMLInputElement | HTMLTextAreaElement, value: string) {
  const proto =
    element.tagName === "TEXTAREA"
      ? window.HTMLTextAreaElement.prototype
      : window.HTMLInputElement.prototype;
  const setter = Object.getOwnPropertyDescriptor(proto, "value")?.set;
  assert.ok(setter);
  const previous = element.value;
  setter.call(element, value);
  const tracker = (
    element as HTMLInputElement & { _valueTracker?: { setValue: (next: string) => void } }
  )._valueTracker;
  tracker?.setValue(previous);
  act(() => {
    element.dispatchEvent(new window.Event("input", { bubbles: true }));
  });
}

async function settle() {
  await act(async () => {
    await new Promise<void>((resolve) => {
      setTimeout(resolve, 0);
    });
  });
}

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}

function notesField(container: ParentNode, id: string): HTMLTextAreaElement {
  const element = container.querySelector(`textarea[data-saved-notes="${id}"]`);
  assert.ok(element, id);
  return element as HTMLTextAreaElement;
}

function savedArticle(container: ParentNode, id: string): HTMLElement {
  const element = container.querySelector(`[data-saved-community="${id}"]`);
  assert.ok(element, id);
  return element as HTMLElement;
}

describe("saved community search matching", () => {
  it("matches name or URL after trim, ignoring case and notes", () => {
    assert.equal(savedCommunityMatchesSearch(SAVED_A, ""), true);
    assert.equal(savedCommunityMatchesSearch(SAVED_A, "   "), true);
    assert.equal(savedCommunityMatchesSearch(SAVED_A, "  RETAILERS "), true);
    assert.equal(savedCommunityMatchesSearch(SAVED_A, "groups/123456789012345"), true);
    assert.equal(savedCommunityMatchesSearch(SAVED_A, "HTTPS://WWW.FACEBOOK.COM/GROUPS/123"), true);
    assert.equal(savedCommunityMatchesSearch(SAVED_A, "shop owners"), false);
    assert.equal(savedCommunityMatchesSearch(SAVED_A, "keep this note"), false);
    assert.equal(savedCommunityMatchesSearch(SAVED_B, "Shop"), true);
    assert.equal(savedCommunityMatchesSearch(SAVED_B, GROUP_B.toUpperCase()), true);
  });
});

describe("saved community remove and search", () => {
  it("filters mounted cards, keeps a notes draft, and does not request on each keystroke", async () => {
    const original = globalThis.fetch;
    const calls: string[] = [];
    globalThis.fetch = (async (input: RequestInfo | URL) => {
      calls.push(`${String(input)}`);
      return jsonResponse({
        ok: true,
        saves: [
          { platform: "facebook_groups", ...SAVED_A },
          { platform: "facebook_groups", ...SAVED_B },
        ],
      });
    }) as typeof fetch;

    const container = document.getElementById("saved-community-notes-root");
    assert.ok(container);
    container.replaceChildren();
    const root: Root = createRoot(container);
    try {
      await act(async () => {
        root.render(createElement(CommunityIntelligenceWorkspace, { messages: en }));
      });
      await settle();
      const savedTab = [...container.querySelectorAll('[role="tab"]')].find(
        (node) => node.textContent === copy.viewSaved,
      );
      assert.ok(savedTab);
      await act(async () => {
        (savedTab as HTMLButtonElement).click();
      });
      await settle();
      const callsBeforeSearch = calls.length;
      commitValue(notesField(container, "save-a"), "draft that must stay");
      const search = container.querySelector<HTMLInputElement>("#saved-community-search");
      assert.ok(search);
      commitValue(search, "  SHOP ");
      await settle();
      assert.equal(savedArticle(container, "save-a").hidden, true);
      assert.equal(savedArticle(container, "save-b").hidden, false);
      assert.equal(notesField(container, "save-a").value, "draft that must stay");
      assert.equal((container.textContent ?? "").includes(copy.savedSearchEmptyTitle), false);
      assert.equal((container.textContent ?? "").includes(copy.savedEmptyTitle), false);
      assert.equal(calls.length, callsBeforeSearch);

      commitValue(search, "zzzz-no-match");
      await settle();
      assert.equal(savedArticle(container, "save-a").hidden, true);
      assert.equal(savedArticle(container, "save-b").hidden, true);
      assert.equal(
        (container.textContent ?? "").includes(copy.savedSearchEmptyTitle),
        true,
      );
      assert.equal((container.textContent ?? "").includes(copy.savedEmptyTitle), false);
      assert.equal(notesField(container, "save-a").value, "draft that must stay");

      commitValue(search, "   ");
      await settle();
      assert.equal(savedArticle(container, "save-a").hidden, false);
      assert.equal(savedArticle(container, "save-b").hidden, false);
      assert.equal(notesField(container, "save-a").value, "draft that must stay");
      assert.equal((container.textContent ?? "").includes(copy.savedSearchEmptyTitle), false);
      assert.equal(calls.length, callsBeforeSearch);
    } finally {
      await act(async () => {
        root.unmount();
      });
      container.replaceChildren();
      globalThis.fetch = original;
    }
  });

  it("shows the empty Saved list without the no-match message", async () => {
    const original = globalThis.fetch;
    globalThis.fetch = (async () => jsonResponse({ ok: true, saves: [] })) as typeof fetch;
    const container = document.getElementById("saved-community-notes-root");
    assert.ok(container);
    container.replaceChildren();
    const root = createRoot(container);
    try {
      await act(async () => {
        root.render(createElement(CommunityIntelligenceWorkspace, { messages: en }));
      });
      await settle();
      const savedTab = [...container.querySelectorAll('[role="tab"]')].find(
        (node) => node.textContent === copy.viewSaved,
      );
      assert.ok(savedTab);
      await act(async () => {
        (savedTab as HTMLButtonElement).click();
      });
      await settle();
      assert.equal((container.textContent ?? "").includes(copy.savedEmptyTitle), true);
      assert.equal((container.textContent ?? "").includes(copy.savedSearchEmptyTitle), false);
      assert.equal(container.querySelector("#saved-community-search"), null);
    } finally {
      await act(async () => {
        root.unmount();
      });
      container.replaceChildren();
      globalThis.fetch = original;
    }
  });

  it("removes only the chosen card, and a failed remove keeps it with an error", async () => {
    const original = globalThis.fetch;
    const deletes: Array<{ url: string; method: string; body: string | undefined }> = [];
    let failRemove = false;
    globalThis.fetch = (async (input: RequestInfo | URL, init?: RequestInit) => {
      const url = String(input);
      if (init?.method === "DELETE") {
        deletes.push({
          url,
          method: init.method,
          body: typeof init.body === "string" ? init.body : undefined,
        });
        if (failRemove) {
          return jsonResponse(
            {
              ok: false,
              error: { code: "REMOVE_FAILED", message: "hidden detail org-b private" },
            },
            500,
          );
        }
        return jsonResponse({ ok: true });
      }
      return jsonResponse({
        ok: true,
        saves: [
          { platform: "facebook_groups", ...SAVED_A },
          { platform: "facebook_groups", ...SAVED_B },
        ],
      });
    }) as typeof fetch;

    const container = document.getElementById("saved-community-notes-root");
    assert.ok(container);
    container.replaceChildren();
    const root = createRoot(container);
    try {
      await act(async () => {
        root.render(createElement(CommunityIntelligenceWorkspace, { messages: en }));
      });
      await settle();
      const savedTab = [...container.querySelectorAll('[role="tab"]')].find(
        (node) => node.textContent === copy.viewSaved,
      );
      assert.ok(savedTab);
      await act(async () => {
        (savedTab as HTMLButtonElement).click();
      });
      await settle();
      commitValue(notesField(container, "save-b"), "draft on the other card");
      failRemove = true;
      const removeA = container.querySelector<HTMLButtonElement>(
        'button[data-saved-remove="save-a"]',
      );
      assert.ok(removeA);
      assert.equal(container.querySelector("[role='dialog']"), null);
      await act(async () => {
        removeA.click();
      });
      await settle();
      assert.equal(deletes.length, 1);
      assert.equal(deletes[0]?.method, "DELETE");
      assert.equal(deletes[0]?.url, "/api/community-discovery/saves/save-a");
      assert.equal(deletes[0]?.body, undefined);
      assert.equal(JSON.stringify(deletes).includes("organizationId"), false);
      assert.equal(savedArticle(container, "save-a").hidden, false);
      assert.equal(
        (container.textContent ?? "").includes(copy.errors.removeFailed),
        true,
      );
      assert.equal((container.textContent ?? "").includes("org-b private"), false);
      assert.equal(notesField(container, "save-b").value, "draft on the other card");

      failRemove = false;
      await act(async () => {
        removeA.click();
      });
      await settle();
      assert.equal(container.querySelector('[data-saved-community="save-a"]'), null);
      assert.equal(savedArticle(container, "save-b").hidden, false);
      assert.equal(notesField(container, "save-b").value, "draft on the other card");
      assert.equal(container.querySelectorAll('a[href="' + GROUP_B + '"]').length, 1);
    } finally {
      await act(async () => {
        root.unmount();
      });
      container.replaceChildren();
      globalThis.fetch = original;
    }
  });

  it("does not restore a card when a notes response arrives after removal", async () => {
    const original = globalThis.fetch;
    let releaseNotes: ((response: Response) => void) | null = null;
    globalThis.fetch = (async (input: RequestInfo | URL, init?: RequestInit) => {
      const url = String(input);
      if (init?.method === "DELETE") return jsonResponse({ ok: true });
      if (url.endsWith("/saves") && init?.method === "POST") {
        return new Promise<Response>((resolve) => {
          releaseNotes = resolve;
        });
      }
      return jsonResponse({
        ok: true,
        saves: [
          { platform: "facebook_groups", ...SAVED_A },
          { platform: "facebook_groups", ...SAVED_B },
        ],
      });
    }) as typeof fetch;

    const container = document.getElementById("saved-community-notes-root");
    assert.ok(container);
    container.replaceChildren();
    const root = createRoot(container);
    try {
      await act(async () => {
        root.render(createElement(CommunityIntelligenceWorkspace, { messages: en }));
      });
      await settle();
      const savedTab = [...container.querySelectorAll('[role="tab"]')].find(
        (node) => node.textContent === copy.viewSaved,
      );
      assert.ok(savedTab);
      await act(async () => {
        (savedTab as HTMLButtonElement).click();
      });
      await settle();
      const notesButton = container.querySelector<HTMLButtonElement>(
        'button[data-saved-notes-action="save-a"]',
      );
      const removeA = container.querySelector<HTMLButtonElement>(
        'button[data-saved-remove="save-a"]',
      );
      assert.ok(notesButton);
      assert.ok(removeA);
      await act(async () => {
        notesButton.click();
      });
      await act(async () => {
        removeA.click();
      });
      await settle();
      assert.equal(container.querySelector('[data-saved-community="save-a"]'), null);
      assert.ok(releaseNotes);
      await act(async () => {
        releaseNotes?.({
          ok: true,
          json: async () => ({
            ok: true,
            save: {
              platform: "facebook_groups",
              ...SAVED_A,
              notes: "late note",
            },
          }),
        } as Response);
      });
      await settle();
      assert.equal(container.querySelector('[data-saved-community="save-a"]'), null);
      assert.ok(container.querySelector('[data-saved-community="save-b"]'));
    } finally {
      await act(async () => {
        root.unmount();
      });
      container.replaceChildren();
      globalThis.fetch = original;
    }
  });

  it("sends a session-scoped delete without an organization id", async () => {
    const original = globalThis.fetch;
    const calls: Array<{ url: string; method: string | undefined; body: string | undefined }> = [];
    globalThis.fetch = (async (input: RequestInfo | URL, init?: RequestInit) => {
      calls.push({
        url: String(input),
        method: init?.method,
        body: typeof init.body === "string" ? init.body : undefined,
      });
      return jsonResponse({ ok: true });
    }) as typeof fetch;
    try {
      const removed = await requestRemoveSavedCommunity(
        "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa",
      );
      assert.equal(removed.ok, true);
      assert.equal(calls[0]?.method, "DELETE");
      assert.equal(
        calls[0]?.url,
        "/api/community-discovery/saves/aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa",
      );
      assert.equal(calls[0]?.body, undefined);
      assert.equal(JSON.stringify(calls).includes("organizationId"), false);
    } finally {
      globalThis.fetch = original;
    }
  });
});
