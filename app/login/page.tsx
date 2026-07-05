import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { createSupabaseServerClient } from "@/lib/supabase/server";

export default function LoginPage({
  searchParams,
}: {
  searchParams?: Promise<{ message?: string; redirectedFrom?: string }>;
}) {
  async function signIn(formData: FormData) {
    "use server";

    const email = String(formData.get("email") || "").trim().toLowerCase();

    if (!email) {
      redirect("/login?message=Email is required");
    }

    const supabase = await createSupabaseServerClient();

    const headerStore = await headers();
    const host = headerStore.get("host");
    const protocol = host?.includes("localhost") ? "http" : "https";
    const origin = `${protocol}://${host}`;

    const { error } = await supabase.auth.signInWithOtp({
      email,
      options: {
        emailRedirectTo: `${origin}/auth/callback`,
      },
    });

    if (error) {
      redirect(`/login?message=${encodeURIComponent(error.message)}`);
    }

    redirect("/login?message=Check your email for the login link.");
  }

  return (
    <main className="flex min-h-screen items-center justify-center bg-[var(--athena-bg)] px-6 text-white">
      <div className="w-full max-w-md rounded-[32px] border border-[var(--athena-border)] bg-[var(--athena-card)] p-10 shadow-2xl">
        <div className="text-xs font-semibold uppercase tracking-[0.35em] text-[var(--athena-orange)]">
          Athena Access
        </div>

        <h1 className="mt-5 text-4xl font-semibold tracking-tight">
          Sign in to Athena
        </h1>

        <p className="mt-4 text-sm leading-7 text-white/50">
          Enter your authorized email address. Athena will send you a secure login link.
        </p>

        <form action={signIn} className="mt-8 space-y-5">
          <input
            name="email"
            type="email"
            required
            placeholder="you@getoblic.com"
            className="w-full rounded-2xl border border-white/10 bg-black/30 px-5 py-4 text-white outline-none placeholder:text-white/25 focus:border-[var(--athena-orange)]"
          />

          <button
            type="submit"
            className="w-full rounded-full bg-[var(--athena-orange)] px-6 py-4 text-sm font-semibold text-white shadow-xl shadow-orange-500/20 transition hover:opacity-90"
          >
            Send secure login link
          </button>
        </form>

        <LoginMessage searchParams={searchParams} />
      </div>
    </main>
  );
}

async function LoginMessage({
  searchParams,
}: {
  searchParams?: Promise<{ message?: string }>;
}) {
  const params = searchParams ? await searchParams : {};
  const message = params?.message;

  if (!message) return null;

  return (
    <div className="mt-6 rounded-2xl border border-white/10 bg-black/20 p-4 text-sm leading-6 text-white/70">
      {message}
    </div>
  );
}
