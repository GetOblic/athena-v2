/**
 * Production extraction adapter contract.
 * Website-specific fetching and parsing stay behind this boundary.
 * Filtering, persistence, comparison, and job control stay outside it.
 */

export type MonitorPageFetch = (input: {
  url: string;
  registrableDomain: string;
  timeoutMs: number;
  acceptXml?: boolean;
  signal?: AbortSignal;
}) => Promise<{
  ok: boolean;
  finalUrl: string;
  status: number;
  bodyText: string | null;
  errorCode?: string;
}>;

export type MonitorAdapterCategory = {
  displayName: string;
  canonicalUrl: string;
  parentCategoryKey: string | null;
};

export type MonitorAdapterFamilyRef = {
  familyId: string;
  productUrl: string;
  categoryKey: string | null;
};

export type MonitorExtractedProduct = {
  familyId: string;
  productUrl: string;
  productName: string | null;
  category: string | null;
  priceAmount: string | null;
  currency: string | null;
  colorPatternIds: string[] | null;
  colorPatternNames: string[] | null;
  distinctVariationCount: number | null;
  sizes: string[] | null;
  lengths: string[] | null;
  imageUrl: string | null;
};

export type MonitorAdapterBlocked = {
  ok: false;
  code: "access_blocked" | "unsupported" | "fetch_failed";
  message: string;
};

export type MonitorAdapterSuccess<T> = { ok: true; value: T };

export type MonitorAdapterResult<T> = MonitorAdapterSuccess<T> | MonitorAdapterBlocked;

export type MonitorEnumerationValue = {
  families: MonitorAdapterFamilyRef[];
  done: boolean;
  resumeUrl: string | null;
  errorCode?: string;
};

export type MonitorScopeRequest =
  | {
      kind: "category";
      canonicalUrl: string;
      categoryKey: string;
    }
  | {
      kind: "whole_catalog";
      canonicalUrl: string;
      categoryUrls: readonly string[];
    };

export interface MonitorProductionAdapter {
  id: "solusquare" | "sfra";
  version: string;
  recognizes(sourceId: string): boolean;
  discoverCategories(input: {
    canonicalUrl: string;
    registrableDomain: string;
    fetchPage: MonitorPageFetch;
    timeoutMs: number;
    signal?: AbortSignal;
  }): Promise<MonitorAdapterResult<{ categories: MonitorAdapterCategory[]; complete: boolean }>>;
  enumerateScope(input: {
    scope: MonitorScopeRequest;
    registrableDomain: string;
    fetchPage: MonitorPageFetch;
    timeoutMs: number;
    signal?: AbortSignal;
    resumeUrl: string | null;
    familyLimit: number;
    alreadySeen: ReadonlySet<string>;
  }): Promise<MonitorAdapterResult<MonitorEnumerationValue>>;
  extractFamily(input: {
    familyId: string;
    productUrl: string;
    registrableDomain: string;
    fetchPage: MonitorPageFetch;
    timeoutMs: number;
    signal?: AbortSignal;
    observedAt: string;
  }): Promise<MonitorAdapterResult<MonitorExtractedProduct>>;
}
