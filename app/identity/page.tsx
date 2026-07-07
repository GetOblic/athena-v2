import { redirect } from "next/navigation";
import Link from "next/link";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import {
  getAthenaIdentityByUserId,
  upsertAthenaIdentity,
} from "@/services/identity/identityService";

async function saveIdentity(formData: FormData) {
  "use server";

  const supabase = await createSupabaseServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    redirect("/login");
  }

  await upsertAthenaIdentity({
    userId: user.id,
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
  const identity = await getAthenaIdentityByUserId(user.id);

  return (
    <main className="min-h-screen bg-[var(--athena-bg)] p-10 text-white">
      <Link href="/" className="text-sm text-[var(--athena-orange)]">
        ← Dashboard
      </Link>

      <div className="mb-10 mt-10">
        <div className="text-xs font-semibold uppercase tracking-[0.35em] text-[var(--athena-orange)]">
          Athena Identity
        </div>

        <h1 className="mt-4 text-5xl font-semibold tracking-tight">
          Teach Athena Who Y Are
        </h1>

        <p className="mt-4 max-w-3xl text-base leading-7 text-white/50">
          Set up the voice, expertise and professional context Athena will use
          when generating replies, CTAs, briefings and deployment assets.
        </p>
      </div>

      {params.saved === "true" && (
        <div className="mb-8 rounded-2xl border border-emerald-400/20 bg-emerald-400/10 p-4 text-sm text-emerald-200">
          Athena Identity saved.
        </div>
      )}

      <div className="grid gap-8 lg:grid-cols-[2fr_1fr]">
        <form
          action={saveIdentity}
          className="rounded-[28px] border border-[var(--athena-border)] bg-[var(--athena-card)] p-8"
        >
          <div className="grid gap-8">
            <label className="grid gap-3">
              <span className="text-xl font-semibold">About You</span>
              <span className="max-w-3xl text-sm leading-6 text-white/45">
                Help Athena understand who you are and how you naturally
                communicate. Example: “I’m a PMU educator with 12 years of
                experience. I believe education should come before selling. My
                communication style is warm, reassuring and professional.”
              </span>
              <textarea
                name="about_you"
                rows={8}
                defaultValue={identity?.about_you ?? ""}
                className="resize-y rounded-2xl border border-white/10 bg-black/30 px-4 py-4 text-sm leading-6 text-white outline-none placeholder:text-white/25"
                placeholder="Tell Athena who you are..."
              />
            </label>

            <label className="grid gap-3">
        <span className="text-xl font-semibold">
                Teach Athena Your Expertise
              </span>
              <span className="max-w-3xl text-sm leading-6 text-white/45">
                Help Athena understand your professional knowledge,
                methodology, terminology and rules. Example: “My training
                follows a five-step methodology: consultation, theory, hands-on
                practice, supervised work and business launch.”
              </span>
              <textarea
                name="expertise"
                rows={10}
                defaultValue={identity?.expertise ?? ""}
                className="resize-y rounded-2xl border border-white/10 bg-black/30 px-4 py-4 text-sm leading-6 text-white outline-none placeholder:text-white/25"
                placeholder="Teach Athena your methodology, frameworks, FAQs, terminology and professional rules..."
              />
            </label>

            <label className="grid gap-3">
              <span className="text-xl font-semibold">Website optional</span>
              <span className="max-w-3xl text-sm leading-6 text-white/45">
                Add your website if Athena should learn from it later. Example:
                https://yourcompany.com
              </span>
              <input
                name="website"
                defaultValue={identity?.website ?? ""}
                className="rounded-2xl border border-white/10 bg-black/30 px-4 py-4 text-sm text-white outline-none placeholder:text-white/25"
                placeholder="https://yourcompany.com"
              />
            </label>

            <button
              type="submit"
              className="w-fit rounded-full bg-[var(--athena-orange)] px-8 py-4 text-sm font-semibold text-white shadow-lg shadow-orange-500/20 transition hover:opacity-90"
            >
              Save Athena Identity
            </button>
          </div>
        </form>

        <aside className="rounded-[28px] border border-[var(--athena-border)] bg-[var(--athena-card)] p-8">
          <h2 className="text-xl font-semibold">Athena Brain</h2>

          <div className="mt-6 space-y-5 text-sm leading-6 text-white/55">
            <div>✓ Athena is trained on your unique voice.</div>
            <div>✓ Athena uses your expertise when generating outputs.</div>
            <div>✓ Athena learns continuously from approved content.</div>
            <div>✓ No manual AI memory management is required.</div>
          </div>

          <div className="mt-8 rounded-2xl border border-white/10 bg-black/20 p-5">
            <div className="text-xs uppercase tracking-[0.25em] text-white/35">
              Status
            </div>
            <div className="mt-3 text-lg font-semibold text-[var(--athena-orange)]">
              {identity?.brain_status ?? "pending"}
            </div>
            <div className="mt-2 text-sm text-white/40">
              Last updated:{" "}
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
