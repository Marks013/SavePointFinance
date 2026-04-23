import { Button } from "@/components/ui/button";
import { type InvitationItem } from "@/features/admin/components/admin-shared";
import { formatDateTimeDisplay } from "@/lib/date";
import { formatRoleLabel } from "@/lib/users/role-label";

type AdminInvitationCardProps = {
  invitation: InvitationItem;
  resendDisabled: boolean;
  revokeDisabled: boolean;
  onResend: () => void;
  onRevoke: () => void;
};

export function AdminInvitationCard({
  invitation,
  resendDisabled,
  revokeDisabled,
  onResend,
  onRevoke
}: AdminInvitationCardProps) {
  const isLocked = Boolean(invitation.acceptedAt) || Boolean(invitation.revokedAt);

  return (
    <article className="data-card p-4">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0 space-y-1">
          <p className="font-semibold">{invitation.name}</p>
          <p className="break-words text-sm text-[var(--color-muted-foreground)]">
            {invitation.email} | {formatRoleLabel({ role: invitation.role })}
          </p>
          {!isLocked ? (
            <p className="text-xs text-[var(--color-muted-foreground)]">
              Por seguranca, links pendentes aparecem apenas ao criar ou reenviar o convite.
            </p>
          ) : null}
          <p className="text-xs text-[var(--color-muted-foreground)]">
            Expira em {formatDateTimeDisplay(invitation.expiresAt)}
            {invitation.acceptedAt ? ` | Aceito em ${formatDateTimeDisplay(invitation.acceptedAt)}` : ""}
            {invitation.revokedAt ? ` | Revogado em ${formatDateTimeDisplay(invitation.revokedAt)}` : ""}
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          <Button disabled={resendDisabled || isLocked} onClick={onResend} type="button" variant="secondary">
            Reenviar e-mail
          </Button>
          <Button disabled={revokeDisabled || isLocked} onClick={onRevoke} type="button" variant="ghost">
            Revogar
          </Button>
        </div>
      </div>
    </article>
  );
}
