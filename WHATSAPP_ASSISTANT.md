# Assistente WhatsApp

## Direcao adotada

O assistente roda direto no backend do SavePoint, sem `n8n`.

Isso foi escolhido para manter no proprio sistema:

- autenticacao do usuario
- permissao por usuario
- contas e cartoes vinculados ao dono
- calculos financeiros
- historico e auditoria das mensagens

## Regras de vinculacao

- o numero do WhatsApp fica salvo no perfil do usuario
- contas bancarias pertencem ao usuario dono
- cartoes pertencem ao usuario dono
- consultas e lancamentos pelo WhatsApp usam apenas os dados do proprio usuario

## Webhook

Endpoint:

- `GET /api/integrations/whatsapp/webhook`
- `POST /api/integrations/whatsapp/webhook`

## Variaveis de ambiente

- `WHATSAPP_ASSISTANT_ENABLED`
- `WHATSAPP_VERIFY_TOKEN`
- `WHATSAPP_ACCESS_TOKEN`
- `WHATSAPP_PHONE_NUMBER_ID`
- `WHATSAPP_GRAPH_VERSION`
- `WHATSAPP_APP_SECRET`

## Como habilitar

1. vincule o numero do usuario em `Configuracoes`
2. configure as variaveis do WhatsApp no `.env`
3. aponte o webhook do Meta para:

```text
https://SEU_DOMINIO/api/integrations/whatsapp/webhook
```

4. use `WHATSAPP_VERIFY_TOKEN` no desafio de verificacao

## Comandos suportados

### Lancamentos

- `gastei 42,50 mercado na Nubank`
- `gastei 320 farmacia no cartao Visa 3x`
- `recebi 3200 salario no Itau`

### Consultas

- `saldo`
- `saldo Nubank`
- `fatura Visa`
- `limite Mastercard`
- `ajuda`

## Comportamento

- despesas e receitas viram `Transaction` com origem `whatsapp`
- a categoria pode ser sugerida automaticamente
- as mensagens recebidas e respondidas ficam registradas em `WhatsAppMessage`
- a resposta sempre volta pelo proprio WhatsApp Cloud API

## Observacoes operacionais

- se o numero nao estiver vinculado a um usuario, o assistente nao acessa nenhum dado financeiro
- se houver varias contas ou varios cartoes e o comando ficar ambiguo, o assistente pede para especificar
- cartoes e contas consultados pelo assistente respeitam o usuario dono
