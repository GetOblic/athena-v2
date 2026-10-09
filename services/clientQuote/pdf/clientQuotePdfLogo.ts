/**
 * Quote-owned logo bytes for the PDF.
 * The object is the frozen copy in client-brand-assets.
 * Bytes are embedded only when the SHA-256 matches the snapshot
 * and PDFKit can draw the format. WebP is omitted. The live
 * organization logo is never substituted.
 */

import { createHash, timingSafeEqual } from "node:crypto";
import { BRAND_LOGO_BUCKET, BRAND_LOGO_MAX_BYTES } from "@/services/identity/brandIdentity";
import { assertClientQuoteLogoRemovalPath } from "@/services/clientQuote/clientQuoteLogo";
import type { ClientQuoteIssuedLogoSnapshot } from "@/services/clientQuote/clientQuoteTypes";

export type ClientQuotePdfImage = {
  bytes: Buffer;
  mimeType: "image/png" | "image/jpeg";
};

export type ClientQuotePdfLogoDownload = (
  storagePath: string,
) => Promise<{ bytes: Buffer; mimeType: string } | null>;

export type ClientQuotePdfLogoOmitReason =
  | "absent"
  | "invalid_path"
  | "unavailable"
  | "too_large"
  | "hash_mismatch"
  | "webp"
  | "unsupported";

function sha256Hex(bytes: Buffer): string {
  return createHash("sha256").update(bytes).digest("hex");
}

export function clientQuotePdfLogoHashMatches(
  bytes: Buffer,
  expectedHash: string,
): boolean {
  const actual = sha256Hex(bytes);
  const expected = expectedHash.trim().toLowerCase();
  if (!/^[0-9a-f]{64}$/.test(expected) || actual.length !== expected.length) {
    return false;
  }
  return timingSafeEqual(Buffer.from(actual), Buffer.from(expected));
}

export function sniffClientQuotePdfImage(
  bytes: Buffer,
): "image/png" | "image/jpeg" | "image/webp" | null {
  if (
    bytes.length >= 12 &&
    bytes.toString("ascii", 0, 4) === "RIFF" &&
    bytes.toString("ascii", 8, 12) === "WEBP"
  ) {
    return "image/webp";
  }
  if (
    bytes.length >= 8 &&
    bytes[0] === 0x89 &&
    bytes[1] === 0x50 &&
    bytes[2] === 0x4e &&
    bytes[3] === 0x47
  ) {
    return "image/png";
  }
  if (bytes.length >= 3 && bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff) {
    return "image/jpeg";
  }
  return null;
}

export async function resolveClientQuotePdfLogo(input: {
  quoteId: string;
  logo: ClientQuoteIssuedLogoSnapshot | null;
  download: ClientQuotePdfLogoDownload;
}): Promise<{ image: ClientQuotePdfImage | null; reason: ClientQuotePdfLogoOmitReason | null }> {
  const logo = input.logo;
  if (!logo) return { image: null, reason: "absent" };

  let storagePath: string;
  try {
    storagePath = assertClientQuoteLogoRemovalPath(logo.storagePath, input.quoteId);
  } catch {
    console.warn("[CLIENT_QUOTE_PDF] logo_omitted", { reason: "invalid_path" });
    return { image: null, reason: "invalid_path" };
  }

  let downloaded: { bytes: Buffer; mimeType: string } | null = null;
  try {
    downloaded = await input.download(storagePath);
  } catch {
    console.warn("[CLIENT_QUOTE_PDF] logo_omitted", { reason: "unavailable" });
    return { image: null, reason: "unavailable" };
  }
  if (!downloaded?.bytes?.length) {
    console.warn("[CLIENT_QUOTE_PDF] logo_omitted", { reason: "unavailable" });
    return { image: null, reason: "unavailable" };
  }
  if (downloaded.bytes.length > BRAND_LOGO_MAX_BYTES) {
    console.warn("[CLIENT_QUOTE_PDF] logo_omitted", { reason: "too_large" });
    return { image: null, reason: "too_large" };
  }
  if (!clientQuotePdfLogoHashMatches(downloaded.bytes, logo.contentHash)) {
    console.warn("[CLIENT_QUOTE_PDF] logo_omitted", { reason: "hash_mismatch" });
    return { image: null, reason: "hash_mismatch" };
  }

  const sniffed = sniffClientQuotePdfImage(downloaded.bytes);
  if (sniffed === "image/webp") {
    console.warn("[CLIENT_QUOTE_PDF] logo_omitted", { reason: "webp" });
    return { image: null, reason: "webp" };
  }
  if (sniffed !== "image/png" && sniffed !== "image/jpeg") {
    console.warn("[CLIENT_QUOTE_PDF] logo_omitted", { reason: "unsupported" });
    return { image: null, reason: "unsupported" };
  }
  if (sniffed !== logo.mimeType) {
    console.warn("[CLIENT_QUOTE_PDF] logo_omitted", { reason: "unsupported" });
    return { image: null, reason: "unsupported" };
  }

  return { image: { bytes: downloaded.bytes, mimeType: sniffed }, reason: null };
}

export async function downloadClientQuoteLogoFromStorage(
  storagePath: string,
): Promise<{ bytes: Buffer; mimeType: string } | null> {
  const { supabaseAdmin } = await import("@/lib/supabaseAdmin");
  const { data, error } = await supabaseAdmin.storage
    .from(BRAND_LOGO_BUCKET)
    .download(storagePath);
  if (error || !data) {
    console.warn("[CLIENT_QUOTE_PDF] logo_omitted", { reason: "unavailable" });
    return null;
  }
  const bytes = Buffer.from(await data.arrayBuffer());
  return { bytes, mimeType: data.type || "" };
}
