import { IDENTITY_FIELD_ANCHORS } from "@/components/identity/identityPagePresentation";

export function IdentityInitialResearchStatusView(props: {
  label: string;
  notice: string | null;
  retryLabel: string | null;
}) {
  return (
    <>
      <span className="font-medium text-white/70">{props.label}</span>
      {props.notice ? (
        <span className="mt-2 block text-sm font-normal leading-6 text-white/55">
          {props.notice}
        </span>
      ) : null}
      {props.retryLabel ? (
        <a
          href={`#${IDENTITY_FIELD_ANCHORS.teach}`}
          className="mt-2 block text-sm font-semibold text-[var(--athena-orange)]"
        >
          {props.retryLabel}
        </a>
      ) : null}
    </>
  );
}
