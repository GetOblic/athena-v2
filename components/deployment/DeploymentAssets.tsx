import { CopyButton } from "@/components/deployment/CopyButton";

export type DeploymentAsset = {
  title: string;
  objective: string;
  content: string;
};

type DeploymentAssetsProps = {
  assets: DeploymentAsset[];
};

export function DeploymentAssets({ assets }: DeploymentAssetsProps) {
  const visibleAssets = assets.filter((asset) => asset.content.trim());

  if (visibleAssets.length === 0) {
    return null;
  }

  return (
    <section className="rounded-[28px] border border-[var(--athena-orange)]/25 bg-gradient-to-br from-[var(--athena-card)] to-[#16161f] p-8 shadow-[0_0_40px_rgba(255,102,0,0.06)] lg:p-10">
      <h2 className="text-3xl font-semibold tracking-tight text-[var(--athena-orange)]">
        Deployment Assets
      </h2>

      <p className="mt-2 max-w-2xl text-base text-white/50">
        Ready-to-use content generated from Athena&apos;s analysis.
      </p>

      <div className="mt-8 grid gap-5 lg:grid-cols-2">
        {visibleAssets.map((asset) => (
          <article
            key={`${asset.title}-${asset.content.slice(0, 32)}`}
            className="flex flex-col rounded-2xl border border-white/10 bg-black/25 p-6"
          >
            <div className="flex items-start justify-between gap-4">
              <div>
                <div className="text-xs font-semibold uppercase tracking-[0.22em] text-[var(--athena-orange)]">
                  Deployment Asset
                </div>
                <h3 className="mt-2 text-2xl font-semibold tracking-tight text-white">
                  {asset.title}
                </h3>
                <p className="mt-2 text-sm leading-6 text-white/45">
                  {asset.objective}
                </p>
              </div>
              <CopyButton text={asset.content} />
            </div>

            <div className="mt-5 flex-1 rounded-xl border border-white/5 bg-[var(--athena-bg)]/60 p-4">
              <p className="whitespace-pre-wrap text-sm leading-7 text-white/85">
                {asset.content}
              </p>
            </div>
          </article>
        ))}
      </div>
    </section>
  );
}
