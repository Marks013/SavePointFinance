import express from "express";

const app = express();
const port = Number(process.env.PORT || 4000);

app.use(express.json());

function resolveFrom() {
  const email = process.env.EMAIL_FROM?.trim();
  const name = process.env.EMAIL_FROM_NAME?.trim();

  if (!email) {
    return null;
  }

  return name ? `${name} <${email}>` : email;
}

app.get("/health", (_request, response) => {
  response.status(200).json({ ok: true });
});

app.post("/email-webhook", async (request, response) => {
  try {
    const { channel, target, subject, message } = request.body ?? {};
    const resendApiKey = process.env.RESEND_API_KEY?.trim();
    const from = resolveFrom();

    if (channel !== "email") {
      return response.status(400).json({ message: "Canal invalido" });
    }

    if (!target || !subject || !message) {
      return response.status(400).json({ message: "Payload incompleto" });
    }

    if (!resendApiKey || !from) {
      return response.status(500).json({
        message: "Webhook sem configuracao do Resend. Defina RESEND_API_KEY e EMAIL_FROM."
      });
    }

    const resendResponse = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${resendApiKey}`
      },
      body: JSON.stringify({
        from,
        to: [target],
        subject,
        text: message,
        ...(process.env.EMAIL_REPLY_TO?.trim() ? { reply_to: process.env.EMAIL_REPLY_TO.trim() } : {})
      })
    });

    const resendPayload = await resendResponse.text();

    if (!resendResponse.ok) {
      return response.status(502).json({
        message: "Falha ao enviar email pelo Resend",
        providerStatus: resendResponse.status,
        providerResponse: resendPayload
      });
    }

    return response.status(200).json({
      success: true,
      providerStatus: resendResponse.status,
      providerResponse: resendPayload
    });
  } catch (error) {
    return response.status(500).json({
      message: error instanceof Error ? error.message : "Falha desconhecida"
    });
  }
});

app.listen(port, () => {
  console.log(`Email webhook com Resend ativo em http://0.0.0.0:${port}`);
});
