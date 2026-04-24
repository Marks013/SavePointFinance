# Guia de configuração do Mercado Pago no SavePointFinance

Este guia descreve como deixar o checkout Mercado Pago funcional no projeto atual. A aplicação já possui Checkout Bricks no frontend, rotas de billing no backend, webhook assíncrono e auditoria de simulação.

## Arquivos envolvidos

- `web/features/billing/components/checkout-client.tsx`: renderiza o Card Payment Brick mensal e o CTA anual.
- `web/app/api/billing/checkout/route.ts`: entrega dados de checkout para a tela.
- `web/app/api/billing/checkout/create-subscription/route.ts`: cria a assinatura/preapproval.
- `web/app/api/billing/checkout/create-annual-payment/route.ts`: cria a preferência Checkout Pro anual.
- `web/app/api/integrations/mercadopago/webhook/route.ts`: recebe notificações.
- `web/lib/billing/mercadopago.ts`: cliente HTTP Mercado Pago.
- `web/lib/billing/service.ts`: sincroniza assinatura, pagamento e licença.
- `web/lib/billing/async-processor.ts`: processa fila de webhooks.
- `web/scripts/billing-webhook-e2e-sim.ts`: simulação local.

## 1. Criar aplicação no Mercado Pago

No painel de desenvolvedores do Mercado Pago:

1. Crie uma aplicação para o SavePointFinance.
2. Copie a Public Key.
3. Copie o Access Token.
4. Configure um segredo de webhook.
5. Use credenciais de teste enquanto estiver em homologação.

O Access Token deve existir apenas no servidor. O frontend usa somente a Public Key.

## 2. Configurar variáveis

Em `web/.env.local` para desenvolvimento, ou no provedor de produção:

```env
MP_BILLING_ENABLED=true
MP_ACCESS_TOKEN=APP_USR-...
MP_PUBLIC_KEY=APP_USR-...
MP_WEBHOOK_SECRET=...
MP_BILLING_PLAN_SLUG=premium-completo
MP_BILLING_REASON=Save Point Financa Premium
MP_BILLING_AMOUNT=49.90
MP_BILLING_ANNUAL_AMOUNT=499.00
MP_BILLING_ANNUAL_MAX_INSTALLMENTS=12
MP_BILLING_CURRENCY=BRL
MP_BILLING_FREQUENCY=1
MP_BILLING_FREQUENCY_TYPE=months
NEXT_PUBLIC_APP_URL=https://seu-dominio.com
AUTOMATION_CRON_SECRET=uma-chave-forte
```

Quando `MP_BILLING_ENABLED=true`, o schema do servidor exige:

- `MP_ACCESS_TOKEN`
- `MP_PUBLIC_KEY`
- `MP_WEBHOOK_SECRET`
- `MP_BILLING_AMOUNT`

`MP_BILLING_ANNUAL_AMOUNT` é opcional. Se não for definido, o checkout anual usa 10 vezes o valor mensal.

## 3. Cadastrar webhook

URL:

```text
https://seu-dominio.com/api/integrations/mercadopago/webhook
```

Tópicos recomendados:

- `payment`
- `subscription_preapproval`
- `subscription_authorized_payment`

O endpoint responde rapidamente e deixa o processamento pesado para a fila local. Isso é importante porque o Mercado Pago espera confirmação HTTP `200` ou `201`; sem essa confirmação, ele tenta reenviar a notificação.

## 4. Fluxo funcional

1. Usuário escolhe Premium em `/planos` ou no cadastro.
2. Cadastro/login cria sessão e leva para `/billing?intent=checkout`.
3. `checkout-client.tsx` inicializa o Mercado Pago com `MP_PUBLIC_KEY`.
4. No mensal, o Card Payment Brick coleta os dados do cartão e `create-subscription/route.ts` cria a assinatura.
5. No anual, `create-annual-payment/route.ts` cria uma preferência Checkout Pro para pagamento único.
6. O webhook recebe eventos de pagamento/assinatura.
7. `service.ts` atualiza assinatura, pagamentos e licença da conta. Pagamento anual aprovado libera 12 meses, sem renovação automática.
8. O superadmin pode consultar e sincronizar billing por conta.

## 5. Testes locais

```bash
cd web
npm run typecheck
npm run lint
npm run audit:billing-webhook
npm run build
```

Para testar webhook externo localmente, exponha `localhost:3000` com um túnel HTTPS e use a URL pública no painel do Mercado Pago.

## 6. Checklist de produção

- `NEXT_PUBLIC_APP_URL` usa o domínio HTTPS final.
- Webhook cadastrado com a rota `/api/integrations/mercadopago/webhook`.
- `MP_WEBHOOK_SECRET` é idêntico ao segredo configurado no painel.
- `MP_ACCESS_TOKEN` não aparece em bundle, HTML ou logs do navegador.
- Plano `premium-completo` existe no catálogo do superadmin ou `MP_BILLING_PLAN_SLUG` aponta para o slug correto.
- `npm run audit:billing-webhook` passa.
- Um pagamento de teste percorre: checkout, assinatura, webhook, licença ativa.

## 7. Problemas comuns

- `MP_BILLING_ENABLED=false`: o checkout não abre.
- `MP_PUBLIC_KEY` incorreta: o Brick não inicializa.
- `MP_ACCESS_TOKEN` incorreto: a assinatura não é criada.
- `MP_WEBHOOK_SECRET` diferente: eventos podem ser rejeitados.
- `NEXT_PUBLIC_APP_URL` incorreta: callbacks e links de retorno ficam inconsistentes.
- Webhook sem HTTPS em produção: o Mercado Pago não entrega corretamente.
- Testes com credenciais de teste podem exigir envio pelo painel de integrações para validar recepção de webhook.

## Referências oficiais

- [Checkout Bricks - Common initialization](https://www.mercadopago.com.br/developers/en/docs/checkout-bricks/common-initialization)
- [Card Payment Brick](https://www.mercadopago.com.br/developers/en/docs/checkout-bricks/card-payment-brick/introduction)
- [Card Payment Brick - Default rendering](https://www.mercadopago.com.br/developers/en/docs/checkout-bricks/card-payment-brick/default-rendering)
- [Webhooks](https://www.mercadopago.com.co/developers/en/docs/checkout-bricks/additional-content/your-integrations/notifications/webhooks)
