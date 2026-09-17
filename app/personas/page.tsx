export const dynamic = "force-dynamic";

import Link from "next/link";
import { CheckCircle2, LoaderCircle, UserPlus, Users } from "lucide-react";
import { TenantAppShell } from "@/components/dashboard/TenantAppShell";
import { PersonasLibraryClient } from "@/components/personas/PersonasLibraryClient";
import { TractionPageHeader } from "@/components/traction/TractionPageHeader";
import { TractionSiblingNav } from "@/components/traction/TractionSiblingNav";
import { deriveAudienceLibrarySummary } from "@/lib/personas/audienceLibrarySummary";
import { interpolateTenantMessage } from "@/lib/tenantI18n/interpolate";
import { getTenantLocalization } from "@/lib/tenantI18n/getTenantLocalization";
import {
  shouldShowFreeAudienceContinuation,
  shouldShowPersonaCreate,
} from "@/lib/personas/freeAudiencePresentation";
import { UpgradeCompletionCard } from "@/components/upgrade/UpgradeCompletionCard";
import { audienceUpgradeContent } from "@/lib/upgrade/freeFeatureUpgradePresentation";
import {
  PERSONA_HEADER_CREATE_CLASS,
  PERSONA_SUMMARY_ITEM_CLASS,
  PERSONA_SUMMARY_STRIP_CLASS,
} from "@/lib/personas/personaPagePresentation";
import { requireCurrentOrganizationContext } from "@/services/organizationService";
import { loadFreeAudiencePageState } from "@/services/personas/freeAudiencePageState";
import { attachPersonaLibraryConfidence } from "@/services/personas/personaLibraryConfidence";
import { enrichPersonasForLibrary } from "@/services/personas/personaLibraryEnrichment";
import { getPersonas } from "@/services/personas/personaService";

export default async function PersonasPage() {
  const { organizationId } = await requireCurrentOrganizationContext();
  const [{ language, messages }, freeAudience] = await Promise.all([
    getTenantLocalization(),
    loadFreeAudiencePageState(),
  ]);
  const copy = messages.personas;
  const { presentation, audience: _audience, ...freeProgression } = freeAudience;
  const showCreate = shouldShowPersonaCreate(presentation);
  const freeNote =
    presentation === "available"
      ? copy.free.availableContext
      : presentation === "reserved"
        ? copy.free.reservedNote
        : presentation === "consumed"
          ? copy.free.completedNote
          : null;

  let personas: ReturnType<typeof enrichPersonasForLibrary> = [];
  let loadError: string | null = null;

  try {
    const raw = await getPersonas(organizationId);
    personas = await attachPersonaLibraryConfidence(
      enrichPersonasForLibrary(raw),
      raw,
      organizationId,
    );
  } catch (error) {
    console.error("[PERSONAS_LIBRARY] load_failed", error);
    loadError =
      error instanceof Error ? error.message : copy.loadFailed;
  }

  const counts = deriveAudienceLibrarySummary(personas);
  const traction = copy.traction;

  return (
    <TenantAppShell
      currentPath="/personas"
      messages={messages}
      {...freeProgression}
    >
      <TractionPageHeader
        eyebrow={copy.eyebrow}
        title={copy.title}
        question={copy.question}
        subtitle={copy.subtitle}
        action={
          showCreate ? (
          <Link href="/personas/import" className={PERSONA_HEADER_CREATE_CLASS}>
            <UserPlus className="size-4" aria-hidden="true" />
            {copy.list.createCta}
          </Link>
          ) : null
        }
      >
        <TractionSiblingNav
          links={[
            {
              href: "/personas",
              label: copy.traction.audiences,
              help: copy.traction.audiencesHelp,
              current: true,
            },
            {
              href: "/ads",
              label: copy.traction.advertising,
              help: copy.traction.advertisingHelp,
            },
            {
              href: "/social-planner",
              label: copy.traction.socialContent,
              help: copy.traction.socialHelp,
            },
          ]}
        />
        {counts.total > 0 ? (
          <div className={PERSONA_SUMMARY_STRIP_CLASS}>
            <span className={PERSONA_SUMMARY_ITEM_CLASS}>
              <Users className="size-3.5 text-violet-300" aria-hidden="true" />
              {interpolateTenantMessage(
                counts.total === 1
                  ? traction.audiencesOne
                  : traction.audiencesMany,
                { count: counts.total },
              )}
            </span>
            {counts.ready > 0 ? (
              <span className={PERSONA_SUMMARY_ITEM_CLASS}>
                <CheckCircle2
                  className="size-3.5 text-[var(--athena-success)]"
                  aria-hidden="true"
                />
                {interpolateTenantMessage(
                  counts.ready === 1 ? traction.readyOne : traction.readyMany,
                  { count: counts.ready },
                )}
              </span>
            ) : null}
            {counts.generating > 0 ? (
              <span className={PERSONA_SUMMARY_ITEM_CLASS}>
                <LoaderCircle
                  className="size-3.5 text-amber-200"
                  aria-hidden="true"
                />
                {interpolateTenantMessage(
                  counts.generating === 1
                    ? traction.generatingOne
                    : traction.generatingMany,
                  { count: counts.generating },
                )}
              </span>
            ) : null}
          </div>
        ) : null}
      </TractionPageHeader>

      {freeNote ? (
        <p className="mb-8 max-w-3xl text-sm leading-7 text-white/60">{freeNote}</p>
      ) : null}

      <PersonasLibraryClient
        personas={personas}
        loadError={loadError}
        messages={messages}
        language={language}
      />

      {shouldShowFreeAudienceContinuation(presentation) ? (
        <div className="mt-10">
          <UpgradeCompletionCard
            {...audienceUpgradeContent({
              continuation: copy.free.continuation,
              upgrade: messages.upgrade,
            })}
          />
        </div>
      ) : null}
    </TenantAppShell>
  );
}
