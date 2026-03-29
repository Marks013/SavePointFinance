"""
Serviço de integração com WhatsApp Business API (Meta Cloud API)
Gerencia envio e recebimento de mensagens
"""
import os
import json
import re
import uuid
import asyncio
from datetime import datetime, timedelta
from typing import Optional
import aiohttp
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select

from app.config import settings
from app.models.whatsapp import WhatsAppUser, WhatsAppCommand, WhatsAppSession


class WhatsAppService:
    """
    Cliente para WhatsApp Business API da Meta.
    """
    
    def __init__(self):
        self.phone_number_id = os.getenv("WHATSAPP_PHONE_NUMBER_ID", "")
        self.access_token = os.getenv("WHATSAPP_ACCESS_TOKEN", "")
        self.api_url = f"https://graph.facebook.com/v21.0/{self.phone_number_id}"
        self.verify_token = settings.WHATSAPP_VERIFY_TOKEN
    
    async def _make_request(
        self, 
        method: str, 
        endpoint: str, 
        data: Optional[dict] = None,
        params: Optional[dict] = None
    ) -> dict:
        """ Faz requisição para API do WhatsApp """
        url = f"{self.api_url}/{endpoint}"
        headers = {
            "Authorization": f"Bearer {self.access_token}",
            "Content-Type": "application/json"
        }
        
        async with aiohttp.ClientSession() as session:
            async with session.request(method, url, json=data, params=params, headers=headers) as resp:
                return await resp.json()
    
    async def send_text_message(self, to: str, text: str) -> dict:
        """ Envia mensagem de texto """
        data = {
            "messaging_product": "whatsapp",
            "to": to,
            "type": "text",
            "text": {"body": text}
        }
        return await self._make_request("POST", "messages", data)
    
    async def send_interactive_list(
        self, 
        to: str, 
        title: str, 
        description: str, 
        sections: list
    ) -> dict:
        """ Envia mensagem com lista interativa (botões) """
        data = {
            "messaging_product": "whatsapp",
            "to": to,
            "type": "interactive",
            "interactive": {
                "type": "list",
                "title": title,
                "body": description,
                "footer": "Save Point Finanças",
                "sections": sections
            }
        }
        return await self._make_request("POST", "messages", data)
    
    async def send_buttons(
        self, 
        to: str, 
        body: str, 
        buttons: list
    ) -> dict:
        """ Envia mensagem com botões de ação """
        data = {
            "messaging_product": "whatsapp",
            "to": to,
            "type": "interactive",
            "interactive": {
                "type": "button",
                "body": {"text": body},
                "action": {
                    "buttons": buttons
                }
            }
        }
        return await self._make_request("POST", "messages", data)
    
    async def send_template(self, to: str, template_name: str, components: list = None) -> dict:
        """ Envia mensagem usando template oficial do WhatsApp """
        data = {
            "messaging_product": "whatsapp",
            "to": to,
            "type": "template",
            "template": {
                "name": template_name,
                "language": {"code": "pt_BR"},
                "components": components or []
            }
        }
        return await self._make_request("POST", "messages", data)
    
    async def mark_message_read(self, message_id: str) -> dict:
        """ Marca mensagem como lida """
        data = {
            "messaging_product": "whatsapp",
            "status": "read",
            "message_id": message_id
        }
        return await self._make_request("POST", "messages", data)
    
    def verify_webhook(self, mode: str, token: str, challenge: str) -> tuple:
        """ Verifica webhook do WhatsApp """
        if mode == "subscribe" and token == self.verify_token:
            return True, challenge
        return False, None


