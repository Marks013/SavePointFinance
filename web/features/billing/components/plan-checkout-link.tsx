"use client";

import Link from "next/link";
import type { Route } from "next";
import { useSession } from "next-auth/react";
import { forwardRef } from "react";
import type { ComponentPropsWithoutRef } from "react";

type PlanCheckoutLinkProps = Omit<ComponentPropsWithoutRef<typeof Link>, "href"> & {
  hrefWhenLoggedOut?: string;
  hrefWhenLoggedIn?: string;
};

export const PlanCheckoutLink = forwardRef<HTMLAnchorElement, PlanCheckoutLinkProps>(function PlanCheckoutLink(
  { hrefWhenLoggedOut = "/cadastro?plan=pro", hrefWhenLoggedIn = "/billing?intent=checkout", children, ...props },
  ref
) {
  const { status } = useSession();
  const href = status === "authenticated" ? hrefWhenLoggedIn : hrefWhenLoggedOut;

  return (
    <Link ref={ref} href={href as Route} {...props}>
      {children}
    </Link>
  );
});
