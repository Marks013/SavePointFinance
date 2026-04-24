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
  const { data: session, status } = useSession();
  const href =
    status === "authenticated"
      ? session?.user?.isPlatformAdmin
        ? "/dashboard/admin"
        : hrefWhenLoggedIn
      : hrefWhenLoggedOut;

  return (
    <Link ref={ref} href={href as Route} {...props}>
      {children}
    </Link>
  );
});
