"use client";

import Link from "next/link";
import type { Route } from "next";
import { useSession } from "next-auth/react";
import type { ReactNode } from "react";

type PlanCheckoutLinkProps = {
  hrefWhenLoggedOut?: string;
  hrefWhenLoggedIn?: string;
  children: ReactNode;
};

export function PlanCheckoutLink({
  hrefWhenLoggedOut = "/cadastro?plan=pro",
  hrefWhenLoggedIn = "/billing?intent=checkout",
  children
}: PlanCheckoutLinkProps) {
  const { status } = useSession();
  const href = status === "authenticated" ? hrefWhenLoggedIn : hrefWhenLoggedOut;

  return <Link href={href as Route}>{children}</Link>;
}
