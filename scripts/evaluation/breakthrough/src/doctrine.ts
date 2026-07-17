import { existsSync, readFileSync, statSync } from "node:fs";
import {
  DOCTRINE_APPEND_DELIMITER,
  DOCTRINE_FILENAME,
  DOCTRINE_V1_FILENAME,
  DOCTRINE_V2_FILENAME,
  PINNED_DOCTRINE_V1_SHA256,
  PINNED_DOCTRINE_V2_SHA256,
  type DoctrineVersion,
} from "./constants";
import { sha256FileBytes, sha256Text } from "./hash";
import { doctrinePath } from "./paths";

const cachedDoctrine: Partial<Record<DoctrineVersion, string>> = {};

function pinnedHash(version: DoctrineVersion): string {
  return version === "v2"
    ? PINNED_DOCTRINE_V2_SHA256
    : PINNED_DOCTRINE_V1_SHA256;
}

/**
 * Validate on-disk doctrine file against the pinned exact-byte SHA256.
 * Throws on missing, empty, or hash mismatch.
 */
export function assertDoctrineFilePinned(
  version: DoctrineVersion,
  cwd = process.cwd(),
): { path: string; sha256: string } {
  const path = doctrinePath(cwd, version);
  if (!existsSync(path)) {
    throw new Error(`Doctrine ${version} file missing at ${path}`);
  }
  const size = statSync(path).size;
  if (size <= 0) {
    throw new Error(`Doctrine ${version} file is empty at ${path}`);
  }
  const sha256 = sha256FileBytes(path);
  const expected = pinnedHash(version);
  if (sha256 !== expected) {
    throw new Error(
      `Doctrine ${version} SHA256 mismatch. expected=${expected} actual=${sha256}`,
    );
  }
  return { path, sha256 };
}

export function loadFrozenDoctrine(
  cwd = process.cwd(),
  version: DoctrineVersion = "v1",
): string {
  const cached = cachedDoctrine[version];
  if (cached !== undefined) {
    return cached;
  }
  assertDoctrineFilePinned(version, cwd);
  const raw = readFileSync(doctrinePath(cwd, version), "utf8");
  const normalized = raw.replace(/\r\n/g, "\n").trimEnd() + "\n";
  if (!normalized.trim()) {
    throw new Error(`Doctrine ${version} normalized content is empty.`);
  }
  cachedDoctrine[version] = normalized;
  return normalized;
}

export function doctrineHash(
  cwd = process.cwd(),
  version: DoctrineVersion = "v1",
): string {
  // Report pinned file-byte hash (authoritative for validation).
  return assertDoctrineFilePinned(version, cwd).sha256;
}

export function doctrineContentHash(
  cwd = process.cwd(),
  version: DoctrineVersion = "v1",
): string {
  return sha256Text(loadFrozenDoctrine(cwd, version));
}

/**
 * Append frozen Breakthrough Doctrine exactly once to a Standard stage prompt.
 * Standard prompts must never call this.
 */
export function appendBreakthroughDoctrine(
  standardPrompt: string,
  doctrineText?: string,
  version: DoctrineVersion = "v1",
): string {
  const doctrine = (
    doctrineText ?? loadFrozenDoctrine(process.cwd(), version)
  ).trimEnd();
  if (!doctrine.trim()) {
    throw new Error("Cannot append empty Breakthrough doctrine.");
  }
  if (!standardPrompt.trim()) {
    throw new Error(
      "Cannot append Breakthrough doctrine to an empty Standard prompt.",
    );
  }
  if (standardPrompt.includes("ATHENA BREAKTHROUGH DOCTRINE")) {
    throw new Error(
      "Standard prompt already contains Breakthrough doctrine — refusing double-append.",
    );
  }
  return `${standardPrompt.trimEnd()}${DOCTRINE_APPEND_DELIMITER}${doctrine}\n`;
}

export function resetDoctrineCacheForTests() {
  for (const key of Object.keys(cachedDoctrine) as DoctrineVersion[]) {
    delete cachedDoctrine[key];
  }
}

export {
  DOCTRINE_FILENAME,
  DOCTRINE_V1_FILENAME,
  DOCTRINE_V2_FILENAME,
  PINNED_DOCTRINE_V1_SHA256,
  PINNED_DOCTRINE_V2_SHA256,
};
