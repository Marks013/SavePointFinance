"use client";

import { usePathname } from "next/navigation";
import { useSession } from "next-auth/react";
import { useEffect, useMemo, useState } from "react";

import { Button } from "@/components/ui/button";

type PopupCampaignItem = {
  id: string;
  name: string;
  status: "draft" | "active" | "paused" | "archived";
  kind: "announcement" | "update" | "welcome";
  tone: "calm" | "success" | "spotlight" | "warning";
  eyebrow: string | null;
  title: string;
  body: string;
  ctaLabel: string | null;
  ctaUrl: string | null;
  dismissLabel: string;
  startsAt: string | null;
  endsAt: string | null;
  priority: number;
  delayMs: number;
  autoHideMs: number | null;
  dismissible: boolean;
  oncePerUser: boolean;
  maxViews: number | null;
  showToNewUsers: boolean;
  showToReturningUsers: boolean;
  showToPlatformAdmins: boolean;
  showToTenantAdmins: boolean;
  showToMembers: boolean;
  targetUserId: string | null;
  uniqueViews: number;
  createdAt: string;
  updatedAt: string;
};

function toneStyles(tone: PopupCampaignItem["tone"]) {
  if (tone === "success") {
    return {
      shell:
        "border-[color-mix(in_srgb,var(--color-primary)_24%,var(--color-border))] bg-[linear-gradient(180deg,color-mix(in_srgb,var(--color-card)_92%,#f4fff7)_0%,var(--color-card)_100%)]",
      badge: "bg-[color-mix(in_srgb,var(--color-primary)_12%,transparent)] text-[var(--color-primary)]",
      glow: "shadow-[0_24px_70px_rgba(16,185,129,0.18)]"
    };
  }

  if (tone === "spotlight") {
    return {
      shell:
        "border-[color-mix(in_srgb,#3b82f6_24%,var(--color-border))] bg-[linear-gradient(180deg,color-mix(in_srgb,#eff6ff_88%,var(--color-card))_0%,var(--color-card)_100%)]",
      badge: "bg-[color-mix(in_srgb,#3b82f6_12%,transparent)] text-[#1d4ed8]",
      glow: "shadow-[0_24px_70px_rgba(59,130,246,0.18)]"
    };
  }

  if (tone === "warning") {
    return {
      shell:
        "border-[color-mix(in_srgb,#f97316_24%,var(--color-border))] bg-[linear-gradient(180deg,color-mix(in_srgb,#fff7ed_92%,var(--color-card))_0%,var(--color-card)_100%)]",
      badge: "bg-[color-mix(in_srgb,#f97316_12%,transparent)] text-[#c2410c]",
      glow: "shadow-[0_24px_70px_rgba(249,115,22,0.18)]"
    };
  }

  return {
    shell:
      "border-[color-mix(in_srgb,var(--color-foreground)_10%,var(--color-border))] bg-[linear-gradient(180deg,color-mix(in_srgb,var(--color-card)_96%,#f9fafb)_0%,var(--color-card)_100%)]",
    badge: "bg-[color-mix(in_srgb,var(--color-foreground)_6%,transparent)] text-[var(--color-foreground)]",
    glow: "shadow-[0_24px_70px_rgba(15,23,42,0.14)]"
  };
}

function kindLabel(kind: PopupCampaignItem["kind"]) {
  if (kind === "welcome") return "Boas-vindas";
  if (kind === "update") return "Novidade";
  return "Aviso";
}

