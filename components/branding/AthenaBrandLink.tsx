import Link from "next/link";

type AthenaBrandLinkProps = {
  className?: string;
};

export function AthenaBrandLink({ className = "" }: AthenaBrandLinkProps) {
  return (
    <Link
      href="/"
      className={`inline-block transition hover:opacity-90 ${className}`}
    >
      <div className="text-3xl font-bold tracking-tight">ATHENA</div>
      <div className="mt-2 text-sm text-white/45">Intelligence OS</div>
    </Link>
  );
}
