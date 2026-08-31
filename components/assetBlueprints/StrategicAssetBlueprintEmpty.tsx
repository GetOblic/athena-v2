import { ATHENA_EXECUTIVE_CARD_OUTLINE_CLASS } from "@/components/ui/athenaExecutiveCard";

type StrategicAssetBlueprintEmptyProps = {
  message?: string;
  eyebrow?: string;
};

export function StrategicAssetBlueprintEmpty({
  message = "No Strategic Asset Blueprint has been generated for this briefing yet.",
  eyebrow = "Strategic Output",
}: StrategicAssetBlueprintEmptyProps) {
  return (
    <section
      className={`rounded-[28px] ${ATHENA_EXECUTIVE_CARD_OUTLINE_CLASS} bg-[var(--athena-card)] p-8 lg:p-10`}
    >
      <div className="text-xs font-semibold uppercase tracking-[0.35em] text-[var(--athena-orange)]">
        {eyebrow}
      </div>

      <h2 className="mt-3 text-3xl font-semibold tracking-tight text-white">
        Strategic Asset Blueprint
      </h2>

      <p className="mt-4 text-sm leading-7 text-white/45">{message}</p>
    </section>
  );
}