export function LoginPopupAnnouncer() {
  const pathname = usePathname();
  const { data: session, status } = useSession();
  const sessionUserId = session?.user?.id ?? null;
  const canRequestPopup = status === "authenticated" && Boolean(sessionUserId) && pathname.startsWith("/dashboard");
  const [campaign, setCampaign] = useState<PopupCampaignItem | null>(null);
  const [visible, setVisible] = useState(false);
  const popupTone =
    campaign?.targetUserId && campaign.eyebrow?.toLowerCase() === "suporte" ? "calm" : campaign?.tone ?? "calm";
  const styles = useMemo(() => toneStyles(popupTone), [popupTone]);

  useEffect(() => {
    if (!canRequestPopup || !sessionUserId) {
      return;
    }

    let cancelled = false;
    let delayTimer: ReturnType<typeof setTimeout> | null = null;
    let autoHideTimer: ReturnType<typeof setTimeout> | null = null;

    async function loadCampaign() {
      const response = await fetch("/api/notifications/popup", {
        cache: "no-store"
      });

      if (!response.ok) {
        return;
      }

      const payload = (await response.json().catch(() => null)) as { item?: PopupCampaignItem | null } | null;
      const nextCampaign = payload?.item ?? null;

      if (!nextCampaign || cancelled) {
        return;
      }

      const sessionKey = `savepoint:popup-session:${sessionUserId}:${nextCampaign.id}`;
      if (window.sessionStorage.getItem(sessionKey)) {
        return;
      }

      setCampaign(nextCampaign);

      delayTimer = setTimeout(async () => {
        if (cancelled) {
          return;
        }

        window.sessionStorage.setItem(sessionKey, "shown");
        setVisible(true);

        await fetch("/api/notifications/popup", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            campaignId: nextCampaign.id,
            action: "view"
          })
        }).catch(() => null);

        if (nextCampaign.autoHideMs) {
          autoHideTimer = setTimeout(() => {
            setVisible(false);
          }, nextCampaign.autoHideMs);
        }
      }, nextCampaign.delayMs);
    }

    loadCampaign().catch(() => null);

    return () => {
      cancelled = true;
      if (delayTimer) clearTimeout(delayTimer);
      if (autoHideTimer) clearTimeout(autoHideTimer);
    };
  }, [canRequestPopup, sessionUserId]);

  async function acknowledge(action: "dismiss" | "cta") {
    if (!campaign) {
      return;
    }

    await fetch("/api/notifications/popup", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        campaignId: campaign.id,
        action
      })
    }).catch(() => null);
  }

  async function handleDismiss() {
    if (!campaign?.dismissible) {
      return;
    }

    await acknowledge("dismiss");
    setVisible(false);
  }

  async function handlePrimaryAction() {
    if (!campaign?.ctaUrl) {
      setVisible(false);
      return;
    }

    await acknowledge("cta");
    window.location.assign(campaign.ctaUrl);
  }

  if (!canRequestPopup || !campaign || !visible) {
    return null;
  }

  return (
    <div className="pointer-events-none fixed inset-0 z-[70] flex items-end justify-center p-4 sm:items-end sm:justify-end sm:p-6">
      <div
        className={`pointer-events-auto w-full max-w-[26rem] rounded-[1.8rem] border p-5 text-[var(--color-foreground)] ${styles.shell} ${styles.glow}`}
      >
        <div className="flex items-start gap-3">
          <div className={`rounded-full px-3 py-1 text-[0.68rem] font-semibold uppercase tracking-[0.18em] ${styles.badge}`}>
            {campaign.eyebrow ?? kindLabel(campaign.kind)}
          </div>
          {campaign.dismissible ? (
            <button
              aria-label="Fechar aviso"
              className="ml-auto rounded-full px-2 py-1 text-sm text-[var(--color-muted-foreground)] transition hover:bg-[color-mix(in_srgb,var(--color-foreground)_6%,transparent)]"
              onClick={handleDismiss}
              type="button"
            >
              ×
            </button>
          ) : null}
        </div>

        <h3 className="mt-4 text-xl font-semibold tracking-[-0.03em]">{campaign.title}</h3>
        <p className="mt-3 text-sm leading-7 text-[var(--color-muted-foreground)]">{campaign.body}</p>

        <div className="mt-5 flex flex-wrap gap-3">
          {campaign.ctaLabel && campaign.ctaUrl ? (
            <Button onClick={handlePrimaryAction} type="button">
              {campaign.ctaLabel}
            </Button>
          ) : null}
          {campaign.dismissible ? (
            <Button onClick={handleDismiss} type="button" variant="ghost">
              {campaign.dismissLabel || "Agora nao"}
            </Button>
          ) : null}
        </div>
      </div>
    </div>
  );
}
