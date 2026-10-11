/**
 * CQ-STRIPE-1 Gate 2B — server-side Stripe API v1 client.
 * Credentials stay in the Authorization header. They are not written into
 * the form body, the idempotency key, or the returned snapshot.
 * GET is used only to recover one Price by lookup_key. Payment Link
 * inventory is not listed.
 */

import {
  STRIPE_API_ORIGIN,
  STRIPE_API_VERSION,
  STRIPE_PAYMENT_LINK_CREATE_PATH,
  STRIPE_PRICE_CREATE_PATH,
  readStripePaymentLinkSnapshot,
  readStripePriceList,
  readStripePriceSnapshot,
  type StripePaymentLinkSnapshot,
  type StripePriceSnapshot,
} from "@/services/clientQuotePayment/clientQuotePaymentStripeContract";
import { clientQuotePaymentStripeError } from "@/services/clientQuotePayment/clientQuotePaymentStripeErrors";

const PRICE_KEY_PATTERN = /^cqpr_price_v1_[0-9a-f]{64}$/;
const LINK_KEY_PATTERN = /^cqpr_link_v1_[0-9a-f]{64}$/;

export type StripeOperationResult<T> =
  | { outcome: "success"; value: T }
  | { outcome: "absent" }
  | { outcome: "ambiguous" }
  | { outcome: "lookup_conflict" }
  | { outcome: "uncertain" }
  | { outcome: "rejected" };

export type StripeV1HttpRequest = {
  method: "GET" | "POST";
  path: typeof STRIPE_PRICE_CREATE_PATH | typeof STRIPE_PAYMENT_LINK_CREATE_PATH;
  query?: ReadonlyArray<readonly [string, string]>;
  body?: string;
  idempotencyKey?: string;
  secret: string;
};

export type StripeV1HttpResponse = {
  status: number;
  json: unknown;
};

export type StripeV1Http = (input: StripeV1HttpRequest) => Promise<StripeV1HttpResponse>;

export type ClientQuotePaymentStripeClient = {
  assertConfigured(): void;
  createPrice(input: {
    idempotencyKey: string;
    body: string;
  }): Promise<StripeOperationResult<StripePriceSnapshot>>;
  createPaymentLink(input: {
    idempotencyKey: string;
    body: string;
  }): Promise<StripeOperationResult<StripePaymentLinkSnapshot>>;
  findPriceByLookupKey(
    lookupKey: string,
  ): Promise<StripeOperationResult<StripePriceSnapshot>>;
};

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

function stripeErrorDetails(json: unknown): {
  type: string;
  code: string;
  param: string;
  message: string;
} {
  if (!isRecord(json) || !isRecord(json.error)) {
    return { type: "", code: "", param: "", message: "" };
  }
  const error = json.error;
  return {
    type: typeof error.type === "string" ? error.type : "",
    code: typeof error.code === "string" ? error.code : "",
    param: typeof error.param === "string" ? error.param : "",
    message: typeof error.message === "string" ? error.message : "",
  };
}

function logStripeFailure(method: string, path: string, status: number, json: unknown): void {
  const details = stripeErrorDetails(json);
  console.error("[CLIENT_QUOTE_PAYMENT] stripe_request_failed", {
    method,
    path,
    status,
    type: details.type,
    code: details.code,
    param: details.param,
  });
}

function classifyPost(
  status: number,
  json: unknown,
  allowLookupConflict: boolean,
): "lookup_conflict" | "uncertain" | "rejected" | "success" {
  if (status >= 200 && status < 300) return "success";
  const details = stripeErrorDetails(json);
  if (status === 400 && allowLookupConflict && details.param === "lookup_key") {
    return "lookup_conflict";
  }
  if (details.type === "idempotency_error") {
    if (/parameter/i.test(details.message)) return "rejected";
    return "uncertain";
  }
  if (status === 408 || status === 409 || status === 429 || status >= 500) return "uncertain";
  if (status >= 300 && status < 400) return "uncertain";
  return "rejected";
}

