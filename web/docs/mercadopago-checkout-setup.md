# Guia de configuração do Mercado Pago no SavePointFinance

Este projeto já usa `mercadopago`, `@mercadopago/sdk-react`, Bricks no frontend e webhook assíncrono no backend.

## 1. Criar a aplicação no Mercado Pago

1. Acesse o painel de desenvolvedores do Mercado Pago.
2. Crie uma aplicação para o ambiente de testes e outra para produção.
3. Guarde:
   - `Public Key`
   - `Access Token`
   - `Webhook Secret`

Referências oficiais:
- [Prerequisites](https://www.mercadopago.com.br/developers/en/docs/checkout-bricks/prerequisites)
- [Common initialization](https://www.mercadopago.com.br/developers/en/docs/checkout-bricks/common-initialization)
- [Notifications / Webhooks](https://www.mercadopago.com.br/developers/es/docs/checkout-pro/additional-content/notifications)

## 2. Configurar variáveis de ambiente no `web/.env`

Preencha no ambiente do `web/`:

```env
MP_BILLING_ENABLED=true
MP_ACCESS_TOKEN=APP_USR-...
MP_PUBLIC_KEY=APP_USR-...
MP_WEBHOOK_SECRET=...
NEXT_PUBLIC_APP_URL=https://seu-dominio.com
AUTOMATION_CRON_SECRET=uma-chave-forte
```

Opcional, mas recomendado para comunicação com clientes:

```env
EMAIL_PROVIDER=resend
EMAIL_FROM=contato@seu-dominio.com
RESEND_API_KEY=...
```

## 3. URL correta do webhook

Cadastre no Mercado Pago:

```text
https://seu-dominio.com/api/integrations/mercadopago/webhook
```

No SavePoint, essa rota:
- valida e enfileira o evento;
- deduplica notificações repetidas;
- processa o webhook de forma assíncrona;
- sincroniza assinatura e pagamentos com a licença da conta.

Arquivo principal:

[`web/app/api/integrations/mercadopago/webhook/route.ts`](/C:/Users/samue/Desktop/SavePointFinance/web/app/api/integrations/mercadopago/webhook/route.ts)

## 4. Fluxo esperado no sistema

1. O usuário escolhe o plano em `/planos`.
2. Se já estiver autenticado e clicar no Premium, vai para `/billing?intent=checkout`.
3. Se ainda não tiver conta, vai para `/cadastro?plan=pro`.
4. O cadastro cria a conta e redireciona para o checkout autenticado.
5. O Brick envia os dados do cartão com tokenização do Mercado Pago.
6. O backend cria a assinatura recorrente.
7. O webhook confirma o pagamento e libera a licença.

Arquivos-chave:

- [`web/app/planos/page.tsx`](/C:/Users/samue/Desktop/SavePointFinance/web/app/planos/page.tsx)
- [`web/features/auth/components/public-registration-form.tsx`](/C:/Users/samue/Desktop/SavePointFinance/web/features/auth/components/public-registration-form.tsx)
- [`web/app/billing/page.tsx`](/C:/Users/samue/Desktop/SavePointFinance/web/app/billing/page.tsx)
- [`web/features/billing/components/checkout-client.tsx`](/C:/Users/samue/Desktop/SavePointFinance/web/features/billing/components/checkout-client.tsx)
- [`web/lib/billing/service.ts`](/C:/Users/samue/Desktop/SavePointFinance/web/lib/billing/service.ts)

## 5. Testes recomendados

Antes de subir:

```bash
npm run db:generate
npm run typecheck
npm run lint
npm run build
```

Se estiver usando Docker:

```bash
docker compose build web
```

## 6. Checklist de produção

- `MP_BILLING_ENABLED=true`
- `NEXT_PUBLIC_APP_URL` apontando para o domínio final
- webhook cadastrado com HTTPS
- `MP_WEBHOOK_SECRET` igual ao configurado no Mercado Pago
- conta Premium redirecionando para `/billing?intent=checkout`
- trial vencido bloqueando acesso e mandando para `/billing`
- webhook chegando e atualizando assinatura sem depender do frontend

## 7. Erros comuns

- `MP_BILLING_ENABLED=false`: o checkout não abre.
- `MP_PUBLIC_KEY` errada: o Brick não inicializa.
- `MP_ACCESS_TOKEN` errado: a assinatura não é criada.
- `MP_WEBHOOK_SECRET` errado: os eventos podem ser rejeitados.
- `NEXT_PUBLIC_APP_URL` incorreta: links de retorno e integração ficam inconsistentes.
- webhook não publicado em produção: pagamento aprovado não libera a licença.
