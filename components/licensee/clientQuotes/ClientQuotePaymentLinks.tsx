"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import type { LicenseeMessages } from "@/lib/licensee/getLicenseeLocalization";
import { ClientQuotePaymentLinksSection } from "@/components/licensee/clientQuotes/ClientQuotePaymentLinksSection";
import {
  buildClientQuotePaymentLinksView,
  clientQuotePaymentLinkRequestBody,
  completionDecisionFor,
  copyClientQuotePaymentLinkUrl,
  depositMajorUnitsToMinor,
  parseClientQuotePaymentLinkPayload,
  paymentLinkDecisionAllowed,
  paymentLinkEffectMethod,
  paymentLinkFailureKind,
  runExclusivePaymentLinkAction,
  samePaymentLinkDecision,
  type ClientQuotePaymentLinkDecision,
  type ClientQuotePaymentLinkPayload,
  type ClientQuotePaymentLinkRecurring,
} from "@/lib/licensee/clientQuotePaymentLinksModel";
import { parseJsonResponse } from "@/lib/safeJsonResponse";
import { writeClipboardText } from "@/lib/clipboard";

type LoadResult =
  | { ok: true; payload: ClientQuotePaymentLinkPayload }
  | { ok: false; code: string };

async function readPaymentLinkResponse(response: Response): Promise<LoadResult> {
  const body = await parseJsonResponse<unknown>(response, {
    unexpectedMessage: "Payment links could not be loaded.",
  });
  if (!response.ok || !body || typeof body !== "object") {
    const code =
      body && typeof body === "object" && "error" in body && body.error && typeof body.error === "object" &&
      "code" in body.error && typeof body.error.code === "string"
        ? body.error.code
        : "PAYMENT_LINK_FAILED";
    return { ok: false, code };
  }
  const record = body as { ok?: unknown; error?: { code?: unknown } };
  if (record.ok !== true) {
    return {
      ok: false,
      code: typeof record.error?.code === "string" ? record.error.code : "PAYMENT_LINK_FAILED",
    };
  }
  const payload = parseClientQuotePaymentLinkPayload(body);
  if (!payload) return { ok: false, code: "PAYMENT_LINK_FAILED" };
  return { ok: true, payload };
}

