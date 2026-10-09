/**
 * EST-EMAIL-1E — Suggested Email editor on the Licensee Estimate result.
 * UI behavior only. Does not apply SQL, call a model, or send email.
 */
import "./suggestedEmailTestDom";

import assert from "node:assert/strict";
import { createElement, act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, it } from "node:test";
import {
  EstimateSuggestedEmailSection,
  formatSuggestedEmailCopyAll,
  shouldRenderSuggestedEmailSection,
} from "../../components/licensee/estimate/EstimateSuggestedEmailSection";
import { de } from "../../lib/tenantI18n/messages/de";
import { en } from "../../lib/tenantI18n/messages/en";
import { es } from "../../lib/tenantI18n/messages/es";
import { fr } from "../../lib/tenantI18n/messages/fr";
import { it as itMessages } from "../../lib/tenantI18n/messages/it";
import { pt } from "../../lib/tenantI18n/messages/pt";
import type { TenantMessages } from "../../lib/tenantI18n/types";
import type { PublicAthenaEstimateDeliveryEmail } from "../../services/estimate/athenaEstimatePublic";
import {
  ESTIMATE_DELIVERY_EMAIL_BODY_MAX_CHARS,
  ESTIMATE_DELIVERY_EMAIL_SUBJECT_MAX_CHARS,
} from "../../services/estimate/estimateDeliveryEmail";
import { ORGANIZATION_LANGUAGES } from "../../services/organizationLanguage";

const DICTIONARIES: Record<string, TenantMessages> = {
  en,
  fr,
  es,
  it: itMessages,
  de,
  pt,
};

const EMAIL_KEYS = [
  "suggestedEmailTitle",
  "suggestedEmailSubject",
  "suggestedEmailBody",
  "suggestedEmailCopySubject",
  "suggestedEmailCopyBody",
  "suggestedEmailCopyAll",
  "suggestedEmailSave",
  "suggestedEmailSaving",
  "suggestedEmailSaved",
  "suggestedEmailCopied",
  "suggestedEmailSaveError",
  "suggestedEmailEmpty",
  "suggestedEmailEdited",
] as const;

const GENERATED_SUBJECT = "Website rebuild proposal for Northwind";
const GENERATED_BODY = "Bonjour Northwind.\n\nLe montant recommandé est 18,000 USD.";
const EDITED_SUBJECT = "Proposition revue pour Northwind";
const EDITED_BODY = "Bonjour Northwind.\n\nNous proposons 18,000 USD.\n\nBien cordialement.";

function generatedEmail(
  overrides: Partial<PublicAthenaEstimateDeliveryEmail> = {},
): PublicAthenaEstimateDeliveryEmail {
  return {
    subject: GENERATED_SUBJECT,
    body: GENERATED_BODY,
    language: "fr",
    edited: false,
    ...overrides,
  };
}

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}

function ensureDom(): HTMLElement {
  const existing = document.getElementById("suggested-email-test-root");
  assert.ok(existing);
  return existing;
}

function installClipboard(): string[] {
  const writes: string[] = [];
  const clipboard = {
    writeText: async (text: string) => {
      writes.push(text);
    },
  };
  Object.defineProperty(window.navigator, "clipboard", {
    configurable: true,
    value: clipboard,
  });
  return writes;
}

function mountSection(props: {
  estimateId?: string;
  deliveryEmail: PublicAthenaEstimateDeliveryEmail | null;
  messages?: TenantMessages["licensee"]["estimate"];
  onSaved?: (
    estimateId: string,
    deliveryEmail: PublicAthenaEstimateDeliveryEmail,
  ) => void;
}): {
  root: Root;
  container: HTMLElement;
  rerender: (next: typeof props) => void;
  unmount: () => void;
} {
  const container = ensureDom();
  container.replaceChildren();
  const root = createRoot(container);
  const render = (next: typeof props) => {
    act(() => {
      root.render(
        createElement(EstimateSuggestedEmailSection, {
          estimateId: next.estimateId ?? "estimate-a",
          deliveryEmail: next.deliveryEmail,
          messages: next.messages ?? en.licensee.estimate,
          onSaved: next.onSaved,
        }),
      );
    });
  };
  render(props);
  return {
    root,
    container,
    rerender: render,
    unmount() {
      act(() => {
        root.unmount();
      });
      container.replaceChildren();
    },
  };
}

