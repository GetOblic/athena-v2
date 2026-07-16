/**
 * Deterministic page acceptance with template-suspicion → Playwright fallback.
 */

import {
  countWords,
  fingerprintExtractedText,
  evaluateExtractedPageUsefulness,
} from "@/services/websiteLearning/deepScrape/crawlPolicy";
import {
  hasStructuredBusinessSignal,
  htmlSuggestsUniqueContent,
  looksLikeJsShell,
} from "@/services/websiteLearning/deepScrape/crawler/readabilityExtractor";
import type {
  NormalizedPageDocument,
  PageClassificationResult,
} from "@/services/websiteLearning/deepScrape/crawler/crawlerTypes";

export type DuplicateBasis =
  | "canonical_url"
  | "final_url"
  | "meaningful_content_hash"
  | "near_duplicate"
  | null;

export type ExtendedPageClassification = PageClassificationResult & {
  duplicateBasis: DuplicateBasis;
  duplicateOfPath: string | null;
  rejectionDetailCode: string | null;
  preBoilerplateChars: number;
  postBoilerplateChars: number;
};

export function needsPlaywrightFallback(input: {
  html: string;
  readableText: string;
  meaningfulText?: string;
  statusCode: number;
  contentType: string;
  structuredHasSignal: boolean;
  cheerioRejectedAsNoUsableText: boolean;
  suspectedTemplateDuplicate: boolean;
  titleSuggestsUnique: boolean;
}): boolean {
  if (input.statusCode < 200 || input.statusCode >= 400) return false;
  if (!/html/i.test(input.contentType)) return false;
  if (input.suspectedTemplateDuplicate) return true;
  if (looksLikeJsShell(input.html, input.readableText)) return true;
  const text = (input.meaningfulText ?? input.readableText)
    .replace(/\s+/g, " ")
    .trim();
  if (text.length < 24 && !input.structuredHasSignal) return true;
  if (input.cheerioRejectedAsNoUsableText && input.statusCode === 200) {
    return true;
  }
  if (
    input.titleSuggestsUnique &&
    text.length < 120 &&
    htmlSuggestsUniqueContent(input.html)
  ) {
    return true;
  }
  if (text.length < 120 && htmlSuggestsUniqueContent(input.html)) {
    return true;
  }
  return false;
}

function pathOf(url: string): string {
  try {
    return new URL(url).pathname || "/";
  } catch {
    return "/";
  }
}

