/** Inline folder icon — no new image asset. */
export function SubAccountFallbackIcon({ className = "" }: { className?: string }) {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      aria-hidden="true"
      className={className}
    >
      <path
        d="M3.5 7.5A2 2 0 0 1 5.5 5.5h4.17a2 2 0 0 1 1.41.59l1.17 1.17a2 2 0 0 0 1.41.59H18.5a2 2 0 0 1 2 2v7.5a2 2 0 0 1-2 2h-13a2 2 0 0 1-2-2v-9.5Z"
        stroke="currentColor"
        strokeWidth="1.5"
        strokeLinejoin="round"
      />
    </svg>
  );
}