export function createStripePaymentClient(input: {
  http: StripeV1Http;
  secret: () => string;
}): ClientQuotePaymentStripeClient {
  function requireSecret(): string {
    let secret = "";
    try {
      secret = input.secret();
    } catch (error) {
      if (error instanceof Error && error.name === "ClientQuotePaymentStripeError") throw error;
      throw clientQuotePaymentStripeError("STRIPE_NOT_CONFIGURED");
    }
    if (secret.trim().length < 8 || /\s/.test(secret)) {
      throw clientQuotePaymentStripeError("STRIPE_NOT_CONFIGURED");
    }
    return secret;
  }

  return {
    assertConfigured() {
      requireSecret();
    },
    async createPrice(request) {
      if (!PRICE_KEY_PATTERN.test(request.idempotencyKey)) return { outcome: "rejected" };
      const secret = requireSecret();
      let response: StripeV1HttpResponse;
      try {
        response = await input.http({
          method: "POST",
          path: STRIPE_PRICE_CREATE_PATH,
          body: request.body,
          idempotencyKey: request.idempotencyKey,
          secret,
        });
      } catch {
        console.error("[CLIENT_QUOTE_PAYMENT] stripe_transport_failed");
        return { outcome: "uncertain" };
      }
      const classified = classifyPost(response.status, response.json, true);
      if (classified === "lookup_conflict") return { outcome: "lookup_conflict" };
      if (classified === "uncertain") {
        logStripeFailure("POST", STRIPE_PRICE_CREATE_PATH, response.status, response.json);
        return { outcome: "uncertain" };
      }
      if (classified === "rejected") {
        logStripeFailure("POST", STRIPE_PRICE_CREATE_PATH, response.status, response.json);
        return { outcome: "rejected" };
      }
      const price = readStripePriceSnapshot(response.json);
      if (!price) return { outcome: "rejected" };
      return { outcome: "success", value: price };
    },
    async createPaymentLink(request) {
      if (!LINK_KEY_PATTERN.test(request.idempotencyKey)) return { outcome: "rejected" };
      const secret = requireSecret();
      let response: StripeV1HttpResponse;
      try {
        response = await input.http({
          method: "POST",
          path: STRIPE_PAYMENT_LINK_CREATE_PATH,
          body: request.body,
          idempotencyKey: request.idempotencyKey,
          secret,
        });
      } catch {
        console.error("[CLIENT_QUOTE_PAYMENT] stripe_transport_failed");
        return { outcome: "uncertain" };
      }
      const classified = classifyPost(response.status, response.json, false);
      if (classified === "uncertain") {
        logStripeFailure("POST", STRIPE_PAYMENT_LINK_CREATE_PATH, response.status, response.json);
        return { outcome: "uncertain" };
      }
      if (classified !== "success") {
        logStripeFailure("POST", STRIPE_PAYMENT_LINK_CREATE_PATH, response.status, response.json);
        return { outcome: "rejected" };
      }
      const link = readStripePaymentLinkSnapshot(response.json);
      if (!link) return { outcome: "rejected" };
      return { outcome: "success", value: link };
    },
    async findPriceByLookupKey(lookupKey) {
      if (!PRICE_KEY_PATTERN.test(lookupKey)) return { outcome: "rejected" };
      const secret = requireSecret();
      let response: StripeV1HttpResponse;
      try {
        response = await input.http({
          method: "GET",
          path: STRIPE_PRICE_CREATE_PATH,
          query: [
            ["lookup_keys[]", lookupKey],
            ["limit", "2"],
          ],
          secret,
        });
      } catch {
        console.error("[CLIENT_QUOTE_PAYMENT] stripe_transport_failed");
        return { outcome: "uncertain" };
      }
      if (response.status === 408 || response.status === 429 || response.status >= 500) {
        return { outcome: "uncertain" };
      }
      if (response.status < 200 || response.status >= 300) {
        logStripeFailure("GET", STRIPE_PRICE_CREATE_PATH, response.status, response.json);
        return { outcome: "rejected" };
      }
      const list = readStripePriceList(response.json);
      if (list.kind === "invalid") return { outcome: "rejected" };
      if (list.kind === "truncated") return { outcome: "ambiguous" };
      const price = list.prices[0];
      if (!price) return { outcome: "absent" };
      if (price.lookupKey !== lookupKey) return { outcome: "ambiguous" };
      return { outcome: "success", value: price };
    },
  };
}

