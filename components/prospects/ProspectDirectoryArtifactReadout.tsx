import { ATHENA_EXECUTIVE_CARD_OUTLINE_CLASS } from "@/components/ui/athenaExecutiveCard";
import type { TenantMessages } from "@/lib/tenantI18n/types";
import type { ProspectDirectoryArtifactRecord } from "@/services/prospects/prospectDirectoryArtifacts";

const SECTION_CLASS = `rounded-[28px] border border-white/10 bg-[var(--athena-card)] p-6 sm:p-8 ${ATHENA_EXECUTIVE_CARD_OUTLINE_CLASS}`;

function Empty({ children }: { children: string }) {
  return (
    <p className="rounded-2xl border border-dashed border-white/10 bg-black/20 p-5 text-sm leading-7 text-white/50">
      {children}
    </p>
  );
}

function ArtifactBody({ artifact }: { artifact: ProspectDirectoryArtifactRecord }) {
  return (
    <p
      data-prospect-directory-artifact-revision={artifact.revision}
      data-prospect-directory-artifact-origin={artifact.origin}
      className="whitespace-pre-wrap text-sm leading-7 text-white/75"
    >
      {artifact.content}
    </p>
  );
}

/**
 * Read-only saved Description and Knowledge Base.
 * No editor, regenerate, save, or GetOblic send control.
 */
export function ProspectDirectoryArtifactReadout({
  description,
  knowledgeBase,
  copy,
}: {
  description: ProspectDirectoryArtifactRecord | null;
  knowledgeBase: ProspectDirectoryArtifactRecord | null;
  copy: TenantMessages["clientProspectIntelligence"];
}) {
  return (
    <div data-prospect-directory-artifacts="readout" className="space-y-8">
      <section
        data-prospect-directory-artifact="description"
        className={SECTION_CLASS}
      >
        <h2 className="text-xl font-semibold tracking-tight text-white sm:text-2xl">
          {copy.savedDescriptionTitle}
        </h2>
        <div className="mt-5">
          {description ? <ArtifactBody artifact={description} /> : (
            <Empty>{copy.savedDescriptionEmpty}</Empty>
          )}
        </div>
      </section>
      <section
        data-prospect-directory-artifact="knowledge_base"
        className={SECTION_CLASS}
      >
        <h2 className="text-xl font-semibold tracking-tight text-white sm:text-2xl">
          {copy.savedKnowledgeBaseTitle}
        </h2>
        <div className="mt-5">
          {knowledgeBase ? <ArtifactBody artifact={knowledgeBase} /> : (
            <Empty>{copy.savedKnowledgeBaseEmpty}</Empty>
          )}
        </div>
      </section>
    </div>
  );
}
