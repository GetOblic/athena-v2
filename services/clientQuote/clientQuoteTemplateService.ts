/**
 * Licensee Master service-template catalog (EST-QUOTE-2B.2).
 * licensee_account_id always comes from the authenticated Master.
 * Masked templates stay stored and drop out of ordinary list and update.
 * No worker, model, quotation editor, or organization relationship.
 */

import type { ClientQuoteTemplateDeps } from "@/services/clientQuote/clientQuoteTemplateDeps";
import {
  parseClientQuoteTemplateBody,
  parseClientQuoteTemplatePatch,
} from "@/services/clientQuote/clientQuoteTemplateValidation";
import type {
  AthenaClientQuoteTemplate,
  ClientQuoteTemplateInput,
} from "@/services/clientQuote/clientQuoteTemplateTypes";
import {
  clientQuoteInvalid,
  clientQuoteNotFound,
  clientQuotePersistenceFailed,
  ClientQuoteOperationError,
} from "@/services/clientQuote/clientQuoteErrors";
import {
  ClientQuoteCalculationError,
  ClientQuoteValidationError,
} from "@/services/clientQuote/clientQuoteTypes";

const UUID_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

function asOperationError(error: unknown): never {
  if (error instanceof ClientQuoteOperationError) throw error;
  if (error instanceof ClientQuoteValidationError) {
    throw clientQuoteInvalid(error.details[0] ?? error.message);
  }
  if (error instanceof ClientQuoteCalculationError) {
    throw clientQuoteInvalid(error.message);
  }
  throw error;
}

function parseTemplateId(value: string): string {
  const id = value.trim();
  if (!UUID_PATTERN.test(id)) {
    throw clientQuoteNotFound("Template not found.");
  }
  return id.toLowerCase();
}

function ownedTemplate(
  template: AthenaClientQuoteTemplate | null,
  licenseeAccountId: string,
): AthenaClientQuoteTemplate | null {
  if (!template || template.licensee_account_id !== licenseeAccountId) {
    return null;
  }
  return template;
}

function activeOwnedTemplate(
  template: AthenaClientQuoteTemplate | null,
  licenseeAccountId: string,
): AthenaClientQuoteTemplate | null {
  const owned = ownedTemplate(template, licenseeAccountId);
  if (!owned || owned.deleted_at) return null;
  return owned;
}

function rowFromInput(
  input: ClientQuoteTemplateInput,
  identity: {
    id: string;
    licenseeAccountId: string;
    deletedAt: string | null;
    createdAt: string;
    updatedAt: string;
  },
): AthenaClientQuoteTemplate {
  return {
    id: identity.id,
    licensee_account_id: identity.licenseeAccountId,
    name: input.name,
    description: input.description,
    quantity_coefficient: input.quantity.coefficient,
    quantity_scale: input.quantity.scale,
    unit_price_minor: input.unitPriceMinor,
    currency_code: input.currencyCode,
    billing_frequency: input.billingFrequency,
    deleted_at: identity.deletedAt,
    created_at: identity.createdAt,
    updated_at: identity.updatedAt,
  };
}

export async function listClientQuoteTemplatesForMaster(
  masterUserId: string,
  deps: ClientQuoteTemplateDeps,
): Promise<AthenaClientQuoteTemplate[]> {
  const master = await deps.requireMaster(masterUserId);
  const templates = await deps.listTemplates(master.licenseeAccountId);
  return templates
    .filter(
      (template) =>
        template.licensee_account_id === master.licenseeAccountId &&
        !template.deleted_at,
    )
    .sort(
      (a, b) =>
        b.created_at.localeCompare(a.created_at) || b.id.localeCompare(a.id),
    );
}

export async function createClientQuoteTemplateForMaster(input: {
  masterUserId: string;
  body: unknown;
  deps: ClientQuoteTemplateDeps;
}): Promise<AthenaClientQuoteTemplate> {
  const master = await input.deps.requireMaster(input.masterUserId);
  let fields: ClientQuoteTemplateInput;
  try {
    fields = parseClientQuoteTemplateBody(input.body);
  } catch (error) {
    asOperationError(error);
  }
  const now = input.deps.now();
  const saved = await input.deps.insertTemplate(
    rowFromInput(fields, {
      id: input.deps.newId(),
      licenseeAccountId: master.licenseeAccountId,
      deletedAt: null,
      createdAt: now,
      updatedAt: now,
    }),
  );
  const owned = activeOwnedTemplate(saved, master.licenseeAccountId);
  if (!owned) throw clientQuotePersistenceFailed("Could not save the template.");
  return owned;
}

export async function updateClientQuoteTemplateForMaster(input: {
  masterUserId: string;
  templateId: string;
  body: unknown;
  deps: ClientQuoteTemplateDeps;
}): Promise<AthenaClientQuoteTemplate> {
  const master = await input.deps.requireMaster(input.masterUserId);
  const templateId = parseTemplateId(input.templateId);
  const current = activeOwnedTemplate(
    await input.deps.getTemplate(templateId, master.licenseeAccountId),
    master.licenseeAccountId,
  );
  if (!current) throw clientQuoteNotFound("Template not found.");
  let fields: ClientQuoteTemplateInput;
  try {
    const patch = parseClientQuoteTemplatePatch(input.body);
    fields = parseClientQuoteTemplateBody({
      name: patch.name ?? current.name,
      description: patch.description ?? current.description,
      quantity: patch.quantity ?? {
        coefficient: current.quantity_coefficient,
        scale: current.quantity_scale,
      },
      unitPriceMinor: patch.unitPriceMinor ?? current.unit_price_minor,
      currencyCode: patch.currencyCode ?? current.currency_code,
      billingFrequency: patch.billingFrequency ?? current.billing_frequency,
    });
  } catch (error) {
    asOperationError(error);
  }
  const saved = await input.deps.updateTemplate(
    rowFromInput(fields, {
      id: current.id,
      licenseeAccountId: master.licenseeAccountId,
      deletedAt: null,
      createdAt: current.created_at,
      updatedAt: input.deps.now(),
    }),
  );
  const owned = activeOwnedTemplate(saved, master.licenseeAccountId);
  if (!owned) throw clientQuoteNotFound("Template not found.");
  return owned;
}

export async function maskClientQuoteTemplateForMaster(input: {
  masterUserId: string;
  templateId: string;
  deps: ClientQuoteTemplateDeps;
}): Promise<{ alreadyMasked: boolean }> {
  const master = await input.deps.requireMaster(input.masterUserId);
  const templateId = parseTemplateId(input.templateId);
  const masked = await input.deps.maskTemplate(
    templateId,
    master.licenseeAccountId,
    input.deps.now(),
  );
  const owned = ownedTemplate(
    masked?.template ?? null,
    master.licenseeAccountId,
  );
  if (!masked || !owned || !owned.deleted_at) {
    throw clientQuoteNotFound("Template not found.");
  }
  return { alreadyMasked: masked.alreadyMasked };
}
