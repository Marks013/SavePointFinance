# Webhook de E-mail com Resend

Este arquivo mostra como usar `NOTIFICATION_EMAIL_WEBHOOK_URL` quando voce quer que o Save Point envie e-mails por um endpoint intermediario, em vez de falar direto com o `Resend`.

## Quando usar

Use este modelo se voce quiser:

- manter o projeto principal com `EMAIL_PROVIDER=webhook`
- centralizar o envio de e-mail em outro servico
- ter um ponto unico para logs, filtros ou futuras automacoes

Se voce nao precisa disso, o caminho mais simples continua sendo:

```env
EMAIL_PROVIDER=resend
```

## Arquivo pronto

Exemplo incluido no projeto:

- [email-webhook-resend.mjs](/C:/Users/samue/Desktop/SavePoint/SavePoint/examples/email-webhook-resend.mjs)

## Payload recebido do Save Point

O sistema envia `POST` JSON assim:

```json
{
  "channel": "email",
  "tenantId": "tenant-id",
  "userId": "user-id",
  "goalId": null,
  "target": "usuario@dominio.com",
  "subject": "Assunto do email",
  "message": "Conteudo em texto",
  "attemptedAt": "2026-04-05T20:00:00.000Z"
}
```

## Como rodar o webhook

1. crie uma pasta separada no servidor para o webhook
2. copie o arquivo `examples/email-webhook-resend.mjs`
3. instale as dependencias:

```bash
npm init -y
npm install express
```

4. defina as variaveis:

```env
PORT=4000
RESEND_API_KEY=sua-chave-real
EMAIL_FROM=no-reply@seu-dominio.com
EMAIL_FROM_NAME=Save Point Finança
EMAIL_REPLY_TO=suporte@seu-dominio.com
```

5. rode:

```bash
node email-webhook-resend.mjs
```

## Configuracao no projeto principal

No `.env` do Save Point:

```env
EMAIL_PROVIDER=webhook
NOTIFICATION_EMAIL_WEBHOOK_URL=https://seu-dominio.com/email-webhook
```

Se o webhook estiver na mesma maquina e atras do Nginx Proxy Manager, aponte um host separado para ele, por exemplo:

- `mailhook.seu-dominio.com` -> `http://IP_DO_SERVIDOR:4000`

Entao use:

```env
NOTIFICATION_EMAIL_WEBHOOK_URL=https://mailhook.seu-dominio.com/email-webhook
```

## Health check

O exemplo expõe:

```text
GET /health
```

Resposta esperada:

```json
{
  "ok": true
}
```

## Recomendacao objetiva

Para o seu caso, a ordem de preferencia continua sendo:

1. `EMAIL_PROVIDER=resend`
2. `EMAIL_PROVIDER=brevo`
3. `EMAIL_PROVIDER=webhook` apenas se voce realmente quiser um intermediario
