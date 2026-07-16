/**
 * Bounded cross-page boilerplate detection for Deep Scrape.
 * Deterministic; no ML. Operates on sentence/block fingerprints only.
 */

import { createHash } from "node:crypto";

const MIN_BLOCK_CHARS = 40;
const MAX_BLOCKS_PER_PAGE = 80;
const BOILERPLATE_FREQUENCY = 0.6; // present on ≥60% of pages with enough samples

export function splitContentBlocks(text: string): string[] {
  const normalized = text.replace(/\s+/g, " ").trim();
  if (!normalized) return [];

  const raw = normalized
    .split(/(?<=[.!?])\s+|\n+/)
    .map((part) => part.replace(/\s+/g, " ").trim())
    .filter((part) => part.length >= MIN_BLOCK_CHARS);

  const blocks: string[] = [];
  for (const part of raw) {
    if (blocks.length >= MAX_BLOCKS_PER_PAGE) break;
    blocks.push(part);
  }
  return blocks;
}

export function blockFingerprint(block: string): string {
  const normalized = block.toLowerCase().replace(/\s+/g, " ").trim();
  return createHash("sha256").update(normalized).digest("hex").slice(0, 16);
}

export function buildBoilerplateFingerprintSet(
  pageTexts: string[],
): Set<string> {
  if (pageTexts.length < 3) return new Set();

  const counts = new Map<string, number>();
  for (const text of pageTexts) {
    const seenOnPage = new Set<string>();
    for (const block of splitContentBlocks(text)) {
      const fp = blockFingerprint(block);
      if (seenOnPage.has(fp)) continue;
      seenOnPage.add(fp);
      counts.set(fp, (counts.get(fp) ?? 0) + 1);
    }
  }

  const threshold = Math.max(
    3,
    Math.ceil(pageTexts.length * BOILERPLATE_FREQUENCY),
  );
  const boilerplate = new Set<string>();
  for (const [fp, count] of counts) {
    if (count >= threshold) boilerplate.add(fp);
  }
  return boilerplate;
}

export function stripBoilerplateBlocks(
  text: string,
  boilerplateFingerprints: Set<string>,
): {
  text: string;
  preChars: number;
  postChars: number;
  removedBlocks: number;
} {
  const preChars = text.replace(/\s+/g, " ").trim().length;
  if (!boilerplateFingerprints.size) {
    return { text: text.trim(), preChars, postChars: preChars, removedBlocks: 0 };
  }

  const kept: string[] = [];
  let removedBlocks = 0;
  for (const block of splitContentBlocks(text)) {
    if (boilerplateFingerprints.has(blockFingerprint(block))) {
      removedBlocks += 1;
      continue;
    }
    kept.push(block);
  }

  // If stripping would erase almost everything, keep original (homepage-only facts).
  const candidate = kept.join(" ").replace(/\s+/g, " ").trim();
  if (candidate.length < 40 && preChars >= 40) {
    return { text: text.trim(), preChars, postChars: preChars, removedBlocks: 0 };
  }

  return {
    text: candidate || text.trim(),
    preChars,
    postChars: candidate.length,
    removedBlocks,
  };
}

export function hashMeaningfulContent(text: string): string {
  const normalized = text.toLowerCase().replace(/\s+/g, " ").trim();
  return createHash("sha256").update(normalized).digest("hex");
}
