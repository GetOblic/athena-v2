/**
 * Server-side template dependencies.
 * The service never constructs a Supabase client. Routes supply the
 * default adapter. Tests supply an in-memory adapter.
 */

import type { AthenaClientQuoteTemplate } from "@/services/clientQuote/clientQuoteTemplateTypes";

export type ClientQuoteTemplateMasterContext = {
  licenseeAccountId: string;
  masterUserId: string;
};

export type ClientQuoteTemplateMaskResult = {
  template: AthenaClientQuoteTemplate;
  alreadyMasked: boolean;
};

export type ClientQuoteTemplateDeps = {
  requireMaster(
    masterUserId: string,
  ): Promise<ClientQuoteTemplateMasterContext>;
  insertTemplate(
    template: AthenaClientQuoteTemplate,
  ): Promise<AthenaClientQuoteTemplate>;
  /**
   * Update one active owned template.
   * A masked row or another Licensee's row returns null and is not written.
   */
  updateTemplate(
    template: AthenaClientQuoteTemplate,
  ): Promise<AthenaClientQuoteTemplate | null>;
  /** Owned row, including a masked row. Null when the Licensee does not own it. */
  getTemplate(
    id: string,
    licenseeAccountId: string,
  ): Promise<AthenaClientQuoteTemplate | null>;
  listTemplates(
    licenseeAccountId: string,
  ): Promise<AthenaClientQuoteTemplate[]>;
  /**
   * Soft-mask one owned template. A second call must not write again.
   * Does not delete the row.
   */
  maskTemplate(
    id: string,
    licenseeAccountId: string,
    deletedAt: string,
  ): Promise<ClientQuoteTemplateMaskResult | null>;
  now(): string;
  newId(): string;
};
