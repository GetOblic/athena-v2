import Link from "next/link";
import { redirect } from "next/navigation";
import { TrainAthenaSubmitButton } from "@/components/identity/TrainAthenaSubmitButton";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import {
  getAthenaIdentityByUserId,
  upsertAthenaIdentity,
} from "@/services/identity/identityService";
import { requireCurrentOrganizationContext } from "@/services/organizationService";

const fieldClassName =
  "rounded-2xl border border-white/15 bg-white/[0.04] px-5 py-4 text-sm text-white/90 shadow-inner shadow-black/20 outline-none placeholder:text-white/30 focus:border-[var(--athena-orange)] focus:ring-1 focus:ring-[var(--athena-orange)]";

async function saveIdentity(formData: FormData) {
  "use server";

  const supabase = await createSupabaseServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    redirect("/login");
  }

  const { organizationId } = await requireCurrentOrganizationContext();

  await upsertAthenaIdentity({
    userId: user.id,
    organizationId,
    greetingName: String(formData.get("greeting_name") ?? ""),
    aboutYou: String(formData.get("about_you") ?? ""),
    expertise: String(formData.get("expertise") ?? ""),
    website: String(formData.get("website") ?? ""),
  });

  redirect("/identity?saved=true");
}

export default async function IdentityPage({
  searchParams,
}: {
  searchParams: Promise<{ saved?: string }>;
}) {
  const supabase = await createSupabaseServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    redirect("/login");
  }

  const params = await searchParams;
  const { organizationId, userId } = await requireCurrentOrganizationContext();
  const identity = await getAthenaIdentityByUserId(userId, organizationId);

  const hasVoice = Boolean(identity?.about_you?.trim());
  const hasExpertise = Boolean(identity?.expertise?.trim());
  const hasWebsite = Boolean(identity?.website?.trim());
  const hasMasterProfile = Boolean(identity?.master_profile);

  return (
    <main className="min-h-screen bg-[var(--athena-bg)] p-10 text-white">
      <Link href="/" className="text-sm text-[var(--athena-orange)]">
        ← Dashboard
      </Link>

      <div className="mb-10 mt-10">
        <div className="text-xs font-semibold uppercase tracking-[0.35em] text-[var(--athena-orange)]">
          Athena Brain
        </div>

        <h1 className="mt-4 text-5xl font-semibold tracking-tight">
          Train Your Athena Brain
        </h1>

        <p className="mt-4 max-w-3xl text-base leading-7 text-white/50">
          Teach Athena your voice, expertise, business knowledge and professional
          rules. Athena will use this when generating replies, CTAs, briefings
          and strategic asset blueprints.
        </p>
      </div>

      {params.saved === "true" && (
        <div className="mb-8 rounded-2xl border border-emerald-400/20 bg-emerald-400/10 p-4 text-sm text-emerald-200">
          Athena Brain trained successfully.
        </div>
      )}

      <div className="grid gap-8 lg:grid-cols-[2fr_1fr]">
        <form
          action={saveIdentity}
          method="post"
          className="rounded-[28px] border border-[var(--athena-border)] bg-[var(--athena-card)] p-8"
        >
          <div className="grid gap-8">
            <label className="grid gap-3">
              <span className="text-xl font-semibold">
                What should Athena call you?
              </span>
              <span className="max-w-3xl text-sm leading-6 text-white/45">
                This name is used across your dashboard experience. Examples:
                Laurent, Liana, Dr. Smith, Coach Sarah.
              </span>
              <input
                name="greeting_name"
                defaultValue={identity?.greeting_name ?? ""}
                className={fieldClassName}
                placeholder="Liana"
              />
            </label>

            <label className="grid gap-3">
              <span className="text-xl font-semibold">Your Voice</span>
              <span className="max-w-3xl text-sm leading-6 text-white/45">
                Help Athena understand how you naturally communicate. Example:
                &ldquo;I&apos;m a PMU educator with 12 years of experience. I believe
                education should come before selling. My communication style is
                warm, reassuring and professional.&rdquo;
              </span>
              <textarea
                name="about_you"
                rows={8}
                defaultValue={identity?.about_you ?? ""}
                className={`resize-y leading-6 ${fieldClassName}`}
                placeholder="Tell Athena how you think, speak, teach and guide people..."
              />
            </label>

            <label className="grid gap-3">
              <span className="text-xl font-semibold">
                Your Business Knowledge
              </span>
              <span className="max-w-3xl text-sm leading-6 text-white/45">
                Teach Athena your expertise, methodology, terminology and
                professional rules. Example: &ldquo;My training follows a five-step
                methodology: consultation, theory, hands-on practice,
                supervised work and business launch.&rdquo;
              </span>
              <textarea
                name="expertise"
                rows={10}
                defaultValue={identity?.expertise ?? ""}
                className={`resize-y leading-6 ${fieldClassName}`}
                placeholder="Teach Athena your methodology, frameworks, FAQs, terminology, offers and rules..."
              />
            </label>

            <label className="grid gap-3">
              <span className="text-xl font-semibold">Business Website</span>
              <span className="max-w-3xl text-sm leading-6 text-white/45">
                Athena will study your homepage and use it to understand your
                business. V2 will support sitemap crawling and selected pages.
              </span>
              <input
                name="website"
                defaultValue={identity?.website ?? ""}
                className={fieldClassName}
                placeholder="https://yourcompany.com"
              />
            </label>

            <TrainAthenaSubmitButton />
          </div>
        </form>

        <aside className="rounded-[28px] border border-[var(--athena-border)] bg-[var(--athena-card)] p-8">
          <h2 className="text-xl font-semibold">Brain Status</h2>

          <div className="mt-6 space-y-5 text-sm leading-6 text-white/55">
            <div>{hasVoice ? "✓" : "○"} Voice learned</div>
            <div>{hasExpertise ? "✓" : "○"} Expertise learned</div>
            <div>{hasWebsite ? "✓" : "○"} Homepage learned</div>
            <div>{hasMasterProfile ? "✓" : "○"} Professional terminology learned</div>
            <div>✓ Continuous learning enabled</div>
          </div>

          <div className="mt-8 rounded-2xl border border-white/10 bg-black/20 p-5">
            <div className="text-xs uppercase tracking-[0.25em] text-white/35">
              Status
            </div>
            <div className="mt-3 text-lg font-semibold text-[var(--athena-orange)]">
              {identity?.brain_status ?? "pending"}
            </div>
            <div className="mt-2 text-sm text-white/40">
              Last trained:{" "}
              {identity?.brain_last_updated
                ? new Date(identity.brain_last_updated).toLocaleString()
                : "Not yet trained"}
            </div>
          </div>
        </aside>
      </div>
    </main>
  );
}