function assertStripePath(input: StripeV1HttpRequest): void {
  if (input.method === "GET") {
    if (input.path !== STRIPE_PRICE_CREATE_PATH) {
      throw new Error("Stripe Payment Link inventory is not queried.");
    }
    if (input.idempotencyKey) {
      throw new Error("Stripe GET does not send an idempotency key.");
    }
    const query = input.query ?? [];
    if (
      query.length !== 2 ||
      query[0]?.[0] !== "lookup_keys[]" ||
      query[1]?.[0] !== "limit" ||
      query[1]?.[1] !== "2" ||
      !PRICE_KEY_PATTERN.test(query[0]?.[1] ?? "")
    ) {
      throw new Error("Stripe Price recovery is limited to one lookup key.");
    }
    return;
  }
  if (input.path !== STRIPE_PRICE_CREATE_PATH && input.path !== STRIPE_PAYMENT_LINK_CREATE_PATH) {
    throw new Error("Stripe path is not a payment-link create call.");
  }
  if (!input.idempotencyKey || !input.body) {
    throw new Error("Stripe create calls require the persisted idempotency key.");
  }
  if (input.query && input.query.length > 0) {
    throw new Error("Stripe create calls do not take a list query.");
  }
}

/**
 * Live HTTP transport. Sends the secret only as a Bearer token to
 * api.stripe.com and does not follow redirects.
 */
export function createStripeV1Http(fetchImpl: typeof fetch = fetch): StripeV1Http {
  return async (input) => {
    assertStripePath(input);
    const url = new URL(input.path, STRIPE_API_ORIGIN);
    if (url.origin !== STRIPE_API_ORIGIN) {
      throw new Error("Stripe host is not api.stripe.com.");
    }
    for (const [key, value] of input.query ?? []) url.searchParams.append(key, value);
    const headers = new Headers();
    headers.set("Authorization", `Bearer ${input.secret}`);
    headers.set("Stripe-Version", STRIPE_API_VERSION);
    if (input.method === "POST") {
      headers.set("Content-Type", "application/x-www-form-urlencoded");
      headers.set("Idempotency-Key", input.idempotencyKey ?? "");
    }
    let response: Response;
    try {
      response = await fetchImpl(url, {
        method: input.method,
        headers,
        body: input.method === "POST" ? input.body : undefined,
        redirect: "manual",
        cache: "no-store",
        signal: AbortSignal.timeout(20_000),
      });
    } catch {
      throw new Error("Stripe transport failed.");
    }
    if (response.status >= 300 && response.status < 400) {
      return { status: response.status, json: null };
    }
    const text = await response.text();
    if (!text) return { status: response.status, json: null };
    try {
      return { status: response.status, json: JSON.parse(text) as unknown };
    } catch {
      throw new Error("Stripe transport failed.");
    }
  };
}

export function readStripeSecretFromEnv(env: NodeJS.ProcessEnv = process.env): string {
  const value = env.STRIPE_SECRET_KEY;
  if (typeof value !== "string") throw clientQuotePaymentStripeError("STRIPE_NOT_CONFIGURED");
  const secret = value.trim();
  if (secret.length < 8 || /\s/.test(secret)) {
    throw clientQuotePaymentStripeError("STRIPE_NOT_CONFIGURED");
  }
  return secret;
}