export function classifyNormalizedPage(input: {
  document: Pick<
    NormalizedPageDocument,
    | "title"
    | "description"
    | "headings"
    | "readableText"
    | "pageType"
    | "structuredBusinessData"
    | "contentHash"
    | "canonicalUrl"
    | "finalUrl"
  > & {
    meaningfulText?: string;
    selfCanonical?: boolean;
    preBoilerplateChars?: number;
    postBoilerplateChars?: number;
  };
  htmlForShellCheck?: string;
  seenContentHashes?: Map<string, string>;
  seenCanonicalUrls?: Map<string, string>;
  seenFinalUrls?: Map<string, string>;
  seenFingerprints?: Set<string>;
  alreadyRenderedWithBrowser?: boolean;
}): ExtendedPageClassification {
  const doc = input.document;
  const structuredTypes = doc.structuredBusinessData.types;
  const structuredSignal = hasStructuredBusinessSignal(doc.structuredBusinessData);
  const meaningful = (doc.meaningfulText ?? doc.readableText).trim();
  const preBoilerplateChars =
    doc.preBoilerplateChars ?? meaningful.length;
  const postBoilerplateChars =
    doc.postBoilerplateChars ?? meaningful.length;

  const base = {
    extractedCharacterCount: meaningful.length || doc.readableText.length,
    extractedWordCount: countWords(meaningful || doc.readableText),
    businessSignals: [] as string[],
    structuredDataTypes: structuredTypes,
    blockedPattern: null as string | null,
    duplicateFingerprint: fingerprintExtractedText(meaningful || doc.readableText),
    pageType: doc.pageType,
    preBoilerplateChars,
    postBoilerplateChars,
  };

  if (input.seenFinalUrls?.has(doc.finalUrl)) {
    return {
      ...base,
      accepted: false,
      rejectionCode: "PAGE_DUPLICATE",
      rejectionDetailCode: null,
      needsPlaywrightFallback: false,
      duplicateBasis: "final_url",
      duplicateOfPath: pathOf(input.seenFinalUrls.get(doc.finalUrl) ?? doc.finalUrl),
    };
  }

  // Only treat canonical as identity when it is a self-canonical for this page.
  if (
    doc.selfCanonical !== false &&
    input.seenCanonicalUrls?.has(doc.canonicalUrl) &&
    doc.canonicalUrl === doc.finalUrl
  ) {
    return {
      ...base,
      accepted: false,
      rejectionCode: "PAGE_DUPLICATE",
      rejectionDetailCode: null,
      needsPlaywrightFallback: false,
      duplicateBasis: "canonical_url",
      duplicateOfPath: pathOf(
        input.seenCanonicalUrls.get(doc.canonicalUrl) ?? doc.canonicalUrl,
      ),
    };
  }

  const priorHashPath = input.seenContentHashes?.get(doc.contentHash);
  if (priorHashPath) {
    const suspectedTemplate =
      pathOf(priorHashPath) !== pathOf(doc.finalUrl) &&
      !input.alreadyRenderedWithBrowser;
    return {
      ...base,
      accepted: false,
      rejectionCode: suspectedTemplate
        ? "CHEERIO_SUSPECTED_TEMPLATE_EXTRACTION"
        : "PAGE_DUPLICATE",
      rejectionDetailCode: suspectedTemplate
        ? "CHEERIO_SUSPECTED_TEMPLATE_EXTRACTION"
        : null,
      needsPlaywrightFallback: suspectedTemplate,
      duplicateBasis: "meaningful_content_hash",
      duplicateOfPath: pathOf(priorHashPath),
    };
  }

  const usefulness = evaluateExtractedPageUsefulness({
    title: doc.title,
    headings: doc.headings,
    metaDescription: doc.description,
    text: meaningful || doc.readableText,
    pageType: doc.pageType,
    seenFingerprints: input.seenFingerprints,
  });

  if (
    !usefulness.accepted &&
    usefulness.rejectionCode === "PAGE_NO_USABLE_TEXT" &&
    structuredSignal
  ) {
    return {
      ...base,
      accepted: true,
      rejectionCode: null,
      rejectionDetailCode: null,
      needsPlaywrightFallback: false,
      businessSignals: [
        ...usefulness.businessSignals,
        ...structuredTypes.map((type) => `schema:${type}`),
      ],
      duplicateBasis: null,
      duplicateOfPath: null,
      extractedCharacterCount: Math.max(
        usefulness.extractedCharacterCount,
        meaningful.length,
      ),
      extractedWordCount: Math.max(
        usefulness.extractedWordCount,
        countWords(meaningful),
      ),
      duplicateFingerprint: usefulness.duplicateFingerprint,
    };
  }

  const cheerioRejectedAsNoUsableText =
    !usefulness.accepted &&
    (usefulness.rejectionCode === "PAGE_NO_USABLE_TEXT" ||
      usefulness.rejectionCode === "PAGE_EMPTY" ||
      usefulness.rejectionCode === "PAGE_NAVIGATION_ONLY");

  const titleSuggestsUnique = Boolean(
    (doc.title && doc.title.length > 8) ||
      (doc.headings && doc.headings.length > 0),
  );

  const fallback = needsPlaywrightFallback({
    html: input.htmlForShellCheck ?? "",
    readableText: doc.readableText,
    meaningfulText: meaningful,
    statusCode: 200,
    contentType: "text/html",
    structuredHasSignal: structuredSignal,
    cheerioRejectedAsNoUsableText,
    suspectedTemplateDuplicate: false,
    titleSuggestsUnique,
  });

  return {
    ...base,
    accepted: usefulness.accepted,
    rejectionCode: usefulness.rejectionCode,
    rejectionDetailCode: null,
    needsPlaywrightFallback:
      !input.alreadyRenderedWithBrowser && !usefulness.accepted && fallback,
    businessSignals: usefulness.businessSignals,
    blockedPattern: usefulness.blockedPattern,
    duplicateFingerprint: usefulness.duplicateFingerprint,
    duplicateBasis: null,
    duplicateOfPath: null,
  };
}
