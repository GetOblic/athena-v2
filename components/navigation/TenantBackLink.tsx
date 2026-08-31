import Link from "next/link";

type TenantBackLinkProps = {
  href: string;
  label: string;
  className?: string;
};

/**
 * Tenant-only back-link primitive. Callers supply the already-localized label.
 * Does not resolve organization language or invent entity names.
 */
export function TenantBackLink({
  href,
  label,
  className = "text-sm text-[var(--athena-orange)]",
}: TenantBackLinkProps) {
  return (
    <Link href={href} className={className}>
      {label}
    </Link>
  );
}
