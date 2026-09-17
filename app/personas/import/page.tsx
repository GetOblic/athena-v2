import Link from "next/link";
import { UserPlus } from "lucide-react";
import { TenantAppShell } from "@/components/dashboard/TenantAppShell";
import { PersonaImportForms } from "@/components/personas/PersonaImportForms";
import { TractionPageHeader } from "@/components/traction/TractionPageHeader";
import {
  PERSONA_IMPORT_BACK_LINK_CLASS,
  PERSONA_IMPORT_HEADER_ICON_WELL,
  PERSONA_IMPORT_PRIMARY_CLASS,
} from "@/lib/personas/personaImportPresentation";
import { shouldShowFreeAudienceContinuation } from "@/lib/personas/freeAudiencePresentation";
import { getTenantLocalization } from "@/lib/tenantI18n/getTenantLocalization";
import { audienceUpgradeContent } from "@/lib/upgrade/freeFeatureUpgradePresentation";
import { UpgradeCompletionCard } from "@/components/upgrade/UpgradeCompletionCard";
import { requireCurrentOrganizationContext } from "@/services/organizationService";
import { loadFreeAudiencePageState } from "@/services/personas/freeAudiencePageState";

export default async function PersonaImportPage() {
  await requireCurrentOrganizationContext();
  const [{ messages }, freeAudience] = await Promise.all([
    getTenantLocalization(),
    loadFreeAudiencePageState(),
  ]);
  const copy = messages.personas;
  const { presentation, audience, ...freeProgression } = freeAudience;
  const boundPersonaId = audience.personaId;

  return (
    <TenantAppShell
      currentPath="/personas/import"
      messages={messages}
      {...freeProgression}
    >
      <Link href="/personas" className={PERSONA_IMPORT_BACK_LINK_CLASS}>
        {copy.backToPersonas}
      </Link>
      <div className="mt-8">
        <div className="mb-3 flex flex-wrap items-center gap-3">
          <span className={PERSONA_IMPORT_HEADER_ICON_WELL} aria-hidden="true">
            <UserPlus className="size-5" />
          </span>
        </div>
        <TractionPageHeader
          eyebrow={copy.eyebrow}
          title={copy.import.createTitle}
          subtitle={copy.import.subtitle}
        />
      </div>
      {presentation === "consumed" || presentation === "reserved" ? (
        <div className="mx-auto mt-8 w-full min-w-0 max-w-3xl space-y-4 text-sm leading-7 text-white/60">
          <p>
            {presentation === "reserved"
              ? copy.free.reservedNote
              : copy.free.completedNote}
          </p>
          {boundPersonaId ? (
            <Link
              href={`/personas/${boundPersonaId}`}
              className={PERSONA_IMPORT_PRIMARY_CLASS}
            >
              {copy.free.openAudience}
            </Link>
          ) : (
            <Link href="/personas" className={PERSONA_IMPORT_PRIMARY_CLASS}>
              {copy.import.openLibrary}
            </Link>
          )}
          {shouldShowFreeAudienceContinuation(presentation) ? (
            <UpgradeCompletionCard
              {...audienceUpgradeContent({
                continuation: copy.free.continuation,
                upgrade: messages.upgrade,
              })}
            />
          ) : null}
        </div>
      ) : (
        <PersonaImportForms messages={messages} presentation={presentation} />
      )}
    </TenantAppShell>
  );
}
