"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { LogoutCta } from "@/components/auth/LogoutCta";

type AthenaBrandLinkProps = {
  className?: string;
};

export function AthenaBrandLink({ className = "" }: AthenaBrandLinkProps) {
  const pathname = usePathname();
  const showLogout =
    pathname !== "/login" && !pathname.startsWith("/auth");

  const brand = (
    <>
      <div className="text-3xl font-bold tracking-tight">ATHENA</div>
      <div className="mt-2 text-sm text-white/45">Intelligence OS</div>
    </>
  );

  if (!showLogout) {
    return (
      <Link
        href="/"
        className={`inline-block transition hover:opacity-90 ${className}`}
      >
        {brand}
      </Link>
    );
  }

  return (
    <div
      className={`flex w-full items-start justify-between gap-4 ${className}`}
    >
      <Link href="/" className="inline-block transition hover:opacity-90">
        {brand}
      </Link>
      <LogoutCta />
    </div>
  );
}
