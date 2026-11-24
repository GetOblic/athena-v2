/**
 * Normalized observation contract.
 * Unknown values stay null. Raw HTML and image binaries are rejected.
 * Threshold match is derived from the confirmed criterion, not from the caller.
 */

import { matchMonitorCriterion } from "@/services/monitor/monitorCriterion";
import { MonitorOperationError } from "@/services/monitor/monitorErrors";
import { getMonitorSource, isHardDeniedMonitorUrl } from "@/services/monitor/monitorSources";
import { MONITOR_MAX_OBSERVATION_PAYLOAD_CHARS } from "@/services/monitor/monitorRuntime";
import { publicObservationContentKey } from "@/services/monitor/monitorReuse";
import {
  MONITOR_OBSERVATION_PAYLOAD_VERSION,
  MONITOR_PUBLIC_SCHEMA_VERSION,
  type MonitorConfiguration,
  type MonitorCriterion,
  type MonitorObservationPayload,
  type SharedMonitorSource,
  type SharedPublicObservation,
} from "@/services/monitor/monitorTypes";

const PRICE_AMOUNT = /^(?:0|[1-9]\d*)(?:\.\d{1,2})?$/;
const CURRENCY = /^[A-Z]{3}$/;
const FAMILY_ID = /^[A-Za-z0-9][A-Za-z0-9._:-]{0,199}$/;

export type MonitorObservationDraft = {
  sourceId: string;
  familyId: string;
  productUrl: string;
  productName?: unknown;
  category?: unknown;
  priceAmount?: unknown;
  currency?: unknown;
  colorPatternIds?: unknown;
  colorPatternNames?: unknown;
  distinctVariationCount?: unknown;
  sizes?: unknown;
  lengths?: unknown;
  imageUrl?: unknown;
  observedAt: string;
  /** Categories this family was enumerated in. Omitted means the job selection. */
  categoryIds?: string[];
};

function invalid(message: string): never {
  throw new MonitorOperationError("INVALID_OBSERVATION", message);
}

function nullableText(value: unknown, max: number, label: string): string | null {
  if (value == null) return null;
  if (typeof value !== "string") invalid(`${label} is invalid.`);
  const text = value.trim();
  if (!text) return null;
  if (text.length > max) invalid(`${label} exceeds the bound.`);
  if (/<\/?[a-z][\s\S]*>/i.test(text)) invalid(`${label} cannot contain markup.`);
  return text;
}

function stringList(value: unknown, label: string): string[] | null {
  if (value == null) return null;
  if (!Array.isArray(value)) invalid(`${label} is invalid.`);
  if (value.length > 100) invalid(`${label} exceeds the bound.`);
  return value.map((item) => {
    const text = nullableText(item, 80, label);
    if (!text) invalid(`${label} contains an empty value.`);
    return text;
  });
}

function httpsUrl(value: unknown): string | null {
  if (value == null) return null;
  if (typeof value !== "string") invalid("Image URL is invalid.");
  let parsed: URL;
  try {
    parsed = new URL(value);
  } catch {
    invalid("Image URL is invalid.");
  }
  if (parsed.protocol !== "https:" || parsed.username || parsed.password) {
    invalid("Image URL must be https.");
  }
  if (value.trim().toLowerCase().startsWith("data:")) {
    invalid("Image binaries are not stored.");
  }
  if (isHardDeniedMonitorUrl(parsed.toString())) invalid("Image URL is not allowed.");
  if (parsed.toString().length > 2_000) invalid("Image URL exceeds the bound.");
  return parsed.toString();
}

function productUrl(value: string, sourceId: string): string {
  const source = getMonitorSource(sourceId);
  if (!source) invalid("Unknown observation source.");
  let parsed: URL;
  try {
    parsed = new URL(value);
  } catch {
    invalid("Product URL is invalid.");
  }
  if (parsed.protocol !== "https:" || parsed.username || parsed.password) {
    invalid("Product URL must be https.");
  }
  const host = parsed.hostname.toLowerCase();
  if (host !== source.registrableDomain && !host.endsWith(`.${source.registrableDomain}`)) {
    invalid("Product URL is outside the source domain.");
  }
  if (isHardDeniedMonitorUrl(parsed.toString())) invalid("Product URL is not allowed.");
  return parsed.toString();
}

export function buildObservationPayload(
  draft: MonitorObservationDraft,
  criterion: MonitorCriterion,
): MonitorObservationPayload {
  if (!FAMILY_ID.test(draft.familyId)) invalid("Family identity is invalid.");
  const distinctVariationCount =
    draft.distinctVariationCount == null
      ? null
      : draft.distinctVariationCount;
  if (
    distinctVariationCount !== null &&
    (typeof distinctVariationCount !== "number" ||
      !Number.isInteger(distinctVariationCount) ||
      distinctVariationCount < 0 ||
      distinctVariationCount > 500)
  ) {
    invalid("Distinct variation count is invalid.");
  }
  const amount =
    draft.priceAmount == null
      ? null
      : typeof draft.priceAmount === "string"
        ? draft.priceAmount.trim()
        : invalid("Price is invalid.");
  if (amount !== null && !PRICE_AMOUNT.test(amount)) invalid("Price is invalid.");
  const currency =
    draft.currency == null
      ? null
      : typeof draft.currency === "string"
        ? draft.currency.trim().toUpperCase()
        : invalid("Currency is invalid.");
  if (currency !== null && !CURRENCY.test(currency)) invalid("Currency is invalid.");
  const payload: MonitorObservationPayload = {
    version: MONITOR_OBSERVATION_PAYLOAD_VERSION,
    productName: nullableText(draft.productName, 300, "Product name"),
    category: nullableText(draft.category, 200, "Category"),
    price: { amount, currency },
    colorPatternIds: stringList(draft.colorPatternIds, "Color identifier"),
    colorPatternNames: stringList(draft.colorPatternNames, "Color name"),
    distinctVariationCount,
    sizes: stringList(draft.sizes, "Size"),
    lengths: stringList(draft.lengths, "Length"),
    imageUrl: httpsUrl(draft.imageUrl),
    thresholdMatch: matchMonitorCriterion(criterion, distinctVariationCount),
  };
  if (JSON.stringify(payload).length > MONITOR_MAX_OBSERVATION_PAYLOAD_CHARS) {
    invalid("Observation payload exceeds the bound.");
  }
  return payload;
}

