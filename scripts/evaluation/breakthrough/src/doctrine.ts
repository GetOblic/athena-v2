import { readFileSync } from "node:fs";
import {
  DOCTRINE_APPEND_DELIMITER,
  DOCTRINE_FILENAME,
} from "./constants";
import { sha256Text } from "./hash";
import { doctrinePath } from "./paths";

let cachedDoctrine: string | null = null;

export function loadFrozenDoctrine(cwd = process.cwd()): string {
  if (cachedDoctrine !== null) {
    return cachedDoctrine;
  }
  const raw = readFileSync(doctrinePath(cwd), "utf8");
  cachedDoctrine = raw.replace(/\r\n/g, "\n").trimEnd() + "\n";
  return cachedDoctrine;
}

export function doctrineHash(cwd = process.cwd()): string {
  return sha256Text(loadFrozenDoctrine(cwd));
}

/**
 * Append frozen Breakthrough Doctrine K exactly once to a Standard stage prompt.
 * Standard prompts must never call this.
 */
export function appendBreakthroughDoctrine(
  standardPrompt: string,
  doctrineText?: string,
): string {
  const doctrine = (doctrineText ?? loadFrozenDoctrine()).trimEnd();
  if (!standardPrompt.trim()) {
    throw new Error("Cannot append Breakthrough doctrine to an empty Standard prompt.");
  }
  if (standardPrompt.includes("ATHENA BREAKTHROUGH DOCTRINE")) {
    throw new Error(
      "Standard prompt already contains Breakthrough doctrine — refusing double-append.",
    );
  }
  return `${standardPrompt.trimEnd()}${DOCTRINE_APPEND_DELIMITER}${doctrine}\n`;
}

export function resetDoctrineCacheForTests() {
  cachedDoctrine = null;
}

export { DOCTRINE_FILENAME };
