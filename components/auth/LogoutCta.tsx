/**
 * Posts to Athena's existing /api/auth/logout route (Supabase signOut + redirect).
 * Visual pattern aligned with Voice AI Insight's top-right Log out control.
 */
export function LogoutCta() {
  return (
    <form action="/api/auth/logout" method="post">
      <button
        type="submit"
        className="shrink-0 rounded-xl border border-[var(--athena-border)] px-3 py-2 text-sm font-medium text-white/80 transition hover:bg-white/5 hover:text-white focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--athena-orange)]"
      >
        Log out
      </button>
    </form>
  );
}