class WhatsAppCommandHandler:
    """
    Gerencia comandos recebidos via WhatsApp.
    """
    
    def __init__(self, db: AsyncSession):
        self.db = db
        self.wa_service = WhatsAppService()
    
    def normalize_phone(self, phone: str) -> str:
        """ Normaliza número de telefone para formato WhatsApp """
        digits = re.sub(r'\D', '', phone)
        if len(digits) == 10:
            digits = "55" + digits
        elif len(digits) == 11 and digits[0] == "0":
            digits = "55" + digits[1:]
        elif len(digits) == 12 and digits[:2] == "55":
            pass
        else:
            digits = "55" + digits
        return digits
    
    def validate_cpf(self, cpf: str) -> bool:
        """ Valida CPF brasileiro """
        cpf = re.sub(r'\D', '', cpf)
        if len(cpf) != 11:
            return False
        if cpf == cpf[0] * 11:
            return False
        
        for i in range(1, 3):
            if cpf[i:] == cpf[i-1:-1] * (11-i):
                return False
        
        sum1 = sum(int(cpf[i]) * (10 - i) for i in range(9))
        digit1 = (sum1 * 10 % 11) % 10
        if digit1 != int(cpf[9]):
            return False
        
        sum2 = sum(int(cpf[i]) * (11 - i) for i in range(10))
        digit2 = (sum2 * 10 % 11) % 10
        return digit2 == int(cpf[10])
    
    def parse_expense_command(self, text: str) -> Optional[dict]:
        """
        Parseia comando de despesa.
        Formatos aceitos:
        - "gasto 50 mercado" 
        - "despesa 120.50"
        - "gastei 80 no cinema"
        """
        text = text.strip().lower()
        
        patterns = [
            r'gasto[s]?\s+(?:r?\$?\s*)?(\d+[.,]?\d*)\s*(?:no\s+)?(.+)?',
            r'despesa\s+(?:r?\$?\s*)?(\d+[.,]?\d*)\s*(?:no\s+)?(.+)?',
            r'gastei\s+(?:r?\$?\s*)?(\d+[.,]?\d*)\s*(?:no\s+)?(.+)?',
            r'gastou\s+(?:r?\$?\s*)?(\d+[.,]?\d*)\s*(?:no\s+)?(.+)?',
            r'paguei\s+(?:r?\$?\s*)?(\d+[.,]?\d*)\s*(?:no\s+)?(.+)?',
            r'(-?\d+[.,]?\d*)\s+(.+)',
        ]
        
        for pattern in patterns:
            match = re.search(pattern, text)
            if match:
                amount_str = match.group(1).replace(',', '.')
                description = match.group(2).strip() if match.lastindex >= 2 else "Despesa"
                
                try:
                    amount = float(amount_str)
                    if amount > 0:
                        return {
                            "amount": amount,
                            "description": description[:100],
                            "type": "expense"
                        }
                except ValueError:
                    continue
        
        return None
    
    async def get_or_create_whatsapp_user(self, phone: str, cpf: str = None) -> WhatsAppUser:
        """ Busca ou cria usuário WhatsApp """
        phone = self.normalize_phone(phone)
        
        result = await self.db.execute(
            select(WhatsAppUser).where(WhatsAppUser.phone_number == phone)
        )
        user = result.scalar_one_or_none()
        
        if not user:
            user = WhatsAppUser(
                phone_number=phone,
                cpf=cpf,
                is_verified=False
            )
            self.db.add(user)
            await self.db.flush()
        
        return user
    
    async def find_user_by_cpf(self, cpf: str) -> Optional[uuid.UUID]:
        """ Encontra tenant_id pelo CPF """
        from app.models.user import User
        from app.models.tenant import Tenant
        
        cpf_clean = re.sub(r'\D', '', cpf)
        
        result = await self.db.execute(
            select(User).join(Tenant).where(
                User.cpf == cpf_clean,
                Tenant.is_active == True
            )
        )
        user = result.scalar_one_or_none()
        
        if user:
            return user.id, user.tenant_id
        return None, None
    
    async def process_message(self, from_number: str, message_text: str, message_id: str = None) -> str:
        """ Processa mensagem recebida e retorna resposta """
        from_number = self.normalize_phone(from_number)
        message_text = message_text.strip()
        
        # Busca ou cria usuário
        wa_user = await self.get_or_create_whatsapp_user(from_number)
        
        # Atualiza último contato
        wa_user.last_message_at = datetime.utcnow()
        
        # Registra comando
        command = WhatsAppCommand(
            whatsapp_user_id=wa_user.id,
            command_type="message",
            command_data=json.dumps({"from": from_number, "text": message_text}),
            success=True
        )
        self.db.add(command)
        
        # Processa comando
        response = await self._handle_command(wa_user, message_text)
        
        # Salva resposta
        command.response_message = response
        await self.db.commit()
        
        return response
    
    async def _handle_command(self, wa_user: WhatsAppUser, text: str) -> str:
        """ Executa comando do usuário """
        text = text.strip().lower()
        
        # Verifica se está em sessão ativa
        session = await self._get_active_session(wa_user.id)
        if session:
            return await self._handle_session(wa_user, session, text)
        
        # Comandos de autenticação
        if text.startswith("vincular") or text.startswith("login") or text.startswith("codigo"):
            return await self._cmd_vincular(wa_user, text)
        
        if text.startswith("verificar") or text.startswith("codigo"):
            return await self._cmd_verificar(wa_user, text)
        
        # Comandos de despesa
        if any(text.startswith(cmd) for cmd in ["gasto", "gastei", "gastou", "despesa", "paguei", "-"]):
            if wa_user.is_verified and wa_user.tenant_id:
                return await self._cmd_add_expense(wa_user, text)
            return self._msg_nao_vinculado()
        
        # Comandos de receita
        if any(text.startswith(cmd) for cmd in ["recebi", "receita", "ganhei", "salário", "freela"]):
            if wa_user.is_verified and wa_user.tenant_id:
                return await self._cmd_add_income(wa_user, text)
            return self._msg_nao_vinculado()
        
        # Comandos de consulta
        if text in ["saldo", "balanço", "balanco"]:
            if wa_user.is_verified and wa_user.tenant_id:
                return await self._cmd_balance(wa_user)
            return self._msg_nao_vinculado()
        
        if text in ["extrato", "listar", "transações", "transacoes"]:
            if wa_user.is_verified and wa_user.tenant_id:
                return await self._cmd_list_transactions(wa_user)
            return self._msg_nao_vinculado()
        
        # Ajuda
        if text in ["menu", "ajuda", "help", "opções", "opcoes", "oi", "olá", "ola", "start"]:
            return await self._cmd_menu(wa_user)
        
        # Erro
        return self._msg_comando_invalido()
    
    async def _cmd_vincular(self, wa_user: WhatsAppUser, text: str) -> str:
        """ Inicia processo de vinculação """
        # Extrai CPF da mensagem
        cpf_match = re.search(r'\d{11}|\d{3}\.\d{3}\.\d{3}-\d{2}', text)
        
        if cpf_match:
            cpf = re.sub(r'\D', '', cpf_match.group())
            if not self.validate_cpf(cpf):
                return "❌ CPF inválido. Por favor, verifique e tente novamente."
            
            # Busca usuário pelo CPF
            user_id, tenant_id = await self.find_user_by_cpf(cpf)
            
            if not tenant_id:
                return "❌ CPF não encontrado em nossa base. Verifique se está correto."
            
            # Gera código de verificação
            import random
            code = f"{random.randint(0, 999999):06d}"
            
            wa_user.cpf = cpf
            wa_user.user_id = user_id
            wa_user.tenant_id = tenant_id
            wa_user.verification_code = code
            wa_user.verification_expires = datetime.utcnow() + timedelta(minutes=10)
            
            await self.db.commit()
            
            return (
                f"✅ CPF validado!\n\n"
                f"Para confirmar, digite o código:\n"
                f"*{code}*\n\n"
                f"⏰ Este código expira em 10 minutos."
            )
        
        return (
            f"🔗 *Vincular Conta*\n\n"
            f"Para vincular seu número WhatsApp à sua conta:\n\n"
            f"Digite: *vincular SEU_CPF*\n"
            f"Exemplo: *vincular 12345678900*\n\n"
            f"⚠️  Use apenas números, sem pontos ou traços."
        )
    
    async def _cmd_verificar(self, wa_user: WhatsAppUser, text: str) -> str:
        """ Verifica código de confirmação """
        code_match = re.search(r'(\d{6})', text)
        
        if not code_match:
            return "❌ Código inválido. Digite os 6 dígitos do código."
        
        code = code_match.group(1)
        
        if wa_user.verification_code != code:
            return "❌ Código incorreto. Tente novamente."
        
        if wa_user.verification_expires < datetime.utcnow():
            return "❌ Código expirado. Digite *vincular* para gerar novo código."
        
        wa_user.is_verified = True
        wa_user.verification_code = None
        wa_user.verification_expires = None
        
        await self.db.commit()
        
        return (
            f"🎉 *Conta Vinculada!*\n\n"
            f"Seu WhatsApp agora está conectado ao Save Point Finanças.\n\n"
            f"✅ Você pode:\n"
            f"• Adicionar despesas: *gasto 50 mercado*\n"
            f"• Adicionar receitas: *recebi 3000 salary*\n"
            f"• Ver saldo: *saldo*\n"
            f"• Ver extrato: *extrato*\n\n"
            f"Digite *menu* para ver todas as opções."
        )
    
    async def _cmd_add_expense(self, wa_user: WhatsAppUser, text: str) -> str:
        """ Adiciona despesa """
        parsed = self.parse_expense_command(text)
        
        if not parsed:
            return (
                f"❌ Formato inválido.\n\n"
                f"Use: *gasto [valor] [descrição]*\n"
                f"Exemplos:\n"
                f"• *gasto 50 mercado*\n"
                f"• *gastei 150.90 no cinema*\n"
                f"• *paguei 80 Restaurant*"
            )
        
        try:
            # Importa aqui para evitar circular import
            from app.models.transaction import Transaction
            from app.models.category import CategoryType
            from app.services.category_rules import classify_by_rules
            
            # Classifica automaticamente
            category_id = await classify_by_rules(
                parsed["description"], 
                str(wa_user.tenant_id),
                self.db,
                "expense"
            )
            
            # Se não encontrou categoria, usa "Outros"
            if not category_id:
                from app.services.category_rules import get_or_create_outros
                category_id = await get_or_create_outros(wa_user.tenant_id, self.db)
            
            # Busca conta padrão
            from app.models.account import Account
            result = await self.db.execute(
                select(Account).where(
                    Account.tenant_id == wa_user.tenant_id,
                    Account.is_active == True
                ).limit(1)
            )
            account = result.scalar_one_or_none()
            
            if not account:
                return "❌ Nenhuma conta encontrada. Cadastre uma conta no app primeiro."
            
            # Cria transação
            transaction = Transaction(
                tenant_id=wa_user.tenant_id,
                user_id=wa_user.user_id,
                account_id=account.id,
                category_id=category_id,
                type=CategoryType.expense,
                amount=parsed["amount"],
                description=parsed["description"],
                date=datetime.utcnow(),
                payment_method="whatsapp"
            )
            
            self.db.add(transaction)
            await self.db.commit()
            
            amount_str = f"R$ {parsed['amount']:,.2f}".replace(",", "X").replace(".", ",").replace("X", ".")
            
            return (
                f"✅ *Despesa Adicionada!*\n\n"
                f"💰 Valor: {amount_str}\n"
                f"📝 Descrição: {parsed['description']}\n\n"
                f"Categoria была автоматически определена.\n\n"
                f"Digite *menu* para mais opções."
            )
            
        except Exception as e:
            await self.db.rollback()
            return f"❌ Erro ao adicionar despesa: {str(e)}"
    
    async def _cmd_add_income(self, wa_user: WhatsAppUser, text: str) -> str:
        """ Adiciona receita """
        parsed = self.parse_expense_command(text)
        
        if not parsed:
            return (
                f"❌ Formato inválido.\n\n"
                f"Use: *recebi [valor] [descrição]*\n"
                f"Exemplos:\n"
                f"• *recebi 3000 salary*\n"
                f"• *ganhei 500 freelance*"
            )
        
        try:
            from app.models.transaction import Transaction
            from app.models.category import CategoryType
            from app.services.category_rules import classify_by_rules
            
            # Classifica como receita
            category_id = await classify_by_rules(
                parsed["description"],
                str(wa_user.tenant_id),
                self.db,
                "income"
            )
            
            if not category_id:
                # Cria categoriagenérica
                from app.models.category import Category
                result = await self.db.execute(
                    select(Category).where(
                        Category.tenant_id == wa_user.tenant_id,
                        Category.name.ilike("%outros%")
                    ).limit(1)
                )
                category = result.scalar_one_or_none()
                if category:
                    category_id = category.id
            
            if not category_id:
                from app.services.category_rules import get_or_create_outros
                category_id = await get_or_create_outros(wa_user.tenant_id, self.db)
            
            # Busca conta padrão
            from app.models.account import Account
            result = await self.db.execute(
                select(Account).where(
                    Account.tenant_id == wa_user.tenant_id,
                    Account.is_active == True
                ).limit(1)
            )
            account = result.scalar_one_or_none()
            
            if not account:
                return "❌ Nenhuma conta encontrada."
            
            # Cria transação
            transaction = Transaction(
                tenant_id=wa_user.tenant_id,
                user_id=wa_user.user_id,
                account_id=account.id,
                category_id=category_id,
                type=CategoryType.income,
                amount=parsed["amount"],
                description=parsed["description"],
                date=datetime.utcnow(),
                payment_method="whatsapp"
            )
            
            self.db.add(transaction)
            await self.db.commit()
            
            amount_str = f"R$ {parsed['amount']:,.2f}".replace(",", "X").replace(".", ",").replace("X", ".")
            
            return (
                f"✅ *Receita Adicionada!*\n\n"
                f"💰 Valor: {amount_str}\n"
                f"📝 Descrição: {parsed['description']}\n\n"
                f"Digite *menu* para mais opções."
            )
            
        except Exception as e:
            await self.db.rollback()
            return f"❌ Erro ao adicionar receita: {str(e)}"
    
    async def _cmd_balance(self, wa_user: WhatsAppUser) -> str:
        """ Retorna saldo total """
        from app.models.account import Account
        from sqlalchemy import func
        
        result = await self.db.execute(
            select(func.sum(Account.balance)).where(
                Account.tenant_id == wa_user.tenant_id,
                Account.is_active == True
            )
        )
        total = result.scalar() or 0
        
        amount_str = f"R$ {total:,.2f}".replace(",", "X").replace(".", ",").replace("X", ".")
        
        emoji = "🟢" if total >= 0 else "🔴"
        
        return (
            f"{emoji} *Saldo Total*\n\n"
            f"💰 {amount_str}\n\n"
            f"Esse é o saldo consolidado de todas as suas contas."
        )
    
    async def _cmd_list_transactions(self, wa_user: WhatsAppUser, limit: int = 5) -> str:
        """ Lista últimas transações """
        from app.models.transaction import Transaction
        from app.models.category import Category
        from sqlalchemy import desc
        
        result = await self.db.execute(
            select(Transaction, Category).join(
                Category, Transaction.category_id == Category.id
            ).where(
                Transaction.tenant_id == wa_user.tenant_id
            ).order_by(desc(Transaction.date)).limit(limit)
        )
        
        rows = result.all()
        
        if not rows:
            return "📋 Nenhuma transação encontrada."
        
        lines = ["📋 *Últimas Transações*\n"]
        
        for tx, cat in rows:
            emoji = "🔴" if tx.type.value == "expense" else "🟢"
            amount_str = f"R$ {tx.amount:,.2f}".replace(",", "X").replace(".", ",").replace("X", ".")
            date_str = tx.date.strftime("%d/%m")
            
            lines.append(f"{emoji} {date_str} - {amount_str}")
            lines.append(f"   📝 {tx.description[:30]}")
            lines.append(f"   🏷️ {cat.name}\n")
        
        return "\n".join(lines)
    
    async def _cmd_menu(self, wa_user: WhatsAppUser) -> str:
        """ Retorna menu de opções """
        if not wa_user.is_verified:
            return (
                f"👋 *Bem-vindo ao Save Point Finanças!*\n\n"
                f"Gerencie suas finanças pelo WhatsApp.\n\n"
                f"⚠️ *Primeiro passo:*\n"
                f"Vincule sua conta usando:\n"
                f"*vincular SEU_CPF*\n\n"
                f"Exemplo: *vincular 12345678900*"
            )
        
        sections = [
            {
                "title": "💰 Adicionar",
                "rows": [
                    {"id": "gasto", "title": "Despesa", "description": "Ex: gasto 50 mercado"},
                    {"id": "receita", "title": "Receita", "description": "Ex: recebi 3000 salary"},
                ]
            },
            {
                "title": "📊 Consultar",
                "rows": [
                    {"id": "saldo", "title": "Saldo", "description": "Ver saldo total"},
                    {"id": "extrato", "title": "Extrato", "description": "Últimas transações"},
                ]
            }
        ]
        
        # Envia lista interativa
        await self.wa_service.send_interactive_list(
            wa_user.phone_number,
            "📱 Save Point Finanças",
            "Escolha uma opção:",
            sections
        )
        
        return (
            f"📱 *Menu Save Point*\n\n"
            f"Selecione uma opção na lista acima ou use os comandos:\n\n"
            f"💰 *Adicionar Despesa*\n"
            f"gasto 50 mercado\n\n"
            f"💵 *Adicionar Receita*\n"
            f"recebi 3000 salário\n\n"
            f"📊 *Consultar*\n"
            f"saldo - Ver saldo\n"
            f"extrato - Ver transações"
        )
    
    async def _get_active_session(self, wa_user_id: uuid.UUID) -> Optional[WhatsAppSession]:
        """ Busca sessão ativa """
        result = await self.db.execute(
            select(WhatsAppSession).where(
                WhatsAppSession.whatsapp_user_id == wa_user_id,
                WhatsAppSession.is_active == True,
                WhatsAppSession.expires_at > datetime.utcnow()
            )
        )
        return result.scalar_one_or_none()
    
    async def _handle_session(self, wa_user: WhatsAppUser, session: WhatsAppSession, text: str) -> str:
        """ Processa resposta em sessão ativa """
        # Por enquanto, apenas encerra sessão
        session.is_active = False
        await self.db.commit()
        
        return "Sessão expirada. Tente novamente."
    
    def _msg_nao_vinculado(self) -> str:
        """ Mensagem para usuário não vinculado """
        return (
            f"⚠️ *Conta não vinculada*\n\n"
            f"Para usar o Save Point pelo WhatsApp, você precisa vincular sua conta.\n\n"
            f"Digite: *vincular SEU_CPF*\n"
            f"Exemplo: *vincular 12345678900*"
        )
    
    def _msg_comando_invalido(self) -> str:
        """ Mensagem para comando inválido """
        return (
            f"❌ Comando não reconhecido.\n\n"
            f"Digite *menu* para ver as opções disponíveis."
        )


# Instância global do serviço
wa_service = WhatsAppService()
