import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select } from "@/components/ui/select";
import { type TenantItem, type UserItem, formatUserTenantPlanLabel } from "@/features/admin/components/admin-shared";
import { formatDateTimeDisplay } from "@/lib/date";
import { formatRoleLabel } from "@/lib/users/role-label";

type AdminUserCardProps = {
  user: UserItem;
  isPlatformAdmin: boolean;
  tenants: TenantItem[];
  userPasswordDraft: string;
  userTenantDraft: string;
  userDeleteConfirmDraft: string;
  getTenantLabel: (tenant: TenantItem) => string;
  onUserPasswordChange: (value: string) => void;
  onUserTenantChange: (value: string) => void;
  onUserDeleteConfirmChange: (value: string) => void;
  onToggleRole: () => void;
  onSubmitPasswordReset: () => void;
  onToggleActive: () => void;
  onMoveTenant: () => void;
  onDeleteUser: () => void;
  passwordActionDisabled: boolean;
  moveTenantDisabled: boolean;
  deleteUserDisabled: boolean;
};

function getLastLoginLabel(user: UserItem) {
  return user.lastLogin ? formatDateTimeDisplay(user.lastLogin) : "Nunca acessou";
}

export function AdminUserCard({
  user,
  isPlatformAdmin,
  tenants,
  userPasswordDraft,
  userTenantDraft,
  userDeleteConfirmDraft,
  getTenantLabel,
  onUserPasswordChange,
  onUserTenantChange,
  onUserDeleteConfirmChange,
  onToggleRole,
  onSubmitPasswordReset,
  onToggleActive,
  onMoveTenant,
  onDeleteUser,
  passwordActionDisabled,
  moveTenantDisabled,
  deleteUserDisabled
}: AdminUserCardProps) {
  const roleLabel = formatRoleLabel({
    role: user.role,
    isPlatformAdmin: user.isPlatformAdmin,
    accountAdminName: user.tenant.accountAdminName
  });

  return (
    <article className="data-card p-4">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0 flex-1 space-y-2">
          <div className="space-y-1">
            <p className="break-words font-semibold">{user.name}</p>
            <p className="break-words text-sm leading-6 text-[var(--color-muted-foreground)]">{user.email}</p>
          </div>
          <div className="flex flex-wrap gap-2">
            <span className="inline-flex items-center rounded-full border border-[var(--color-border)] bg-[var(--color-panel)] px-3 py-1 text-xs text-[var(--color-muted-foreground)]">
              {roleLabel}
            </span>
            <span className="inline-flex items-center rounded-full border border-[var(--color-border)] bg-[var(--color-panel)] px-3 py-1 text-xs text-[var(--color-muted-foreground)]">
              {user.tenant.name}
            </span>
            <span className="inline-flex items-center rounded-full border border-[var(--color-border)] bg-[var(--color-panel)] px-3 py-1 text-xs text-[var(--color-muted-foreground)]">
              {user.isActive ? "Ativo" : "Inativo"}
            </span>
            <span className="inline-flex items-center rounded-full border border-[var(--color-border)] bg-[var(--color-panel)] px-3 py-1 text-xs text-[var(--color-muted-foreground)]">
              Login: {getLastLoginLabel(user)}
            </span>
          </div>
          <p className="break-words text-xs leading-5 text-[var(--color-muted-foreground)]">
            Conta {user.tenant.slug} • {formatUserTenantPlanLabel(user)}
          </p>
          {user.role === "member" ? (
            <p className="break-words text-xs leading-5 text-[var(--color-muted-foreground)]">
              Vinculado a:{" "}
              {user.tenant.accountAdminName ? (
                <>
                  <strong>{user.tenant.accountAdminName}</strong>
                  {user.tenant.accountAdminEmail ? ` • ${user.tenant.accountAdminEmail}` : ""}
                </>
              ) : (
                "Titular da conta não identificado"
              )}
            </p>
          ) : null}
        </div>
        <div className="flex flex-wrap gap-2">
          <Button onClick={onToggleActive} type="button" variant="ghost">
            {user.isActive ? "Desativar" : "Ativar"}
          </Button>
          {isPlatformAdmin ? (
            <Button onClick={onToggleRole} type="button" variant="secondary">
              Tornar {user.role === "admin" ? "familiar" : "admin de conta"}
            </Button>
          ) : null}
        </div>
      </div>

      <details className="admin-disclosure mt-4">
        <summary className="admin-disclosure-summary">
          <div>
            <p className="admin-disclosure-kicker">Mais opções</p>
            <p className="admin-disclosure-title">Abrir ações avançadas do usuário</p>
          </div>
          <p className="admin-disclosure-copy">
            Mantém a visão limpa e mostra redefinição, movimentação e exclusão só quando necessário.
          </p>
        </summary>
        <div className="admin-disclosure-body space-y-4">
          <div className="rounded-[1.2rem] border border-[var(--color-border)] bg-[color-mix(in_srgb,var(--color-card)_92%,var(--color-muted))] p-4">
            {isPlatformAdmin ? (
              <div className="space-y-3">
                <Label>Redefinição segura</Label>
                <p className="rounded-[1rem] border border-[var(--color-border)] bg-[var(--color-panel)] px-3 py-2 text-xs leading-5 text-[var(--color-muted-foreground)]">
                  O suporte apenas dispara o link. A nova senha é definida pelo próprio usuário no fluxo autenticado por token.
                </p>
                <Button disabled={passwordActionDisabled} onClick={onSubmitPasswordReset} type="button" variant="secondary">
                  Enviar link de redefinição
                </Button>
              </div>
            ) : (
              <div className="space-y-3">
                <Label htmlFor={`user-${user.id}-password`}>Definir nova senha</Label>
                <Input
                  id={`user-${user.id}-password`}
                  autoComplete="new-password"
                  placeholder="Senha temporária, mínimo 8 caracteres"
                  type="password"
                  value={userPasswordDraft}
                  onChange={(event) => onUserPasswordChange(event.target.value)}
                />
                <p className="text-xs leading-5 text-[var(--color-muted-foreground)]">
                  Este painel não envia link: ele grava a nova senha informada pelo suporte.
                </p>
                <Button disabled={passwordActionDisabled} onClick={onSubmitPasswordReset} type="button" variant="secondary">
                  Salvar nova senha
                </Button>
              </div>
            )}
          </div>

          {isPlatformAdmin && !user.isPlatformAdmin ? (
            <div className="rounded-[1.2rem] border border-[var(--color-border)] bg-[color-mix(in_srgb,var(--color-card)_92%,var(--color-muted))] p-4">
              <div className="space-y-3">
                <div>
                  <p className="text-sm font-semibold">Mover para outra conta</p>
                  <p className="text-xs leading-5 text-[var(--color-muted-foreground)]">
                    Use apenas quando a pessoa realmente mudar de carteira administrativa.
                  </p>
                </div>
                <div className="grid gap-3 lg:grid-cols-[minmax(0,1fr)_auto]">
                  <Select onChange={(event) => onUserTenantChange(event.target.value)} value={userTenantDraft}>
                    {tenants.map((tenant) => (
                      <option key={tenant.id} value={tenant.id}>
                        {getTenantLabel(tenant)}
                      </option>
                    ))}
                  </Select>
                  <Button disabled={moveTenantDisabled} onClick={onMoveTenant} type="button" variant="ghost">
                    Alterar conta
                  </Button>
                </div>
              </div>
            </div>
          ) : null}

          {!user.isPlatformAdmin ? (
            <details className="admin-disclosure admin-disclosure-danger">
              <summary className="admin-disclosure-summary">
                <div>
                  <p className="admin-disclosure-kicker">Ação crítica</p>
                  <p className="admin-disclosure-title">Excluir pessoa e dados</p>
                </div>
                <p className="admin-disclosure-copy">Oculta a remoção definitiva até a confirmação consciente do operador.</p>
              </summary>
              <div className="admin-disclosure-body">
                <div className="danger-panel">
                  <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
                    <div className="min-w-0">
                      <p className="danger-kicker">Ação crítica</p>
                      <p className="danger-copy">
                        Remove <strong>{user.name}</strong> e os dados financeiros vinculados ao perfil. A ação respeita as travas de segurança para não desmontar a administração principal da conta.
                      </p>
                    </div>
                    <div className="w-full space-y-2 lg:w-auto">
                      <Label htmlFor={`user-${user.id}-delete-confirm`}>Confirme digitando o e-mail</Label>
                      <div className="flex flex-col gap-2 lg:flex-row">
                        <Input
                          id={`user-${user.id}-delete-confirm`}
                          placeholder={user.email}
                          value={userDeleteConfirmDraft}
                          onChange={(event) => onUserDeleteConfirmChange(event.target.value)}
                        />
                        <Button
                          className="w-full border-[var(--color-destructive)] bg-[color-mix(in_srgb,var(--color-destructive)_8%,transparent)] text-[var(--color-destructive)] hover:bg-[color-mix(in_srgb,var(--color-destructive)_14%,transparent)] lg:w-auto"
                          disabled={deleteUserDisabled}
                          onClick={onDeleteUser}
                          type="button"
                          variant="ghost"
                        >
                          Excluir pessoa e dados
                        </Button>
                      </div>
                    </div>
                  </div>
                </div>
              </div>
            </details>
          ) : null}
        </div>
      </details>
    </article>
  );
}
