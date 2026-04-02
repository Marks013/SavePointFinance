import aiosmtplib
import logging
from email.mime.text import MIMEText
from email.mime.multipart import MIMEMultipart
from typing import Optional
from app.config import settings

logger = logging.getLogger(__name__)


class EmailService:
    """Serviço de envio de e-mails via SMTP异步."""
    
    def __init__(self):
        self.enabled = bool(settings.SMTP_HOST and settings.SMTP_USER)
    
    async def send_email(
        self,
        to_email: str,
        subject: str,
        html_content: str,
        text_content: Optional[str] = None
    ) -> bool:
        """
        Envia um e-mail via SMTP de forma assíncrona.
        
        Args:
            to_email: E-mail do destinatário
            subject: Assunto do e-mail
            html_content: Conteúdo HTML do e-mail
            text_content: Conteúdo texto puro (fallback)
            
        Returns:
            True se enviado com sucesso, False caso contrário
        """
        if not self.enabled:
            logger.warning(f"SMTP não configurado. E-mail para {to_email} não enviado.")
            return False
        
        if not text_content:
            text_content = html_content.replace("<br>", "\n").replace("<p>", "").replace("</p>", "\n")
        
        try:
            msg = MIMEMultipart("alternative")
            msg["Subject"] = subject
            msg["From"] = f"{settings.SMTP_FROM_NAME} <{settings.SMTP_FROM_EMAIL}>"
            msg["To"] = to_email
            
            part1 = MIMEText(text_content, "plain", "utf-8")
            part2 = MIMEText(html_content, "html", "utf-8")
            
            msg.attach(part1)
            msg.attach(part2)
            
            await aiosmtplib.send(
                msg,
                hostname=settings.SMTP_HOST,
                port=settings.SMTP_PORT,
                start_tls=True,
                username=settings.SMTP_USER,
                password=settings.SMTP_PASSWORD,
            )
            
            logger.info(f"E-mail enviado com sucesso para {to_email}")
            return True
            
        except Exception as e:
            logger.error(f"Erro ao enviar e-mail para {to_email}: {e}")
            return False
    
    async def send_password_reset_email(
        self,
        to_email: str,
        reset_token: str,
        user_name: str
    ) -> bool:
        """Envia e-mail de recuperação de senha."""
        
        reset_link = f"{settings.APP_URL}/reset-password?token={reset_token}"
        
        html_content = f"""
<!DOCTYPE html>
<html>
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>Recuperar Senha - SavePoint Finance</title>
    <style>
        body {{
            font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
            background-color: #080B10;
            color: #E8EDF2;
            margin: 0;
            padding: 0;
        }}
        .container {{
            max-width: 600px;
            margin: 0 auto;
            padding: 20px;
        }}
        .header {{
            text-align: center;
            padding: 30px 0;
        }}
        .logo {{
            font-size: 28px;
            font-weight: 700;
            color: #00E57A;
        }}
        .content {{
            background-color: #0F1419;
            border-radius: 16px;
            padding: 30px;
            margin: 20px 0;
            border: 1px solid rgba(255,255,255,0.06);
        }}
        .title {{
            font-size: 24px;
            font-weight: 600;
            margin-bottom: 20px;
            color: #E8EDF2;
        }}
        .text {{
            font-size: 16px;
            line-height: 1.6;
            color: #8B9BB4;
            margin-bottom: 20px;
        }}
        .button {{
            display: inline-block;
            background: linear-gradient(135deg, #00E57A 0%, #00B860 100%);
            color: #080B10 !important;
            padding: 16px 32px;
            border-radius: 10px;
            text-decoration: none;
            font-weight: 600;
            font-size: 16px;
            margin: 20px 0;
        }}
        .button:hover {{
            transform: translateY(-2px);
            box-shadow: 0 4px 20px rgba(0,229,122,0.3);
        }}
        .link-text {{
            font-size: 14px;
            color: #8B9BB4;
            word-break: break-all;
            background: #141C24;
            padding: 12px;
            border-radius: 8px;
            margin: 10px 0;
        }}
        .footer {{
            text-align: center;
            padding: 20px;
            color: #8B9BB4;
            font-size: 14px;
        }}
        .warning {{
            color: #F59E0B;
            font-size: 14px;
            margin-top: 20px;
        }}
    </style>
</head>
<body>
    <div class="container">
        <div class="header">
            <div class="logo">SavePoint Finance</div>
        </div>
        
        <div class="content">
            <div class="title">Olá, {user_name}!</div>
            
            <p class="text">
                Recebemos uma solicitação para redefinir a senha da sua conta no SavePoint Finance.
            </p>
            
            <p class="text">
                Clique no botão abaixo para criar uma nova senha:
            </p>
            
            <div style="text-align: center;">
                <a href="{reset_link}" class="button">Redefinir Minha Senha</a>
            </div>
            
            <p class="text" style="margin-top: 30px;">
                Ou copie e cole este link no seu navegador:
            </p>
            
            <div class="link-text">{reset_link}</div>
            
            <p class="warning">
                ⚠️ Este link expira em 24 horas. Se você não solicitou esta recuperação, 
                pode ignorar este e-mail com segurança.
            </p>
        </div>
        
        <div class="footer">
            <p>SavePoint Finance - Controle suas finanças pessoais</p>
            <p style="font-size: 12px; color: #6B7280;">
                Este e-mail foi enviado automaticamente. Por favor, não responda.
            </p>
        </div>
    </div>
</body>
</html>
        """
        
        text_content = f"""
Olá, {user_name}!

Recebemos uma solicitação para redefinir a senha da sua conta no SavePoint Finance.

Para criar uma nova senha, copie e cole o link abaixo no seu navegador:
{reset_link}

Este link expira em 24 horas.

Se você não solicitou esta recuperação, pode ignorar este e-mail com segurança.

Atenciosamente,
Equipe SavePoint Finance
        """
        
        return await self.send_email(
            to_email=to_email,
            subject="Redefinir sua senha - SavePoint Finance",
            html_content=html_content,
            text_content=text_content
        )
    
    async def send_welcome_email(
        self,
        to_email: str,
        user_name: str,
        workspace_name: str
    ) -> bool:
        """Envia e-mail de boas-vindas ao criar conta."""
        
        html_content = f"""
<!DOCTYPE html>
<html>
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>Bem-vindo ao SavePoint Finance</title>
    <style>
        body {{
            font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
            background-color: #080B10;
            color: #E8EDF2;
            margin: 0;
            padding: 0;
        }}
        .container {{
            max-width: 600px;
            margin: 0 auto;
            padding: 20px;
        }}
        .header {{
            text-align: center;
            padding: 30px 0;
        }}
        .logo {{
            font-size: 28px;
            font-weight: 700;
            color: #00E57A;
        }}
        .content {{
            background-color: #0F1419;
            border-radius: 16px;
            padding: 30px;
            margin: 20px 0;
            border: 1px solid rgba(255,255,255,0.06);
        }}
        .title {{
            font-size: 24px;
            font-weight: 600;
            margin-bottom: 20px;
            color: #E8EDF2;
        }}
        .text {{
            font-size: 16px;
            line-height: 1.6;
            color: #8B9BB4;
            margin-bottom: 20px;
        }}
        .button {{
            display: inline-block;
            background: linear-gradient(135deg, #00E57A 0%, #00B860 100%);
            color: #080B10 !important;
            padding: 16px 32px;
            border-radius: 10px;
            text-decoration: none;
            font-weight: 600;
            font-size: 16px;
            margin: 20px 0;
        }}
        .features {{
            list-style: none;
            padding: 0;
            margin: 20px 0;
        }}
        .features li {{
            padding: 10px 0;
            color: #8B9BB4;
            display: flex;
            align-items: center;
        }}
        .features li::before {{
            content: '✓';
            color: #00E57A;
            margin-right: 10px;
            font-weight: bold;
        }}
        .footer {{
            text-align: center;
            padding: 20px;
            color: #8B9BB4;
            font-size: 14px;
        }}
    </style>
</head>
<body>
    <div class="container">
        <div class="header">
            <div class="logo">SavePoint Finance</div>
        </div>
        
        <div class="content">
            <div class="title">Bem-vindo, {user_name}!</div>
            
            <p class="text">
                Você criou sua conta no SavePoint Finance com sucesso!
            </p>
            
            <p class="text">
                Workspace: <strong>{workspace_name}</strong>
            </p>
            
            <p class="text">
                Agora você pode começar a controlar suas finanças de forma inteligente:
            </p>
            
            <ul class="features">
                <li>Controle de receitas e despesas</li>
                <li>Categorização automática por IA</li>
                <li>Metas de economia</li>
                <li>Relatórios e gráficos</li>
                <li>Assinaturas e parcelamentos</li>
            </ul>
            
            <div style="text-align: center;">
                <a href="{settings.APP_URL}/login" class="button">Começar Agora</a>
            </div>
        </div>
        
        <div class="footer">
            <p>SavePoint Finance - Controle suas finanças pessoais</p>
            <p style="font-size: 12px; color: #6B7280;">
                Este e-mail foi enviado automaticamente. Por favor, não responda.
            </p>
        </div>
    </div>
</body>
</html>
        """
        
        text_content = f"""
Bem-vindo, {user_name}!

Você criou sua conta no SavePoint Finance com sucesso!

Workspace: {workspace_name}

Agora você pode começar a controlar suas finanças de forma inteligente:
- Controle de receitas e despesas
- Categorização automática por IA
- Metas de economia
- Relatórios e gráficos
- Assinaturas e parcelamentos

Acesse: {settings.APP_URL}/login

Atenciosamente,
Equipe SavePoint Finance
        """
        
        return await self.send_email(
            to_email=to_email,
            subject=f"Bem-vindo ao SavePoint Finance, {user_name}!",
            html_content=html_content,
            text_content=text_content
        )


email_service = EmailService()