export function ClientQuotePaymentLinks({
  quoteId,
  currencyCode,
  messages,
}: {
  quoteId: string;
  currencyCode: string;
  messages: LicenseeMessages;
}) {
  const [phase, setPhase] = useState<"loading" | "load_failed" | "ready">("loading");
  const [payload, setPayload] = useState<ClientQuotePaymentLinkPayload | null>(null);
  const [failureCode, setFailureCode] = useState<string | null>(null);
  const [choice, setChoice] = useState<"full" | "split" | null>(null);
  const [depositText, setDepositText] = useState("");
  const [pendingKey, setPendingKey] = useState<string | null>(null);
  const [copiedRequestId, setCopiedRequestId] = useState<string | null>(null);
  const [copyFailed, setCopyFailed] = useState(false);
  const [canRetrySame, setCanRetrySame] = useState(false);
  const lock = useRef(false);
  const lastDecision = useRef<ClientQuotePaymentLinkDecision | null>(null);
  const payloadRef = useRef<ClientQuotePaymentLinkPayload | null>(null);
  payloadRef.current = payload;

  const applyPayload = useCallback((next: ClientQuotePaymentLinkPayload) => {
    setPayload(next);
    setPhase("ready");
    setFailureCode(null);
    setCanRetrySame(false);
    const mode = next.eligibility.oneTime?.existingMode ?? null;
    if (mode) setChoice(mode);
  }, []);

  const load = useCallback(
    async (signal?: AbortSignal) => {
      if (paymentLinkEffectMethod("mount") !== "GET") return;
      setPhase("loading");
      setFailureCode(null);
      setCanRetrySame(false);
      try {
        const response = await fetch(
          `/api/licensee/client-quotes/${encodeURIComponent(quoteId)}/payment-links`,
          { method: "GET", cache: "no-store", signal, headers: { Accept: "application/json" } },
        );
        if (signal?.aborted) return;
        const result = await readPaymentLinkResponse(response);
        if (signal?.aborted) return;
        if (!result.ok) {
          setPhase("load_failed");
          setFailureCode(result.code);
          return;
        }
        applyPayload(result.payload);
      } catch {
        if (signal?.aborted) return;
        setPhase("load_failed");
        setFailureCode("PAYMENT_LINK_FAILED");
      }
    },
    [applyPayload, quoteId],
  );

  useEffect(() => {
    const controller = new AbortController();
    void load(controller.signal);
    return () => controller.abort();
  }, [load]);

  async function send(decision: ClientQuotePaymentLinkDecision, key: string) {
    const outcome = await runExclusivePaymentLinkAction(lock, async () => {
      lastDecision.current = decision;
      setPendingKey(key);
      setFailureCode(null);
      setCanRetrySame(false);
      setCopiedRequestId(null);
      try {
        const response = await fetch(
          `/api/licensee/client-quotes/${encodeURIComponent(quoteId)}/payment-links`,
          {
            method: "POST",
            cache: "no-store",
            headers: {
              Accept: "application/json",
              "Content-Type": "application/json",
            },
            body: JSON.stringify(clientQuotePaymentLinkRequestBody(decision)),
          },
        );
        const result = await readPaymentLinkResponse(response);
        if (!result.ok) {
          setFailureCode(result.code);
          setCanRetrySame(paymentLinkFailureKind(result.code) === "uncertain");
          if (payloadRef.current) setPhase("ready");
          else setPhase("load_failed");
          return;
        }
        applyPayload(result.payload);
      } catch {
        setFailureCode("PAYMENT_LINK_FAILED");
        setCanRetrySame(false);
        if (payloadRef.current) setPhase("ready");
      } finally {
        setPendingKey(null);
      }
    });
    return outcome;
  }

  function currentRecovery() {
    return buildClientQuotePaymentLinksView({
      phase,
      pendingKey,
      failureCode,
      canRetrySame,
      payload,
      choice,
      depositText,
      currencyCode,
    }).recovery;
  }

  function submit(decision: ClientQuotePaymentLinkDecision, key: string) {
    const current = payloadRef.current;
    if (!current) return;
    if (
      !paymentLinkDecisionAllowed({
        eligibility: current.eligibility,
        requests: current.paymentRequests,
        decision,
        recovery: currentRecovery(),
      })
    ) {
      return;
    }
    if (paymentLinkEffectMethod("user_create") !== "POST") return;
    void send(decision, key);
  }

  const view = buildClientQuotePaymentLinksView({
    phase,
    pendingKey,
    failureCode,
    canRetrySame,
    payload,
    choice,
    depositText,
    currencyCode,
  });

  return (
    <ClientQuotePaymentLinksSection
      messages={messages}
      view={view}
      depositText={depositText}
      copiedRequestId={copiedRequestId}
      copyFailed={copyFailed}
      onRetryLoad={() => {
        if (paymentLinkEffectMethod("retry_load") !== "GET") return;
        void load();
      }}
      onSelect={(next) => {
        if (view.pending || view.oneTime?.locked) return;
        setChoice(next);
      }}
      onDepositChange={(value) => {
        if (view.pending || view.oneTime?.locked) return;
        setDepositText(value);
      }}
      onCreateFull={() => submit({ kind: "one_time_full" }, "one_time_full")}
      onCreateSplit={() => {
        const deposit = depositMajorUnitsToMinor(depositText, view.currencyCode ?? currencyCode);
        if (!deposit.ok) return;
        submit({ kind: "one_time_split", depositMinor: deposit.depositMinor }, "one_time_split");
      }}
      onCreateRecurring={(frequency: ClientQuotePaymentLinkRecurring) =>
        submit({ kind: "recurring", billingFrequency: frequency }, frequency)
      }
      onComplete={(key) => {
        const decision = completionDecisionFor(payloadRef.current?.paymentRequests ?? [], key);
        if (!decision) return;
        if (paymentLinkEffectMethod("user_complete") !== "POST") return;
        submit(decision, `complete:${key}`);
      }}
      onRetrySame={() => {
        const decision = lastDecision.current;
        if (!decision || !canRetrySame || view.recovery !== "uncertain") return;
        if (paymentLinkEffectMethod("user_retry_same") !== "POST") return;
        void send(decision, "retry-same");
      }}
      onCopy={(requestId, url) => {
        void copyClientQuotePaymentLinkUrl(url, writeClipboardText)
          .then(() => {
            setCopiedRequestId(requestId);
            setCopyFailed(false);
          })
          .catch(() => {
            setCopiedRequestId(requestId);
            setCopyFailed(true);
          });
      }}
    />
  );
}

export function paymentLinkRetryMatchesLast(
  last: ClientQuotePaymentLinkDecision | null,
  next: ClientQuotePaymentLinkDecision,
): boolean {
  return last != null && samePaymentLinkDecision(last, next);
}
