/**
 * Deterministic page acceptance for Crawlee-normalized documents.
 * Concise legitimate business pages are accepted; shells/errors are rejected.
 */

import {
  countWords,
  fingerprintExtractedText,
  evaluateExtractedPageUsefulness,
} from "@/services/websiteLearning/deepScrape/crawlPolicy";
import {
  hasStructuredBusinessSignal,
  looksLikeJsShell,
} from "@/services/websiteLearning/deepScrape/crawler/readabilityExtractor";
import type {
  NormalizedPageDocument,
  PageClassificationResult,
} from "@/services/websiteLearning/deepScrape/crawler/crawlerTypes";

export function needsPlaywrightFallback(input: {
  html: string;
  readableText: string;
  statusCode: number;
  contentType: string;
  structuredHasSignal: boolean;
  cheerioRejectedAsNoUsableText: boolean;
}): boolean {
  if (input.statusCode < 200 || input.statusCode >= 400) return false;
  if (!/html/i.test(input.contentType)) return false;
  if (looksLikeJsShell(input.html, input.readableText)) return true;
  const text = input.readableText.replace(/\s+/g, " ").trim();
  if (text.length < 24 && !input.structuredHasSignal) return true;
  if (input.cheerioRejectedAsNoUsableText && input.statusCode === 200) {
    return true;
  }
  return false;
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
  >;
  htmlForShellCheck?: string;
  seenContentHashes?: Set<string>;
  seenCanonicalUrls?: Set<string>;
  seenFingerprints?: Set<string>;
}): PageClassificationResult {
  const doc = input.document;
  const structuredTypes = doc.structuredBusinessData.types;
  const structuredSignal = hasStructuredBusinessSignal(doc.structuredBusinessData);

  if (
    input.seenCanonicalUrls?.has(doc.canonicalUrl) ||
    input.seenCanonicalUrls?.has(doc.finalUrl)
  ) {
    return {
      accepted: false,
      rejectionCode: "PAGE_DUPLICATE",
      needsPlaywrightFallback: false,
      extractedCharacterCount: doc.readableText.length,
      extractedWordCount: countWords(doc.readableText),
      businessSignals: [],
      structuredDataTypes: structuredTypes,
      blockedPattern: null,
      duplicateFingerprint: fingerprintExtractedText(doc.readableText),
      pageType: doc.pageType,
    };
  }

  if (input.seenContentHashes?.has(doc.contentHash)) {
    return {
      accepted: false,
      rejectionCode: "PAGE_DUPLICATE",
      needsPlaywrightFallback: false,
      extractedCharacterCount: doc.readableText.length,
      extractedWordCount: countWords(doc.readableText),
      businessSignals: [],
      structuredDataTypes: structuredTypes,
      blockedPattern: null,
      duplicateFingerprint: fingerprintExtractedText(doc.readableText),
      pageType: doc.pageType,
    };
  }

  const usefulness = evaluateExtractedPageUsefulness({
    title: doc.title,
    headings: doc.headings,
    metaDescription: doc.description,
    text: doc.readableText,
    pageType: doc.pageType,
    seenFingerprints: input.seenFingerprints,
  });

  // Structured business data can accept concise contact/service pages.
  if (
    !usefulness.accepted &&
    usefulness.rejectionCode === "PAGE_NO_USABLE_TEXT" &&
    structuredSignal
  ) {
    return {
      accepted: true,
      rejectionCode: null,
      needsPlaywrightFallback: false,
      extractedCharacterCount: Math.max(
        usefulness.extractedCharacterCount,
        doc.readableText.length,
      ),
      extractedWordCount: Math.max(
        usefulness.extractedWordCount,
        countWords(doc.readableText),
      ),
      businessSignals: [
        ...usefulness.businessSignals,
        ...structuredTypes.map((type) => `schema:${type}`),
      ],
      structuredDataTypes: structuredTypes,
      blockedPattern: null,
      duplicateFingerprint: usefulness.duplicateFingerprint,
      pageType: doc.pageType,
    };
  }

  const cheerioRejectedAsNoUsableText =
    !usefulness.accepted &&
    (usefulness.rejectionCode === "PAGE_NO_USABLE_TEXT" ||
      usefulness.rejectionCode === "PAGE_EMPTY" ||
      usefulness.rejectionCode === "PAGE_NAVIGATION_ONLY");

  const fallback = needsPlaywrightFallback({
    html: input.htmlForShellCheck ?? "",
    readableText: doc.readableText,
    statusCode: 200,
    contentType: "text/html",
    structuredHasSignal: structuredSignal,
    cheerioRejectedAsNoUsableText,
  });

  return {
    accepted: usefulness.accepted,
    rejectionCode: usefulness.rejectionCode,
    needsPlaywrightFallback: !usefulness.accepted && fallback,
    extractedCharacterCount: usefulness.extractedCharacterCount,
    extractedWordCount: usefulness.extractedWordCount,
    businessSignals: usefulness.businessSignals,
    structuredDataTypes: structuredTypes,
    blockedPattern: usefulness.blockedPattern,
    duplicateFingerprint: usefulness.duplicateFingerprint,
    pageType: doc.pageType,
  };
}
