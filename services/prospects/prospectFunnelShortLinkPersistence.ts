/**
 * service_role persistence for Prospect Funnel short links.
 * Every read and write includes the session organization id.
 */

import { randomUUID } from "node:crypto";
import { supabaseAdmin } from "@/lib/supabaseAdmin";
import type { ProspectFunnelShortLinkCta } from "@/lib/prospects/prospectFunnelShortLinkDisplay";
import { ProspectFunnelShortLinkPersistenceError } from "@/services/prospects/prospectFunnelShortLinkErrors";
import type {
  ProspectFunnelReplacementPhase,
  ProspectFunnelShortLinkKey,
  ProspectFunnelShortLinkLifecycle,
  ProspectFunnelShortLinkRow,
  ProspectFunnelShortLinkState,
  ProspectFunnelShortLinkStore,
} from "@/services/prospects/prospectFunnelShortLinks";

export const PROSPECT_FUNNEL_SHORT_LINKS_TABLE =
  "athena_prospect_funnel_short_links";

type DbError = { code?: string; message?: string } | null;

function isUniqueViolation(error: DbError): boolean {
  if (!error) return false;
  return (
    error.code === "23505" ||
    /duplicate key|unique constraint/i.test(error.message ?? "")
  );
}

function requireString(value: unknown, label: string): string {
  if (typeof value !== "string" || !value.trim()) {
    throw new ProspectFunnelShortLinkPersistenceError();
  }
  if (label.length === 0) {
    throw new ProspectFunnelShortLinkPersistenceError();
  }
  return value;
}

function optionalString(value: unknown): string | null {
  if (value == null) return null;
  return typeof value === "string" && value.trim() ? value : null;
}

function mapRow(data: Record<string, unknown>): ProspectFunnelShortLinkRow {
  const lifecycle = requireString(data.lifecycle, "lifecycle");
  const phase = optionalString(data.replacement_phase);
  const generation = data.generation;
  if (
    (lifecycle !== "pending" &&
      lifecycle !== "active" &&
      lifecycle !== "disabled" &&
      lifecycle !== "replacing") ||
    (phase !== null && phase !== "reserved" && phase !== "created") ||
    typeof generation !== "number" ||
    !Number.isInteger(generation)
  ) {
    throw new ProspectFunnelShortLinkPersistenceError();
  }

  return {
    id: requireString(data.id, "id"),
    organizationId: requireString(data.organization_id, "organization"),
    prospectId: requireString(data.prospect_id, "prospect"),
    ctaKey: requireString(data.cta_key, "cta") as ProspectFunnelShortLinkCta,
    destinationUrl: requireString(data.destination_url, "destination"),
    slug: requireString(data.slug, "slug"),
    shortUrl: optionalString(data.short_url),
    lifecycle: lifecycle as ProspectFunnelShortLinkLifecycle,
    replacementDestinationUrl: optionalString(data.replacement_destination_url),
    replacementSlug: optionalString(data.replacement_slug),
    replacementShortUrl: optionalString(data.replacement_short_url),
    replacementPhase: phase as ProspectFunnelReplacementPhase | null,
    generation,
  };
}

function toDbState(state: ProspectFunnelShortLinkState, generation: number) {
  return {
    destination_url: state.destinationUrl,
    slug: state.slug,
    short_url: state.shortUrl,
    lifecycle: state.lifecycle,
    replacement_destination_url: state.replacementDestinationUrl,
    replacement_slug: state.replacementSlug,
    replacement_short_url: state.replacementShortUrl,
    replacement_phase: state.replacementPhase,
    generation,
    updated_at: new Date().toISOString(),
  };
}

export function createSupabaseProspectFunnelShortLinkStore(): ProspectFunnelShortLinkStore {
  return {
    async get(key) {
      const { data, error } = await supabaseAdmin
        .from(PROSPECT_FUNNEL_SHORT_LINKS_TABLE)
        .select("*")
        .eq("organization_id", key.organizationId)
        .eq("prospect_id", key.prospectId)
        .eq("cta_key", key.ctaKey)
        .maybeSingle();
      if (error) throw new ProspectFunnelShortLinkPersistenceError();
      if (!data || typeof data !== "object") return null;
      return mapRow(data as Record<string, unknown>);
    },

    async insert(key, state) {
      const { data, error } = await supabaseAdmin
        .from(PROSPECT_FUNNEL_SHORT_LINKS_TABLE)
        .insert({
          id: randomUUID(),
          organization_id: key.organizationId,
          prospect_id: key.prospectId,
          cta_key: key.ctaKey,
          ...toDbState(state, 1),
        })
        .select("*")
        .maybeSingle();
      if (isUniqueViolation(error)) return { status: "conflict" };
      if (error || !data || typeof data !== "object") {
        throw new ProspectFunnelShortLinkPersistenceError();
      }
      return {
        status: "inserted",
        row: mapRow(data as Record<string, unknown>),
      };
    },

    async compareAndSet(input) {
      const { data, error } = await supabaseAdmin
        .from(PROSPECT_FUNNEL_SHORT_LINKS_TABLE)
        .update(toDbState(input.next, input.expectedGeneration + 1))
        .eq("organization_id", input.key.organizationId)
        .eq("prospect_id", input.key.prospectId)
        .eq("cta_key", input.key.ctaKey)
        .eq("generation", input.expectedGeneration)
        .select("*")
        .maybeSingle();
      if (error) throw new ProspectFunnelShortLinkPersistenceError();
      if (!data || typeof data !== "object") return null;
      return mapRow(data as Record<string, unknown>);
    },

    async delete(input) {
      const { data, error } = await supabaseAdmin
        .from(PROSPECT_FUNNEL_SHORT_LINKS_TABLE)
        .delete()
        .eq("organization_id", input.key.organizationId)
        .eq("prospect_id", input.key.prospectId)
        .eq("cta_key", input.key.ctaKey)
        .eq("generation", input.expectedGeneration)
        .select("id");
      if (error) throw new ProspectFunnelShortLinkPersistenceError();
      return Array.isArray(data) && data.length > 0;
    },
  };
}
