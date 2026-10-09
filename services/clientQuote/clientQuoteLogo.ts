/**
 * Quote-owned logo paths inside the private client-brand-assets bucket.
 * Paths stay outside the live identity/logo folder so a later logo
 * replacement does not remove the issued copy.
 */

import { extensionForBrandLogoMime } from "@/services/identity/brandIdentity";
import type { ClientQuoteLogoMimeType } from "@/services/clientQuote/clientQuoteTypes";

const UUID_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export function buildClientQuoteLogoObjectPath(input: {
  quoteId: string;
  mimeType: ClientQuoteLogoMimeType;
  objectId: string;
}): string {
  const quoteId = input.quoteId.trim().toLowerCase();
  if (!UUID_PATTERN.test(quoteId)) {
    throw new Error("Invalid quote id for logo storage.");
  }
  const objectId = input.objectId.trim();
  if (
    !objectId ||
    objectId.includes("/") ||
    objectId.includes("\\") ||
    objectId.includes("..") ||
    objectId.includes(" ")
  ) {
    throw new Error("Invalid logo object id.");
  }
  const ext = extensionForBrandLogoMime(input.mimeType);
  return `quotes/${quoteId}/logo/${objectId}.${ext}`;
}

/** Removal is limited to the quote folder. Identity logos are rejected. */
export function assertClientQuoteLogoRemovalPath(
  storagePath: string,
  quoteId: string,
): string {
  const id = quoteId.trim().toLowerCase();
  if (!UUID_PATTERN.test(id)) {
    throw new Error("Invalid quote id for logo removal.");
  }
  const path = storagePath.trim();
  const prefix = `quotes/${id}/logo/`;
  if (
    !path.startsWith(prefix) ||
    path.slice(prefix.length).length === 0 ||
    path.includes("..") ||
    path.includes("\\") ||
    path.includes("//") ||
    path.slice(prefix.length).includes("/")
  ) {
    throw new Error("Logo removal path is outside the quotation.");
  }
  return path;
}