function setControlValue(
  element: HTMLInputElement | HTMLTextAreaElement,
  value: string,
) {
  const proto =
    element.tagName === "TEXTAREA"
      ? window.HTMLTextAreaElement.prototype
      : window.HTMLInputElement.prototype;
  const setter = Object.getOwnPropertyDescriptor(proto, "value")?.set;
  assert.ok(setter);
  const previous = element.value;
  setter.call(element, value);
  const tracker = (
    element as HTMLInputElement & {
      _valueTracker?: { setValue: (next: string) => void };
    }
  )._valueTracker;
  tracker?.setValue(previous);
  element.dispatchEvent(new window.Event("input", { bubbles: true }));
}

function field(container: HTMLElement, id: string): HTMLInputElement | HTMLTextAreaElement {
  const element = container.querySelector(`#${id}`);
  assert.ok(element, id);
  return element as HTMLInputElement | HTMLTextAreaElement;
}

function buttonLabeled(container: HTMLElement, label: string): HTMLButtonElement {
  const found = [...container.querySelectorAll("button")].find((node) =>
    (node.textContent ?? "").includes(label),
  );
  assert.ok(found, `missing button ${label}`);
  return found as HTMLButtonElement;
}

describe("Suggested Email editor", () => {
  it("shows the section only for a Ready Estimate with a package", () => {
    assert.equal(
      shouldRenderSuggestedEmailSection({
        status: "Ready",
        hasPackage: true,
        detailPending: false,
      }),
      true,
    );
    for (const status of ["Queued", "Processing", "Processing Failed", null]) {
      assert.equal(
        shouldRenderSuggestedEmailSection({
          status,
          hasPackage: true,
          detailPending: false,
        }),
        false,
        String(status),
      );
    }
    assert.equal(
      shouldRenderSuggestedEmailSection({
        status: "Ready",
        hasPackage: false,
        detailPending: false,
      }),
      false,
    );
    assert.equal(
      shouldRenderSuggestedEmailSection({
        status: "Ready",
        hasPackage: true,
        detailPending: true,
      }),
      false,
    );
  });

  it("renders a generated email and an edited email without translating the text", () => {
    const generated = renderToStaticMarkup(
      createElement(EstimateSuggestedEmailSection, {
        estimateId: "estimate-a",
        deliveryEmail: generatedEmail(),
        messages: en.licensee.estimate,
      }),
    );
    assert.match(generated, /Suggested Email to Prospect/);
    assert.match(generated, /data-estimate-suggested-email="ready"/);
    assert.match(generated, /data-estimate-suggested-email-language="fr"/);
    assert.match(generated, new RegExp(GENERATED_SUBJECT));
    assert.match(generated, /Bonjour Northwind/);
    assert.match(generated, /18,000 USD/);
    assert.doesNotMatch(generated, /data-estimate-suggested-email-edited/);
    assert.doesNotMatch(generated, />Edited</);

    const edited = renderToStaticMarkup(
      createElement(EstimateSuggestedEmailSection, {
        estimateId: "estimate-a",
        deliveryEmail: generatedEmail({
          subject: EDITED_SUBJECT,
          body: EDITED_BODY,
          edited: true,
        }),
        messages: fr.licensee.estimate,
      }),
    );
    assert.match(edited, /E-mail suggéré au Prospect/);
    assert.match(edited, /data-estimate-suggested-email-edited="true"/);
    assert.match(edited, /Modifié/);
    assert.match(edited, new RegExp(EDITED_SUBJECT));
    assert.match(edited, /Nous proposons 18,000 USD/);
    assert.doesNotMatch(edited, /Suggested Email to Prospect/);
    assert.doesNotMatch(edited, new RegExp(GENERATED_SUBJECT));
  });

  it("shows an empty state without save or copy when no email exists", () => {
    const html = renderToStaticMarkup(
      createElement(EstimateSuggestedEmailSection, {
        estimateId: "estimate-a",
        deliveryEmail: null,
        messages: en.licensee.estimate,
      }),
    );
    assert.match(html, /data-estimate-suggested-email="empty"/);
    assert.match(html, /No suggested email available/);
    assert.match(html, /Suggested Email to Prospect/);
    assert.doesNotMatch(html, /Save Changes|Copy Subject|Copy Body|Copy All/);
    assert.doesNotMatch(html, /suggested-email-subject|suggested-email-body/);
  });

  it("edits subject and body, including paragraph breaks, within the limits", () => {
    const view = mountSection({ deliveryEmail: generatedEmail() });
    try {
      const subject = field(view.container, "suggested-email-subject");
      const body = field(view.container, "suggested-email-body");
      assert.equal(subject.getAttribute("maxlength"), String(ESTIMATE_DELIVERY_EMAIL_SUBJECT_MAX_CHARS));
      assert.equal(body.getAttribute("maxlength"), String(ESTIMATE_DELIVERY_EMAIL_BODY_MAX_CHARS));
      assert.equal(subject.tagName, "INPUT");
      assert.equal(body.tagName, "TEXTAREA");

      const nextBody = "First paragraph.\n\nSecond paragraph.";
      act(() => {
        setControlValue(subject as HTMLInputElement, "Updated subject");
        setControlValue(body as HTMLTextAreaElement, nextBody);
      });
      assert.equal((field(view.container, "suggested-email-subject") as HTMLInputElement).value, "Updated subject");
      assert.equal((field(view.container, "suggested-email-body") as HTMLTextAreaElement).value, nextBody);

      act(() => {
        setControlValue(
          field(view.container, "suggested-email-subject") as HTMLInputElement,
          `${"S".repeat(ESTIMATE_DELIVERY_EMAIL_SUBJECT_MAX_CHARS + 15)}\nextra`,
        );
        setControlValue(
          field(view.container, "suggested-email-body") as HTMLTextAreaElement,
          "B".repeat(ESTIMATE_DELIVERY_EMAIL_BODY_MAX_CHARS + 40),
        );
      });
      assert.equal(
        (field(view.container, "suggested-email-subject") as HTMLInputElement).value.length,
        ESTIMATE_DELIVERY_EMAIL_SUBJECT_MAX_CHARS,
      );
      assert.equal(
        (field(view.container, "suggested-email-body") as HTMLTextAreaElement).value.length,
        ESTIMATE_DELIVERY_EMAIL_BODY_MAX_CHARS,
      );
      assert.doesNotMatch(
        (field(view.container, "suggested-email-subject") as HTMLInputElement).value,
        /\n/,
      );
    } finally {
      view.unmount();
    }
  });

  it("copies the current subject, body, and combined email", async () => {
    const writes = installClipboard();
    const view = mountSection({ deliveryEmail: generatedEmail() });
    try {
      const messages = en.licensee.estimate;
      act(() => {
        setControlValue(
          field(view.container, "suggested-email-subject") as HTMLInputElement,
          "Draft subject",
        );
        setControlValue(
          field(view.container, "suggested-email-body") as HTMLTextAreaElement,
          "Line one.\n\nLine two.",
        );
      });

      await act(async () => {
        buttonLabeled(view.container, messages.suggestedEmailCopySubject).click();
      });
      await act(async () => {
        buttonLabeled(view.container, messages.suggestedEmailCopyBody).click();
      });
      await act(async () => {
        buttonLabeled(view.container, messages.suggestedEmailCopyAll).click();
      });

      assert.deepEqual(writes, [
        "Draft subject",
        "Line one.\n\nLine two.",
        formatSuggestedEmailCopyAll("Draft subject", "Line one.\n\nLine two."),
      ]);
      assert.equal(
        writes[2],
        "Subject: Draft subject\n\nLine one.\n\nLine two.",
      );
      assert.match(view.container.textContent ?? "", /Copied/);
    } finally {
      view.unmount();
    }
  });

  it("saves the edited text and shows the effective email returned by the API", async () => {
    const calls: Array<{ url: string; body: unknown }> = [];
    const originalFetch = globalThis.fetch;
    globalThis.fetch = (async (input: RequestInfo | URL, init?: RequestInit) => {
      calls.push({
        url: String(input),
        body: JSON.parse(String(init?.body ?? "{}")),
      });
      return jsonResponse({
        ok: true,
        deliveryEmail: {
          subject: "Draft subject",
          body: "Line one.\n\nLine two.",
          language: "fr",
          edited: true,
        },
      });
    }) as typeof fetch;

    const saved: PublicAthenaEstimateDeliveryEmail[] = [];
    const view = mountSection({
      deliveryEmail: generatedEmail(),
      onSaved: (_estimateId, email) => {
        saved.push(email);
      },
    });
    try {
      act(() => {
        setControlValue(
          field(view.container, "suggested-email-subject") as HTMLInputElement,
          "  Draft subject  ",
        );
        setControlValue(
          field(view.container, "suggested-email-body") as HTMLTextAreaElement,
          "Line one.\n\nLine two.\n",
        );
      });
      await act(async () => {
        buttonLabeled(view.container, en.licensee.estimate.suggestedEmailSave).click();
      });

      assert.equal(calls.length, 1);
      assert.equal(calls[0]?.url, "/api/licensee/estimate/estimate-a/delivery-email");
      assert.deepEqual(calls[0]?.body, {
        subject: "  Draft subject  ",
        body: "Line one.\n\nLine two.\n",
      });
      assert.equal(
        (field(view.container, "suggested-email-subject") as HTMLInputElement).value,
        "Draft subject",
      );
      assert.equal(
        (field(view.container, "suggested-email-body") as HTMLTextAreaElement).value,
        "Line one.\n\nLine two.",
      );
      assert.equal(
        view.container
          .querySelector("[data-estimate-suggested-email]")
          ?.getAttribute("data-estimate-suggested-email-language"),
        "fr",
      );
      assert.match(view.container.textContent ?? "", /Saved/);
      assert.match(view.container.textContent ?? "", /Edited/);
      assert.equal(saved.length, 1);
      assert.equal(saved[0]?.edited, true);
      assert.equal(saved[0]?.language, "fr");
    } finally {
      globalThis.fetch = originalFetch;
      view.unmount();
    }
  });

  it("keeps unsaved edits when save fails and allows another save afterward", async () => {
    const originalFetch = globalThis.fetch;
    let calls = 0;
    globalThis.fetch = (async () => {
      calls += 1;
      return jsonResponse(
        { ok: false, error: { code: "PERSISTENCE_FAILED", message: "Failed to save." } },
        500,
      );
    }) as typeof fetch;

    const view = mountSection({ deliveryEmail: generatedEmail() });
    try {
      act(() => {
        setControlValue(
          field(view.container, "suggested-email-subject") as HTMLInputElement,
          "Keep this subject",
        );
        setControlValue(
          field(view.container, "suggested-email-body") as HTMLTextAreaElement,
          "Keep this body.\n\nStill here.",
        );
      });
      await act(async () => {
        buttonLabeled(view.container, en.licensee.estimate.suggestedEmailSave).click();
      });
      assert.equal(
        (field(view.container, "suggested-email-subject") as HTMLInputElement).value,
        "Keep this subject",
      );
      assert.equal(
        (field(view.container, "suggested-email-body") as HTMLTextAreaElement).value,
        "Keep this body.\n\nStill here.",
      );
      assert.match(
        view.container.textContent ?? "",
        /Could not save the suggested email/,
      );
      assert.doesNotMatch(view.container.textContent ?? "", /Failed to save/);
      assert.equal(
        view.container.querySelector("[data-estimate-suggested-email-edited]"),
        null,
      );

      await act(async () => {
        buttonLabeled(view.container, en.licensee.estimate.suggestedEmailSave).click();
      });
      assert.equal(calls, 2);
      assert.equal(
        (field(view.container, "suggested-email-subject") as HTMLInputElement).value,
        "Keep this subject",
      );
    } finally {
      globalThis.fetch = originalFetch;
      view.unmount();
    }
  });

  it("ignores a second save while the first request is in flight", async () => {
    const originalFetch = globalThis.fetch;
    let calls = 0;
    let release: (response: Response) => void = () => {};
    const pending = new Promise<Response>((resolve) => {
      release = resolve;
    });
    globalThis.fetch = (async () => {
      calls += 1;
      return pending;
    }) as typeof fetch;

    const view = mountSection({ deliveryEmail: generatedEmail() });
    try {
      const save = buttonLabeled(view.container, en.licensee.estimate.suggestedEmailSave);
      await act(async () => {
        save.click();
        save.click();
      });
      assert.equal(calls, 1);
      assert.equal(
        (buttonLabeled(view.container, en.licensee.estimate.suggestedEmailSaving) as HTMLButtonElement)
          .disabled,
        true,
      );
      await act(async () => {
        release(
          jsonResponse({
            ok: true,
            deliveryEmail: generatedEmail({ edited: true }),
          }),
        );
      });
      assert.equal(calls, 1);
      assert.match(view.container.textContent ?? "", /Saved/);
    } finally {
      globalThis.fetch = originalFetch;
      view.unmount();
    }
  });

  it("loads each Estimate's own email and ignores a late save from the previous one", async () => {
    const originalFetch = globalThis.fetch;
    let release: (response: Response) => void = () => {};
    const pending = new Promise<Response>((resolve) => {
      release = resolve;
    });
    globalThis.fetch = (async () => pending) as typeof fetch;

    const view = mountSection({
      estimateId: "estimate-a",
      deliveryEmail: generatedEmail(),
    });
    try {
      act(() => {
        setControlValue(
          field(view.container, "suggested-email-subject") as HTMLInputElement,
          "Unsaved A",
        );
      });
      await act(async () => {
        buttonLabeled(view.container, en.licensee.estimate.suggestedEmailSave).click();
      });

      view.rerender({
        estimateId: "estimate-b",
        deliveryEmail: generatedEmail({
          subject: "Email for B",
          body: "Body for B only.",
          language: "es",
          edited: false,
        }),
      });
      assert.equal(
        (field(view.container, "suggested-email-subject") as HTMLInputElement).value,
        "Email for B",
      );
      assert.equal(
        (field(view.container, "suggested-email-body") as HTMLTextAreaElement).value,
        "Body for B only.",
      );
      assert.equal(
        view.container
          .querySelector("[data-estimate-suggested-email]")
          ?.getAttribute("data-estimate-suggested-email-language"),
        "es",
      );
      assert.doesNotMatch(view.container.textContent ?? "", /Unsaved A/);

      await act(async () => {
        release(
          jsonResponse({
            ok: true,
            deliveryEmail: generatedEmail({
              subject: "Saved A should not appear",
              body: "Saved A body",
              edited: true,
            }),
          }),
        );
      });
      assert.equal(
        (field(view.container, "suggested-email-subject") as HTMLInputElement).value,
        "Email for B",
      );
      assert.doesNotMatch(view.container.textContent ?? "", /Saved A should not appear/);
    } finally {
      globalThis.fetch = originalFetch;
      view.unmount();
    }
  });

  it("keeps unsaved edits when the same Estimate is refreshed, and reloads on a new mount", () => {
    const view = mountSection({ deliveryEmail: generatedEmail() });
    let reloaded: ReturnType<typeof mountSection> | null = null;
    let closed = false;
    try {
      act(() => {
        setControlValue(
          field(view.container, "suggested-email-subject") as HTMLInputElement,
          "Unsaved local subject",
        );
      });
      view.rerender({
        estimateId: "estimate-a",
        deliveryEmail: generatedEmail(),
      });
      assert.equal(
        (field(view.container, "suggested-email-subject") as HTMLInputElement).value,
        "Unsaved local subject",
      );

      view.unmount();
      closed = true;
      reloaded = mountSection({ deliveryEmail: generatedEmail() });
      assert.equal(
        (field(reloaded.container, "suggested-email-subject") as HTMLInputElement).value,
        GENERATED_SUBJECT,
      );
      assert.equal(
        (field(reloaded.container, "suggested-email-body") as HTMLTextAreaElement).value,
        GENERATED_BODY,
      );
    } finally {
      if (reloaded) reloaded.unmount();
      else if (!closed) view.unmount();
    }
  });

  it("uses the same labels in all six languages and leaves the email text unchanged", () => {
    const email = generatedEmail();
    for (const language of ORGANIZATION_LANGUAGES) {
      const block = DICTIONARIES[language].licensee.estimate;
      for (const key of EMAIL_KEYS) {
        assert.equal(typeof block[key], "string", `${language}.${key}`);
        assert.ok(block[key].trim(), `${language}.${key} empty`);
      }
      if (language !== "en") {
        assert.notEqual(block.suggestedEmailTitle, en.licensee.estimate.suggestedEmailTitle);
        assert.notEqual(block.suggestedEmailEmpty, en.licensee.estimate.suggestedEmailEmpty);
        assert.notEqual(block.suggestedEmailSaveError, en.licensee.estimate.suggestedEmailSaveError);
      }
      const ready = renderToStaticMarkup(
        createElement(EstimateSuggestedEmailSection, {
          estimateId: "estimate-a",
          deliveryEmail: email,
          messages: block,
        }),
      );
      const empty = renderToStaticMarkup(
        createElement(EstimateSuggestedEmailSection, {
          estimateId: "estimate-a",
          deliveryEmail: null,
          messages: block,
        }),
      );
      assert.match(ready, new RegExp(block.suggestedEmailTitle));
      assert.match(ready, new RegExp(block.suggestedEmailSubject));
      assert.match(ready, new RegExp(block.suggestedEmailBody));
      assert.match(ready, new RegExp(block.suggestedEmailCopySubject));
      assert.match(ready, new RegExp(block.suggestedEmailCopyBody));
      assert.match(ready, new RegExp(block.suggestedEmailCopyAll));
      assert.match(ready, new RegExp(block.suggestedEmailSave));
      assert.match(ready, new RegExp(GENERATED_SUBJECT));
      assert.match(ready, /Bonjour Northwind/);
      assert.match(ready, /18,000 USD/);
      assert.match(empty, new RegExp(block.suggestedEmailEmpty));
      assert.doesNotMatch(empty, new RegExp(block.suggestedEmailSave));
      assert.doesNotMatch(ready, /mailto:/);
    }
  });
});
