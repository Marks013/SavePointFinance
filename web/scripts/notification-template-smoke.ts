import assert from "node:assert/strict";

import { buildGenericNotificationEmail } from "../lib/notifications/email-template";
import { buildInvitationMessage } from "../lib/notifications/invitation";
import { buildPasswordResetMessage } from "../lib/notifications/password-reset";

function run() {
  const sharedInvite = buildInvitationMessage("token-1", "Casa Silva", "Marina", "shared_wallet");
  const isolatedInvite = buildInvitationMessage("token-2", "Carteira Marina", "Marina", "admin_isolated");
  const reset = buildPasswordResetMessage("token-3", "Marina");
  const billing = buildGenericNotificationEmail(
    "Fatura próxima do vencimento: Nubank",
    "A fatura do cartão Nubank vence em breve."
  );

  assert.match(sharedInvite.subject, /compartilhar/i);
  assert.match(isolatedInvite.subject, /nova carteira/i);
  assert.notEqual(sharedInvite.subject, isolatedInvite.subject);

  assert.match(sharedInvite.html, /Compartilhamento/);
  assert.match(isolatedInvite.html, /Nova carteira/);
  assert.match(reset.html, /Segurança da conta/);
  assert.match(reset.html, /Redefina sua senha/);
  assert.match(billing, /Pagamentos/);
  assert.match(billing, /Fatura próxima do vencimento/);

  console.log("notification-template-smoke:ok");
}

run();
