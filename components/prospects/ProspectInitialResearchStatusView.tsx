import { prospectIntelligenceChipClass } from "@/lib/prospects/prospectDetailPresentation";

export function ProspectInitialResearchStatusView(props: {
  label: string;
  notice: string | null;
  statusToken: string;
}) {
  return (
    <>
      <span className={prospectIntelligenceChipClass(props.statusToken)}>
        {props.label}
      </span>
      {props.notice ? (
        <p className="basis-full text-sm font-normal leading-6 text-white/60">
          {props.notice}
        </p>
      ) : null}
    </>
  );
}
