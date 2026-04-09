import { config as loadEnv } from "dotenv";
import { resolve } from "node:path";

loadEnv({ path: resolve(process.cwd(), "../.env"), override: false });
loadEnv({ path: resolve(process.cwd(), ".env"), override: false });

function assertCondition(condition: unknown, message: string): asserts condition {
  if (!condition) {
    throw new Error(message);
  }
}

async function main() {
  const provider = process.env.EMAIL_PROVIDER?.trim() || "webhook";
  const apiKey = process.env.RESEND_API_KEY?.trim();
  const from = process.env.EMAIL_FROM?.trim();
  const to = process.env.RESEND_AUDIT_TO?.trim() || from;

  assertCondition(apiKey, "RESEND_API_KEY não configurada");
  assertCondition(from, "EMAIL_FROM não configurado");
  assertCondition(to, "Defina RESEND_AUDIT_TO ou EMAIL_FROM para validar o envio");

  const response = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${apiKey}`
    },
    body: JSON.stringify({
      from,
      to: [to],
      subject: `SavePoint Resend Audit ${new Date().toISOString()}`,
      text: "Teste automatizado de integração Resend do SavePoint.",
      html: "<p>Teste automatizado de integração <strong>Resend</strong> do SavePoint.</p>",
      ...(process.env.EMAIL_REPLY_TO?.trim() ? { reply_to: process.env.EMAIL_REPLY_TO.trim() } : {})
    })
  });

  const payloadText = await response.text().catch(() => "");

  assertCondition(
    response.ok,
    `Resend respondeu ${response.status}${payloadText.trim() ? `: ${payloadText.trim()}` : ""}`
  );

  console.log("RESEND_AUDIT_OK");
  console.log(
    JSON.stringify(
      {
        provider,
        status: response.status,
        target: to,
        response: payloadText.trim() || null
      },
      null,
      2
    )
  );
}

main().catch((error) => {
  console.error("RESEND_AUDIT_FAILED");
  console.error(error instanceof Error ? error.message : error);
  process.exitCode = 1;
});
