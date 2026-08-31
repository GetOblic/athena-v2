"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { AthenaHeaderActions } from "@/components/auth/AthenaHeaderActions";

type AthenaBrandLinkProps = {
  className?: string;
  tagline?: string;
  logoutLabel?: string;
  sessionActionsLabel?: string;
};

export function AthenaBrandLink({
  className = "",
  tagline = "Intelligence OS",
  logoutLabel,
  sessionActionsLabel,
}: AthenaBrandLinkProps) {
  const pathname = usePathname();
  const isLicenseePath = pathname === "/licensee" || pathname.startsWith("/licensee/");
  const isSuperPath = pathname === "/super" || pathname.startsWith("/super/");
  const showLogout =
    pathname !== "/login" &&
    !pathname.startsWith("/auth") &&
    !isLicenseePath &&
    !isSuperPath;

  const homeHref = isSuperPath ? "/super" : isLicenseePath ? "/licensee" : "/";

  const brand = (
    <>
      <div className="text-3xl font-bold tracking-tight">ATHENA</div>
      <div className="mt-2 text-sm text-white/45">{tagline}</div>
    </>
  );

  if (!showLogout) {
    return (
      <Link
        href={homeHref}
        className={`inline-block transition hover:opacity-90 ${className}`}
      >
        {brand}
      </Link>
    );
  }

  return (
    <div className={`flex w-full flex-col gap-3 ${className}`}>
      <div className="flex w-full items-start justify-between gap-3">
        <Link href="/" className="inline-block min-w-0 transition hover:opacity-90">
          {brand}
        </Link>
      </div>
      <AthenaHeaderActions
        logoutLabel={logoutLabel}
        sessionActionsLabel={sessionActionsLabel}
      />
    </div>
  );
}
