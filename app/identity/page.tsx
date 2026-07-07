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
  const identity = await getAthenaIdentityByUserId(user.id);

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

        <p className="mt-4 max-3xl text-base leading-7 text-white/50">
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
                className="rounded-2xl border border-white/10 bg-black/30 px-4 py-4 text-sm text-white outline-none placeholder:text-white/25"
                placeholder="Liana"
              />
            </label>

            <label className="grid gap-3">
              <span className="text-xl font-semibold">Your Voice</span>
              <span className="max-w-3xl text-sm leading-6 text-white/45">
                Help Athena understand how you naturally communicate. Example:
                “I’m a PMU educator with 12 years of experience. I believe
                education should come before selling. My communication style is
                warm, reassuring and professional.”
              </span>
              <textarea
                name="about_you"
                rows={8}
                defaultValue={identity?.about_you ?? ""}
                className="resize-y rounded-2xl border border-white/10 bg-black/30 px-4 py-4 text-sm leading-6 text-white outline-none placeholder:text-white/25"
                placeholder="Tell Athena how you think, speak, teach and guide people..."
              />
            </label>

            <label className="grid gap-3">
              <span className="text-xl font-semibold">
                Your Business Knowledge
              </span>
        <span className="max-w-3xl text-sm leading-6 text-white/45">
                Teach Athena your expertise, methodology, terminology and
                professional rules. Example: “My training follows a five-step
                methodology: consultation, theory, hands-on practice,
                supervised work and business launch.”
              </span>
              <textarea
                name="expertise"
                rows={10}
                defaultValue={identity?.expertise ?? ""}
                className="resize-y rounded-2xl border border-white/10 bg-black/30 px-4 py-4 text-sm leading-6 text-white outline-none placeholder:text-white/25"
                placeholder="Teach Athena your methodology, frameworks, FAQs, terminology, offers and rules..."
              />
            </label>

            <label className="grid gap-3">
              <span className="text-xl font-semibold">Business Webs/span>
              <span className="max-w-3xl text-sm leading-6 text-white/45">
                Athena will study your homepage and use it to understand your
                business. V2 will support sitemap crawling and selected pages.
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
              Train Athena
            </button>
          </div>
        </form>

        <aside className="rounded-[28px] border border-[var(--athena-border)] bg-[var(--athena-card)] p-8">
          <h2 className="text-xl font-semibold">Brain Status</h2>

          <div className="mt-6 space-y-5 text-sm leading-6 text-white/55">
            <div>✓ Voice learned</div>
            <div>✓ Expertise learned</div>
            <div>✓ Homepage learned</div>
            <div>✓ Professional terminology learned</div>
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
     iv>
          </div>
        </aside>
      </div>
    </main>
  );
}
