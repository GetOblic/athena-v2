/**
 * Normalized clothing extraction records for the local Monitor prototype.
 * Adapters fill every field they can read. Unknown values stay null.
 * Threshold matching is applied later by the generic filter.
 */

export type ExtractionAdapterId = "sfra" | "solusquare";

export type ExtractedFamily = {
  sourceWebsite: string;
  brand: string | null;
  productFamilyId: string | null;
  productName: string | null;
  category: string | null;
  productUrl: string;
  imageUrl: string | null;
  price: number | null;
  currency: string | null;
  colorPatternNames: string[];
  colorPatternIds: Array<string | null>;
  distinctVariationCount: number;
  sizeOptions: string[];
  /** Observed length axis, kept separate so it cannot inflate the color count. */
  lengthOptions: string[] | null;
  observedAt: string;
};

export type NormalizedProduct = ExtractedFamily & {
  thresholdMatch: boolean;
};

export type ExtractionError = {
  url: string;
  message: string;
};

export type DedupEvidence = {
  confirmed: boolean;
  familyId: string | null;
  urls: string[];
  colorIds: Array<Array<string | null>>;
  colorLevelDataPids: Array<string | null>;
  note: string;
};

export type LengthEvidence = {
  compared: boolean;
  urls: string[];
  lengths: string[];
  familyIds: Array<string | null>;
  colorCounts: number[];
  sameFamily: boolean | null;
  note: string;
};

export type BrowserAttempt = {
  mode: string;
  status: number | null;
  title: string | null;
  error: string | null;
};

export type BrowserRuntimeReport = {
  playwrightVersion: string;
  chromiumRevision: string;
  chromiumExecutable: string | null;
  headlessChromium: BrowserAttempt;
  headlessChrome: BrowserAttempt;
  extractionBrowser: string;
};

export type ExtractionStats = {
  requests: number;
  elapsedMs: number;
  productUrlsDiscovered: number;
  productUrlsNotOpened: number;
  familiesDiscovered: number;
  familiesAnalyzed: number;
  matchingFamilies: number;
  duplicateFamiliesRemoved: number;
  errors: ExtractionError[];
};

export type ExtractionRun = {
  sourceWebsite: string;
  adapter: ExtractionAdapterId;
  entryUrl: string;
  categoryUrl: string | null;
  minDistinctColorPatterns: number;
  observedAt: string;
  browserRuntime: BrowserRuntimeReport | null;
  stats: ExtractionStats;
  deduplication: DedupEvidence | null;
  lengthInvestigation: LengthEvidence | null;
  families: NormalizedProduct[];
  matches: NormalizedProduct[];
};