export function normalizeMonitorObservationDraft(
  draft: MonitorObservationDraft,
  criterion: MonitorCriterion,
): {
  sourceId: string;
  familyId: string;
  productUrl: string;
  observedAt: string;
  payload: MonitorObservationPayload;
} {
  if (typeof draft.productUrl !== "string") invalid("Product URL is invalid.");
  const observed = new Date(draft.observedAt);
  if (Number.isNaN(observed.getTime())) invalid("Observation timestamp is invalid.");
  return {
    sourceId: draft.sourceId,
    familyId: draft.familyId,
    productUrl: productUrl(draft.productUrl, draft.sourceId),
    observedAt: observed.toISOString(),
    payload: buildObservationPayload(draft, criterion),
  };
}

export function payloadFromPublicObservation(
  observation: SharedPublicObservation,
  thresholdMatch: boolean | null,
): MonitorObservationPayload {
  return {
    version: MONITOR_OBSERVATION_PAYLOAD_VERSION,
    productName: observation.productName,
    category: observation.categoryName,
    price: {
      amount: observation.priceAmount,
      currency: observation.currency,
    },
    colorPatternIds: observation.colorPatternIds,
    colorPatternNames: observation.colorPatternNames,
    distinctVariationCount: observation.distinctVariationCount,
    sizes: observation.sizes,
    lengths: observation.lengths,
    imageUrl: observation.imageUrl,
    thresholdMatch,
  };
}

export function buildSharedPublicObservation(input: {
  id: string;
  source: SharedMonitorSource;
  familyId: string;
  canonicalUrl: string;
  payload: MonitorObservationPayload;
  observedAt: string;
  categoryIds: readonly string[];
  createdAt: string;
  adapterVersion?: string;
  schemaVersion?: number;
}): SharedPublicObservation {
  const adapterVersion = input.adapterVersion ?? input.source.adapterVersion;
  const schemaVersion = input.schemaVersion ?? MONITOR_PUBLIC_SCHEMA_VERSION;
  const categoryIds = [...input.categoryIds];
  const contentKey = publicObservationContentKey({
    registeredSourceId: input.source.registeredSourceId,
    familyId: input.familyId,
    adapterId: input.source.adapterId,
    adapterVersion,
    schemaVersion,
    canonicalUrl: input.canonicalUrl,
    productName: input.payload.productName,
    priceAmount: input.payload.price.amount,
    currency: input.payload.price.currency,
    colorPatternIds: input.payload.colorPatternIds,
    colorPatternNames: input.payload.colorPatternNames,
    distinctVariationCount: input.payload.distinctVariationCount,
    sizes: input.payload.sizes,
    lengths: input.payload.lengths,
    imageUrl: input.payload.imageUrl,
    observedAt: input.observedAt,
    categoryIds,
  });
  return {
    id: input.id,
    sourceId: input.source.id,
    registeredSourceId: input.source.registeredSourceId,
    familyId: input.familyId,
    adapterId: input.source.adapterId,
    adapterVersion,
    schemaVersion,
    productName: input.payload.productName,
    canonicalUrl: input.canonicalUrl,
    priceAmount: input.payload.price.amount,
    currency: input.payload.price.currency,
    colorPatternIds: input.payload.colorPatternIds,
    colorPatternNames: input.payload.colorPatternNames,
    distinctVariationCount: input.payload.distinctVariationCount,
    sizes: input.payload.sizes,
    lengths: input.payload.lengths,
    imageUrl: input.payload.imageUrl,
    categoryName: input.payload.category,
    observedAt: input.observedAt,
    provenance: {
      version: 1,
      adapterId: input.source.adapterId,
      adapterVersion,
      schemaVersion,
      categoryIds,
    },
    contentKey,
    createdAt: input.createdAt,
  };
}

export function assertClientCannotAttachPublicObservation(input: object): void {
  if ("publicObservationId" in input || "publicObservationIds" in input) {
    throw new MonitorOperationError(
      "PUBLIC_OBSERVATION_NOT_ATTACHABLE",
      "Public observations are resolved by the server.",
    );
  }
}

export function assertObservationSourceInSnapshot(
  configuration: MonitorConfiguration,
  sourceId: string,
): void {
  if (!configuration.sources.some((source) => source.sourceId === sourceId)) {
    throw new MonitorOperationError(
      "INVALID_OBSERVATION",
      "Observation source is outside the job snapshot.",
    );
  }
}

export function priceCents(amount: string): bigint | null {
  if (!PRICE_AMOUNT.test(amount)) return null;
  const [whole, fraction = ""] = amount.split(".");
  const padded = `${fraction}00`.slice(0, 2);
  return BigInt(whole ?? "0") * BigInt(100) + BigInt(padded);
}
