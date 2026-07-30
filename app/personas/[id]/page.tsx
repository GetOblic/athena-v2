export const dynamic = "force-dynamic";

import Link from "next/link";
import { AthenaBrandLink } from "@/components/branding/AthenaBrandLink";
import { PersonaLifecycleStatusControl } from "@/components/personas/PersonaLifecycleStatusControl";
import { PersonaMetadataEditor } from "@/components/personas/PersonaMetadataEditor";
import { ATHENA_EXECUTIVE_CARD_OUTLINE_CLASS } from "@/components/ui/athenaExecutiveCard";
import {
  formatPersonaLocation,
  formatPersonaOpportunityScore,
  formatPersonaReferenceWebsiteDisplay,
  resolvePersonaDisplayReadiness,
} from "@/services/personas/personaDisplay";
import { normalizePersonaLifecycleStatus } from "@/services/personas/personaLifecycle";
import { requireCurrentOrganizationContext } from "@/services/organizationService";
import { getPersonaById } from "@/services/personas/personaService";
import {
  normalizeWebsiteUrl,
  resolvePersonaDisplayLabel,
} from "@/services/personas/personaUtils";

function formatDate(value: string | null | undefined) {
  if (!value) return null;
  return new Date(value).toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
  });
}

function SummaryItem({
  label,
  value,
}: {
  label: string;
  value: string | null | undefined;
}) {
  if (!value) return null;
  return (
    <div>
      <div className="text-xs uppercase tracking-[0.16em] text-white/35">
        {label}
      </div>
      <div className="mt-2 text-sm leading-6 text-white/75">{value}</div>
    </div>
  );
}

export default async function PersonaDetailsPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const { organizationId } = await requireCurrentOrganizationContext();
  const persona = await getPersonaById(id, organizationId);

  if (!persona) {
    return (
      <main className="min-h-screen bg-[var(--athena-bg)] p-10 text-white">
        <AthenaBrandLink className="mb-8" />
        <Link href="/personas" className="text-sm text-[var(--athena-orange)]">
          ← Personas
        </Link>
        <h1 className="mt-8 text-4xl font-semibold">Persona not found</h1>
      </main>
    );
  }

  const displayLabel = resolvePersonaDisplayLabel(persona);
  const location = formatPersonaLocation(persona);
  const readiness = resolvePersonaDisplayReadiness(persona.status);
  const lifecycle = normalizePersonaLifecycleStatus(persona.lifecycle_status);
  const referenceDisplay = formatPersonaReferenceWebsiteDisplay(
    persona.reference_website,
  );
  const referenceHref = normalizeWebsiteUrl(persona.reference_website);
  const scoreLabel = formatPersonaOpportunityScore(persona.opportunity_score);

  return (
    <main className="min-h-screen bg-[var(--athena-bg)] p-10 text-white">
      <AthenaBrandLink className="mb-8" />
      <Link href="/personas" className="text-sm text-[var(--athena-orange)]">
        ← Personas
      </Link>

      <div className="mt-10 flex flex-col gap-6 lg:flex-row lg:items-start lg:justify-between">
        <div className="min-w-0 flex-1">
          <div className="text-xs font-semibold uppercase tracking-[0.35em] text-[var(--athena-orange)]">
            Persona
          </div>
          <h1 className="mt-4 max-w-5xl text-5xl font-semibold tracking-tight">
            {displayLabel}
          </h1>
          {persona.short_description ? (
            <p className="mt-4 max-w-3xl text-base leading-7 text-white/50">
              {persona.short_description}
            </p>
          ) : null}
        </div>

        <PersonaLifecycleStatusControl persona={persona} />
      </div>

      <div
        className={`mt-10 rounded-[24px] ${ATHENA_EXECUTIVE_CARD_OUTLINE_CLASS} bg-[var(--athena-card)] p-8`}
      >
        <h2 className="text-lg font-semibold">Summary</h2>
        <div className="mt-6 grid gap-6 md:grid-cols-2 xl:grid-cols-3">
          <SummaryItem label="Category" value={persona.category} />
          <SummaryItem label="Location" value={location} />
          <SummaryItem label="Languages" value={persona.languages} />
          <SummaryItem label="Lifecycle" value={lifecycle} />
          <SummaryItem label="Readiness" value={readiness} />
          <SummaryItem
            label="Opportunity Score"
            value={scoreLabel === "—" ? null : scoreLabel}
          />
          <SummaryItem label="Source" value={persona.source} />
          <SummaryItem label="Created" value={formatDate(persona.created_at)} />
          <SummaryItem label="Updated" value={formatDate(persona.updated_at)} />
          {referenceDisplay ? (
            <div>
              <div className="text-xs uppercase tracking-[0.16em] text-white/35">
                Reference Website
              </div>
              <div className="mt-2 text-sm leading-6 text-white/75">
                {referenceHref ? (
                  <a
                    href={referenceHref}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="text-[var(--athena-orange)] underline underline-offset-2"
                  >
                    {referenceDisplay}
                  </a>
                ) : (
                  referenceDisplay
                )}
              </div>
            </div>
          ) : null}
        </div>
      </div>

      <div className="mt-8">
        <PersonaMetadataEditor persona={persona} />
      </div>

      <div
        className={`mt-8 rounded-[24px] ${ATHENA_EXECUTIVE_CARD_OUTLINE_CLASS} bg-[var(--athena-card)] p-8`}
      >
        <h2 className="text-lg font-semibold">Persona Intelligence</h2>
        <p className="mt-4 max-w-3xl text-sm leading-7 text-white/45">
          Persona intelligence generation will become available after the Persona
          profile is connected to Athena’s intelligence pipeline.
        </p>
      </div>
    </main>
  );
}
