"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import {
  ClientQuoteTemplateCatalogView,
  type ClientQuoteTemplateFormState,
  type ClientQuoteTemplateMaskState,
} from "@/components/licensee/clientQuotes/ClientQuoteTemplateCatalogView";
import type { LicenseeMessages } from "@/lib/licensee/getLicenseeLocalization";
import {
  buildClientQuoteTemplateRequest,
  clientQuoteTemplateFormFromTemplate,
  emptyClientQuoteTemplateForm,
  type ClientQuoteTemplateFormValues,
} from "@/lib/licensee/clientQuoteTemplateCatalogModel";
import {
  clientQuoteTemplateErrorMessage,
  clientQuoteTemplateFieldMessage,
} from "@/lib/licensee/clientQuoteTemplateCatalogMessages";
import { parseJsonResponse } from "@/lib/safeJsonResponse";
import type { PublicClientQuoteTemplate } from "@/services/clientQuote/clientQuoteTemplatePublic";

type TemplateResponse = {
  ok?: boolean;
  template?: PublicClientQuoteTemplate;
  templates?: PublicClientQuoteTemplate[];
  error?: { code?: string; message?: string };
};

export function LicenseeClientQuoteTemplateCatalog({
  messages,
  locale,
}: {
  messages: LicenseeMessages;
  locale: string;
}) {
  const [phase, setPhase] = useState<"loading" | "error" | "ready">("loading");
  const [templates, setTemplates] = useState<PublicClientQuoteTemplate[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [form, setForm] = useState<ClientQuoteTemplateFormState | null>(null);
  const [mask, setMask] = useState<ClientQuoteTemplateMaskState | null>(null);
  const saveLock = useRef(false);
  const maskLock = useRef(false);

  const load = useCallback(async (options?: { quiet?: boolean }) => {
    if (!options?.quiet) {
      setPhase("loading");
      setError(null);
    }
    try {
      const response = await fetch("/api/licensee/client-quote-templates", {
        cache: "no-store",
      });
      const payload = await parseJsonResponse<TemplateResponse>(response);
      if (!response.ok || !payload.ok || !Array.isArray(payload.templates)) {
        const message = clientQuoteTemplateErrorMessage(messages, payload.error?.code);
        if (options?.quiet) {
          setError(message);
          return;
        }
        setTemplates([]);
        setError(message);
        setPhase("error");
        return;
      }
      setTemplates(payload.templates);
      setError(null);
      setPhase("ready");
    } catch {
      if (options?.quiet) {
        setError(messages.clientQuoteTemplates.errors.generic);
        return;
      }
      setTemplates([]);
      setError(messages.clientQuoteTemplates.errors.generic);
      setPhase("error");
    }
  }, [messages]);

  useEffect(() => {
    void load();
  }, [load]);

  function openCreate() {
    if (saveLock.current) return;
    setNotice(null);
    setForm({
      mode: "create",
      templateId: null,
      originalCurrencyCode: null,
      values: emptyClientQuoteTemplateForm(),
      fieldErrors: {},
      formError: null,
      pending: false,
    });
  }

  function openEdit(templateId: string) {
    if (saveLock.current) return;
    const template = templates.find((item) => item.id === templateId);
    if (!template) return;
    setNotice(null);
    setForm({
      mode: "edit",
      templateId: template.id,
      originalCurrencyCode: template.currencyCode,
      values: clientQuoteTemplateFormFromTemplate(template),
      fieldErrors: {},
      formError: null,
      pending: false,
    });
  }

  function cancelForm() {
    if (saveLock.current) return;
    setForm(null);
  }

  function changeForm(patch: Partial<ClientQuoteTemplateFormValues>) {
    setForm((current) => {
      if (!current || current.pending) return current;
      const fieldErrors = { ...current.fieldErrors };
      if ("name" in patch) delete fieldErrors.name;
      if ("description" in patch) delete fieldErrors.description;
      if ("quantityText" in patch) delete fieldErrors.quantity;
      if ("unitPriceText" in patch) delete fieldErrors.unitPrice;
      if ("currencyCode" in patch) delete fieldErrors.currency;
      if ("billingFrequency" in patch) delete fieldErrors.frequency;
      return {
        ...current,
        values: { ...current.values, ...patch },
        fieldErrors,
        formError: null,
      };
    });
  }

  async function submitForm() {
    if (saveLock.current || !form || form.pending) return;
    const built = buildClientQuoteTemplateRequest(form.values, {
      originalCurrencyCode: form.originalCurrencyCode,
    });
    if (!built.ok) {
      const fieldErrors: ClientQuoteTemplateFormState["fieldErrors"] = {};
      for (const field of built.fields) {
        fieldErrors[field] = clientQuoteTemplateFieldMessage(messages, field);
      }
      setForm({ ...form, fieldErrors, formError: null });
      return;
    }
    saveLock.current = true;
    const templateId = form.mode === "edit" ? form.templateId : null;
    setForm({ ...form, pending: true, fieldErrors: {}, formError: null });
    try {
      const response = await fetch(
        templateId
          ? `/api/licensee/client-quote-templates/${templateId}`
          : "/api/licensee/client-quote-templates",
        {
          method: templateId ? "PATCH" : "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(built.body),
        },
      );
      const payload = await parseJsonResponse<TemplateResponse>(response);
      if (!response.ok || !payload.ok || !payload.template) {
        setForm((current) =>
          current
            ? {
                ...current,
                pending: false,
                formError: clientQuoteTemplateErrorMessage(messages, payload.error?.code),
              }
            : current,
        );
        return;
      }
      setNotice(
        form.mode === "create"
          ? messages.clientQuoteTemplates.createSuccess
          : messages.clientQuoteTemplates.updateSuccess,
      );
      setForm(null);
      setTemplates((current) => upsertTemplate(current, payload.template as PublicClientQuoteTemplate));
      await load({ quiet: true });
    } catch {
      setForm((current) =>
        current
          ? {
              ...current,
              pending: false,
              formError: messages.clientQuoteTemplates.errors.generic,
            }
          : current,
      );
    } finally {
      saveLock.current = false;
    }
  }

  function requestMask(templateId: string) {
    if (maskLock.current) return;
    const template = templates.find((item) => item.id === templateId);
    if (!template) return;
    setMask({ template, pending: false, error: null });
  }

  function cancelMask() {
    if (maskLock.current) return;
    setMask(null);
  }

  async function confirmMask() {
    if (maskLock.current || !mask || mask.pending) return;
    const templateId = mask.template.id;
    maskLock.current = true;
    setMask({ ...mask, pending: true, error: null });
    try {
      const response = await fetch(
        `/api/licensee/client-quote-templates/${templateId}`,
        { method: "DELETE" },
      );
      const payload = await parseJsonResponse<TemplateResponse>(response);
      if (!response.ok || !payload.ok) {
        setMask((current) =>
          current
            ? {
                ...current,
                pending: false,
                error: clientQuoteTemplateErrorMessage(messages, payload.error?.code),
              }
            : current,
        );
        return;
      }
      setTemplates((current) => current.filter((item) => item.id !== templateId));
      setMask(null);
      setForm((current) =>
        current?.templateId === templateId ? null : current,
      );
      setNotice(messages.clientQuoteTemplates.deleteSuccess);
      await load({ quiet: true });
    } catch {
      setMask((current) =>
        current
          ? {
              ...current,
              pending: false,
              error: messages.clientQuoteTemplates.errors.generic,
            }
          : current,
      );
    } finally {
      maskLock.current = false;
    }
  }

  return (
    <ClientQuoteTemplateCatalogView
      phase={phase}
      templates={templates}
      error={error}
      notice={notice}
      locale={locale}
      messages={messages}
      form={form}
      mask={mask}
      onRetry={() => void load()}
      onCreate={openCreate}
      onEdit={openEdit}
      onCancelForm={cancelForm}
      onChangeForm={changeForm}
      onSubmitForm={() => void submitForm()}
      onRequestMask={requestMask}
      onCancelMask={cancelMask}
      onConfirmMask={() => void confirmMask()}
    />
  );
}

function upsertTemplate(
  templates: readonly PublicClientQuoteTemplate[],
  template: PublicClientQuoteTemplate,
): PublicClientQuoteTemplate[] {
  const index = templates.findIndex((item) => item.id === template.id);
  if (index < 0) return [template, ...templates];
  return templates.map((item) => (item.id === template.id ? template : item));
}
