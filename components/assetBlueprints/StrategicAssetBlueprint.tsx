import { CopyButton } from "@/components/deployment/CopyButton";
import { formatBlueprintReadiness } from "@/lib/blueprintReadiness";
import type { AthenaAssetBlueprint } from "@/services/assetBlueprints/assetBlueprintService";

type StrategicAssetBlueprintProps = {
  blueprint: AthenaAssetBlueprint;
};

export function StrategicAssetBlueprint({
  blueprint,
}: StrategicAssetBlueprintProps) {
  const readinessBadges = formatBlueprintReadiness(blueprint);

  return (
    <section className="rounded-[28px] border border-[var(--athena-orange)]/25 bg-gradient-to-br from-[var(--athena-card)] to-[#16161f] p-8 shadow-[0_0_40px_rgba(255,102,0,0.06)] lg:p-10">
      <div className="text-xs font-semibold uppercase tracking-[0.35em] text-[var(--athena-orange)]">
        Strategic Output
      </div>

      <h2 className="mt-3 text-3xl font-semibold tracking-tight text-white">
        Strategic Asset Blueprint
      </h2>

      <p className="mt-2 max-w-2xl text-base text-white/50">
        Reusable strategic asset specification — prompts ready for image, PDF,
        and social production.
      </p>

      {readinessBadges.length > 0 && (
        <div className="mt-6 rounded-2xl border border-white/10 bg-black/20 p-5">
          <div className="text-xs font-semibold uppercase tracking-[0.22em] text-white/35">
            Ready to Produce
          </div>
          <div className="mt-3 flex flex-wrap gap-2">
            {readinessBadges.map((badge) => (
              <span
                key={badge.key}
                className="rounded-full border border-[var(--athena-orange)]/30 bg-[var(--athena-orange)]/10 px-3 py-1 text-xs font-semibold uppercase tracking-[0.15em] text-[var(--athena-orange)]"
              >
                {badge.label}
              </span>
            ))}
          </div>
        </div>
      )}

      <div className="mt-8 rounded-2xl border border-white/10 bg-black/25 p-6">
        <div className="text-xs font-semibold uppercase tracking-[0.2em] text-[var(--athena-orange)]">
          Asset Overview
        </div>
        <h3 className="mt-3 text-2xl font-semibold text-white">
          {blueprint.asset_title || "Untitled Asset"}
        </h3>
        <div className="mt-2 inline-flex rounded-full border border-white/10 bg-white/[0.04] px-3 py-1 text-xs uppercase tracking-[0.15em] text-white/55">
          {blueprint.asset_type || "—"}
        </div>
      </div>

      <div className="mt-6 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <MetaField label="Business goal" value={blueprint.business_goal} />
        <MetaField label="Target audience" value={blueprint.target_audience} />
        <MetaField label="Priority" value={blueprint.priority} highlight />
        <MetaField
          label="Estimated reuse"
          value={
            blueprint.estimated_reuse != null
              ? `${blueprint.estimated_reuse} / 5`
              : null
          }
        />
      </div>

      <div className="mt-8 grid gap-6 lg:grid-cols-2">
        <PromptBlock label="Image prompt" text={blueprint.image_prompt} />
        <PromptBlock label="PDF prompt" text={blueprint.pdf_prompt} />
        <PromptBlock label="Social prompt" text={blueprint.social_prompt} />
        <PromptBlock label="Notes" text={blueprint.notes} fullWidth />
      </div>
    </section>
  );
}

function MetaField({
  label,
  value,
  highlight,
}: {
  label: string;
  value?: string | null;
  highlight?: boolean;
}) {
  return (
    <div className="rounded-2xl border border-white/10 bg-black/20 p-4">
      <div className="text-xs uppercase tracking-[0.2em] text-white/35">
        {label}
      </div>
      <div
        className={`mt-2 text-sm leading-6 ${
          highlight ? "font-semibold text-[var(--athena-orange)]" : "text-white/85"
        }`}
      >
        {value || "—"}
      </div>
    </div>
  );
}

function PromptBlock({
  label,
  text,
  fullWidth,
}: {
  label: string;
  text?: string | null;
  fullWidth?: boolean;
}) {
  const content = text?.trim();
  const hasContent = Boolean(content);

  return (
    <article
      className={`flex flex-col rounded-2xl border border-white/10 bg-black/25 p-5 ${
        fullWidth ? "lg:col-span-2" : ""
      }`}
    >
      <div className="flex items-center justify-between gap-4">
        <div className="text-sm font-medium text-white/55">{label}</div>
        {hasContent && content && <CopyButton text={content} />}
      </div>

      <div className="mt-4 flex-1 rounded-xl border border-white/10 bg-[var(--athena-bg)]/70 p-4 shadow-inner shadow-black/20">
        <p
          className={`whitespace-pre-wrap text-sm leading-7 ${
            hasContent ? "text-white/85" : "text-white/30"
          }`}
        >
          {hasContent ? content : "No prompt generated yet."}
        </p>
      </div>
    </article>
  );
}
