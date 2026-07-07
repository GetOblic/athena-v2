import { CopyButton } from "@/components/deployment/CopyButton";
import type { AthenaAssetBlueprint } from "@/services/assetBlueprints/assetBlueprintService";

type StrategicAssetBlueprintProps = {
  blueprint: AthenaAssetBlueprint;
};

export function StrategicAssetBlueprint({
  blueprint,
}: StrategicAssetBlueprintProps) {
  return (
    <section className="rounded-[28px] border border-[var(--athena-border)] bg-[var(--athena-card)] p-8 lg:p-10">
      <h2 className="text-3xl font-semibold tracking-tight text-[var(--athena-orange)]">
        Strategic Asset Blueprint
      </h2>

      <p className="mt-2 max-w-2xl text-sm text-white/45">
        Reusable strategic asset specification generated from Athena&apos;s
        analysis.
      </p>

      <div className="mt-8 grid gap-5 sm:grid-cols-2 lg:grid-cols-3">
        <MetaField label="Asset title" value={blueprint.asset_title} />
        <MetaField label="Asset type" value={blueprint.asset_type} />
        <MetaField label="Business goal" value={blueprint.business_goal} />
        <MetaField label="Target audience" value={blueprint.target_audience} />
        <MetaField label="Priority" value={blueprint.priority} />
        <MetaField
          label="Estimated reuse"
          value={
            blueprint.estimated_reuse != null
              ? `${blueprint.estimated_reuse} / 5`
              : null
          }
        />
      </div>

      <div className="mt-8 space-y-6">
        <PromptBlock label="Image prompt" text={blueprint.image_prompt} />
        <PromptBlock label="PDF prompt" text={blueprint.pdf_prompt} />
        <PromptBlock label="Social prompt" text={blueprint.social_prompt} />
        <PromptBlock label="Notes" text={blueprint.notes} />
      </div>
    </section>
  );
}

function MetaField({
  label,
  value,
}: {
  label: string;
  value?: string | null;
}) {
  return (
    <div className="rounded-2xl border border-white/10 bg-black/20 p-4">
      <div className="text-xs uppercase tracking-[0.2em] text-white/35">
        {label}
      </div>
      <div className="mt-2 text-sm leading-6 text-white/85">{value || "—"}</div>
    </div>
  );
}

function PromptBlock({
  label,
  text,
}: {
  label: string;
  text?: string | null;
}) {
  if (!text?.trim()) {
    return null;
  }

  return (
    <div>
      <div className="mb-3 flex items-center justify-between gap-4">
        <div className="text-sm font-medium text-white/55">{label}</div>
        <CopyButton text={text} />
      </div>
      <div className="rounded-xl border border-white/10 bg-black/30 p-5 shadow-inner shadow-black/20">
        <p className="whitespace-pre-wrap text-sm leading-7 text-white/85">
          {text}
        </p>
      </div>
    </div>
  );
}
