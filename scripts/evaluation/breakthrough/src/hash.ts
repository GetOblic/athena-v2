import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";

export function sha256Text(value: string): string {
  return createHash("sha256").update(value, "utf8").digest("hex");
}

/** SHA256 of exact on-disk file bytes (no normalization). */
export function sha256FileBytes(filePath: string): string {
  const bytes = readFileSync(filePath);
  return createHash("sha256").update(bytes).digest("hex");
}
