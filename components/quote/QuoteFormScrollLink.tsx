"use client";

import type { ReactNode } from "react";

type QuoteFormScrollLinkProps = {
  children: ReactNode;
  className?: string;
};

export function QuoteFormScrollLink({
  children,
  className,
}: QuoteFormScrollLinkProps) {
  return (
    <a
      href="#athena-quote-form"
      className={className}
      onClick={(event) => {
        event.preventDefault();
        document
          .getElementById("athena-quote-form")
          ?.scrollIntoView({ behavior: "smooth", block: "start" });
      }}
    >
      {children}
    </a>
  );
}
