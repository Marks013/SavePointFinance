"""
Serviços de Importação e Exportação de Dados
"""
import csv
import io
import json
import uuid
from datetime import datetime, date
from decimal import Decimal
from typing import AsyncIterator, Optional
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select, func

from app.models.transaction import Transaction, TransactionType
from app.models.category import Category, CategoryType
from app.models.account import Account, AccountType
from app.models.card import Card, CardType
from app.models.subscription import Subscription
from app.models.goal import Goal


class ExportService:
    """
    Serviço para exportar dados do sistema.
    """
    
    @staticmethod
    async def export_transactions_csv(
        db: AsyncSession,
        tenant_id: uuid.UUID,
        start_date: Optional[date] = None,
        end_date: Optional[date] = None,
        transaction_type: Optional[str] = None,
    ) -> str:
        """
        Exporta transações para CSV.
        """
        query = select(Transaction, Category, Account).outerjoin(
            Category, Transaction.category_id == Category.id
        ).outerjoin(
            Account, Transaction.account_id == Account.id
        ).where(Transaction.tenant_id == tenant_id)
        
        if start_date:
            query = query.where(Transaction.date >= start_date)
        if end_date:
            query = query.where(Transaction.date <= end_date)
        if transaction_type:
            query = query.where(Transaction.type == TransactionType(transaction_type))
        
        query = query.order_by(Transaction.date.desc())
        
        result = await db.execute(query)
        rows = result.all()
        
        output = io.StringIO()
        writer = csv.writer(output)
        
        # Header
        writer.writerow([
            "Data", "Tipo", "Descrição", "Valor", "Categoria", 
            "Conta", "Cartão", "Método de Pagamento", "Notas",
            "É Recorrente", "Parcela", "Total Parcelas", "Criado em"
        ])
        
        for tx, cat, acc in rows:
            writer.writerow([
                tx.date.strftime("%Y-%m-%d"),
                tx.type.value,
                tx.description,
                str(tx.amount).replace(".", ","),
                cat.name if cat else "",
                acc.name if acc else "",
                tx.card_id or "",
                tx.payment_method.value if tx.payment_method else "",
                tx.notes or "",
                "Sim" if tx.is_recurring else "Não",
                f"{tx.installment_number}/{tx.installments_total}" if tx.installments_total > 1 else "-",
                tx.created_at.strftime("%Y-%m-%d %H:%M:%S") if tx.created_at else "",
            ])
        
        return output.getvalue()
    
    @staticmethod
    async def export_transactions_json(
        db: AsyncSession,
        tenant_id: uuid.UUID,
        start_date: Optional[date] = None,
        end_date: Optional[date] = None,
    ) -> str:
        """
        Exporta transações para JSON (backup completo).
        """
        query = select(Transaction).where(Transaction.tenant_id == tenant_id)
        
        if start_date:
            query = query.where(Transaction.date >= start_date)
        if end_date:
            query = query.where(Transaction.date <= end_date)
        
        result = await db.execute(query)
        transactions = result.scalars().all()
        
        data = []
        for tx in transactions:
            data.append({
                "id": str(tx.id),
                "date": tx.date.isoformat() if tx.date else None,
                "type": tx.type.value,
                "amount": str(tx.amount),
                "description": tx.description,
                "notes": tx.notes,
                "category_id": str(tx.category_id) if tx.category_id else None,
                "account_id": str(tx.account_id) if tx.account_id else None,
                "card_id": str(tx.card_id) if tx.card_id else None,
                "payment_method": tx.payment_method.value if tx.payment_method else None,
                "is_recurring": tx.is_recurring,
                "installments_total": tx.installments_total,
                "installment_number": tx.installment_number,
                "created_at": tx.created_at.isoformat() if tx.created_at else None,
            })
        
        return json.dumps({
            "exported_at": datetime.utcnow().isoformat(),
            "transactions": data,
        }, indent=2, ensure_ascii=False)
    
    @staticmethod
    async def export_categories_csv(
        db: AsyncSession,
        tenant_id: uuid.UUID,
    ) -> str:
        """Exporta categorias para CSV."""
        result = await db.execute(
            select(Category).where(Category.tenant_id == tenant_id)
        )
        categories = result.scalars().all()
        
        output = io.StringIO()
        writer = csv.writer(output)
        
        writer.writerow(["Nome", "Ícone", "Cor", "Tipo", "Limite Mensal", "Palavras-chave", "Criado em"])
        
        for cat in categories:
            writer.writerow([
                cat.name,
                cat.icon,
                cat.color,
                cat.type.value,
                str(cat.monthly_limit) if cat.monthly_limit else "",
                ",".join(cat.keywords) if cat.keywords else "",
                cat.created_at.strftime("%Y-%m-%d") if cat.created_at else "",
            ])
        
        return output.getvalue()
    
    @staticmethod
    async def export_accounts_csv(
        db: AsyncSession,
        tenant_id: uuid.UUID,
    ) -> str:
        """Exporta contas para CSV."""
        result = await db.execute(
            select(Account).where(Account.tenant_id == tenant_id)
        )
        accounts = result.scalars().all()
        
        output = io.StringIO()
        writer = csv.writer(output)
        
        writer.writerow(["Nome", "Tipo", "Saldo", "Cor", "Ativo", "Criado em"])
        
        for acc in accounts:
            writer.writerow([
                acc.name,
                acc.type.value,
                str(acc.balance),
                acc.color,
                "Sim" if acc.is_active else "Não",
                acc.created_at.strftime("%Y-%m-%d") if acc.created_at else "",
            ])
        
        return output.getvalue()
    
    @staticmethod
    async def export_cards_csv(
        db: AsyncSession,
        tenant_id: uuid.UUID,
    ) -> str:
        """Exporta cartões para CSV."""
        result = await db.execute(
            select(Card).where(Card.tenant_id == tenant_id)
        )
        cards = result.scalars().all()
        
        output = io.StringIO()
        writer = csv.writer(output)
        
        writer.writerow(["Nome", "Tipo", "Últimos Dígitos", "Bandeira", "Limite", "Dia Vencimento", "Dia Fechamento", "Cor", "Ativo", "Criado em"])
        
        for card in cards:
            writer.writerow([
                card.name,
                card.card_type.value if card.card_type else "credit",
                card.last4 or "",
                card.brand,
                str(card.limit_amount) if card.limit_amount else "0",
                card.due_day,
                card.close_day,
                card.color,
                "Sim" if card.is_active else "Não",
                card.created_at.strftime("%Y-%m-%d") if card.created_at else "",
            ])
        
        return output.getvalue()
    
    @staticmethod
    async def export_full_backup(
        db: AsyncSession,
        tenant_id: uuid.UUID,
    ) -> dict:
        """
        Exporta backup completo (todas as entidades).
        """
        # Categorias
        cats_result = await db.execute(
            select(Category).where(Category.tenant_id == tenant_id)
        )
        categories = [{
            "id": str(c.id),
            "name": c.name,
            "icon": c.icon,
            "color": c.color,
            "type": c.type.value,
            "monthly_limit": str(c.monthly_limit) if c.monthly_limit else None,
            "keywords": c.keywords,
        } for c in cats_result.scalars().all()]
        
        # Contas
        accs_result = await db.execute(
            select(Account).where(Account.tenant_id == tenant_id)
        )
        accounts = [{
            "id": str(a.id),
            "name": a.name,
            "type": a.type.value,
            "balance": str(a.balance),
            "color": a.color,
            "is_active": a.is_active,
        } for a in accs_result.scalars().all()]
        
        # Cartões
        cards_result = await db.execute(
            select(Card).where(Card.tenant_id == tenant_id)
        )
        cards = [{
            "id": str(c.id),
            "name": c.name,
            "last4": c.last4,
            "brand": c.brand,
            "card_type": c.card_type.value if c.card_type else "credit",
            "limit_amount": str(c.limit_amount) if c.limit_amount else "0",
            "due_day": c.due_day,
            "close_day": c.close_day,
            "color": c.color,
            "is_active": c.is_active,
        } for c in cards_result.scalars().all()]
        
        # Transações
        txs_result = await db.execute(
            select(Transaction).where(Transaction.tenant_id == tenant_id)
        )
        transactions = [{
            "id": str(t.id),
            "date": t.date.isoformat() if t.date else None,
            "type": t.type.value,
            "amount": str(t.amount),
            "description": t.description,
            "notes": t.notes,
            "category_id": str(t.category_id) if t.category_id else None,
            "account_id": str(t.account_id) if t.account_id else None,
            "card_id": str(t.card_id) if t.card_id else None,
            "payment_method": t.payment_method.value if t.payment_method else None,
            "is_recurring": t.is_recurring,
            "installments_total": t.installments_total,
            "installment_number": t.installment_number,
        } for t in txs_result.scalars().all()]
        
        return {
            "version": "1.0",
            "exported_at": datetime.utcnow().isoformat(),
            "tenant_id": str(tenant_id),
            "categories": categories,
            "accounts": accounts,
            "cards": cards,
            "transactions": transactions,
        }


class ImportService:
    """
    Serviço para importar dados no sistema.
    """
    
    def __init__(self, db: AsyncSession, tenant_id: uuid.UUID, user_id: uuid.UUID):
        self.db = db
        self.tenant_id = tenant_id
        self.user_id = user_id
        self.created_count = 0
        self.errors = []
    
    async def import_transactions_csv(
        self,
        csv_content: str,
        account_id: Optional[uuid.UUID] = None,
        default_category_id: Optional[uuid.UUID] = None,
    ) -> dict:
        """
        Importa transações de CSV.
        Formato esperado: Data, Tipo, Descrição, Valor, Categoria, Conta
        """
        reader = csv.DictReader(io.StringIO(csv_content))
        
        # Mapeia categorias existentes
        cats_result = await self.db.execute(
            select(Category).where(Category.tenant_id == self.tenant_id)
        )
        categories = {c.name.lower(): c.id for c in cats_result.scalars().all()}
        
        # Mapeia contas existentes
        accounts_result = await self.db.execute(
            select(Account).where(Account.tenant_id == self.tenant_id)
        )
        accounts = {a.name.lower(): a.id for a in accounts_result.scalars().all()}
        
        # Conta padrão se não especificada
        if not account_id and accounts:
            account_id = list(accounts.values())[0]
        
        for row_num, row in enumerate(reader, start=2):
            try:
                # Data
                date_str = row.get("Data", "").strip()
                if not date_str:
                    self.errors.append(f"Linha {row_num}: Data vazia")
                    continue
                
                try:
                    tx_date = datetime.strptime(date_str, "%Y-%m-%d").date()
                except ValueError:
                    try:
                        tx_date = datetime.strptime(date_str, "%d/%m/%Y").date()
                    except ValueError:
                        self.errors.append(f"Linha {row_num}: Data inválida '{date_str}'")
                        continue
                
                # Tipo
                type_str = row.get("Tipo", "despesa").strip().lower()
                tx_type = TransactionType.expense if "despesa" in type_str or "expense" in type_str else TransactionType.income
                
                # Descrição
                description = row.get("Descrição", "").strip()
                if not description:
                    self.errors.append(f"Linha {row_num}: Descrição vazia")
                    continue
                
                # Valor
                value_str = row.get("Valor", "0").strip().replace(",", ".")
                try:
                    amount = abs(Decimal(value_str))
                except:
                    self.errors.append(f"Linha {row_num}: Valor inválido '{value_str}'")
                    continue
                
                # Categoria
                category_name = row.get("Categoria", "").strip().lower()
                category_id = default_category_id
                if category_name and category_name in categories:
                    category_id = categories[category_name]
                
                # Conta
                account_name = row.get("Conta", "").strip().lower()
                tx_account_id = account_id
                if account_name and account_name in accounts:
                    tx_account_id = accounts[account_name]
                
                # Método pagamento
                payment_method_str = row.get("Método de Pagamento", "").strip().lower()
                from app.models.transaction import PaymentMethod
                payment_method = PaymentMethod.money
                if "pix" in payment_method_str:
                    payment_method = PaymentMethod.pix
                elif "cartão" in payment_method_str or "credit" in payment_method_str:
                    payment_method = PaymentMethod.credit_card
                elif "débito" in payment_method_str or "debit" in payment_method_str:
                    payment_method = PaymentMethod.debit_card
                elif "transfer" in payment_method_str:
                    payment_method = PaymentMethod.transfer
                
                # Notas
                notes = row.get("Notas", "").strip() or None
                
                # Criar transação
                tx = Transaction(
                    tenant_id=self.tenant_id,
                    user_id=self.user_id,
                    account_id=tx_account_id,
                    category_id=category_id,
                    type=tx_type,
                    amount=amount,
                    description=description,
                    date=tx_date,
                    notes=notes,
                    payment_method=payment_method,
                    source="import_csv",
                )
                self.db.add(tx)
                self.created_count += 1
                
            except Exception as e:
                self.errors.append(f"Linha {row_num}: {str(e)}")
        
        if self.created_count > 0:
            await self.db.commit()
        
        return {
            "created": self.created_count,
            "errors": self.errors,
        }
    
    async def import_categories_csv(
        self,
        csv_content: str,
    ) -> dict:
        """
        Importa categorias de CSV.
        """
        reader = csv.DictReader(io.StringIO(csv_content))
        
        for row_num, row in enumerate(reader, start=2):
            try:
                name = row.get("Nome", "").strip()
                if not name:
                    self.errors.append(f"Linha {row_num}: Nome vazio")
                    continue
                
                # Verificar se já existe
                existing = await self.db.execute(
                    select(Category).where(
                        Category.tenant_id == self.tenant_id,
                        Category.name.ilike(name)
                    )
                )
                if existing.scalar_one_or_none():
                    self.errors.append(f"Linha {row_num}: Categoria '{name}' já existe")
                    continue
                
                icon = row.get("Ícone", "").strip() or "tag"
                color = row.get("Cor", "").strip() or "#6B7280"
                type_str = row.get("Tipo", "despesa").strip().lower()
                cat_type = CategoryType.expense if "receita" not in type_str else CategoryType.income
                
                category = Category(
                    tenant_id=self.tenant_id,
                    name=name,
                    icon=icon,
                    color=color,
                    type=cat_type,
                )
                self.db.add(category)
                self.created_count += 1
                
            except Exception as e:
                self.errors.append(f"Linha {row_num}: {str(e)}")
        
        if self.created_count > 0:
            await self.db.commit()
        
        return {
            "created": self.created_count,
            "errors": self.errors,
        }
    
    async def import_accounts_csv(
        self,
        csv_content: str,
    ) -> dict:
        """
        Importa contas de CSV.
        """
        reader = csv.DictReader(io.StringIO(csv_content))
        
        for row_num, row in enumerate(reader, start=2):
            try:
                name = row.get("Nome", "").strip()
                if not name:
                    self.errors.append(f"Linha {row_num}: Nome vazio")
                    continue
                
                # Verificar se já existe
                existing = await self.db.execute(
                    select(Account).where(
                        Account.tenant_id == self.tenant_id,
                        Account.name.ilike(name)
                    )
                )
                if existing.scalar_one_or_none():
                    self.errors.append(f"Linha {row_num}: Conta '{name}' já existe")
                    continue
                
                type_str = row.get("Tipo", "conta_corrente").strip().lower()
                account_type = AccountType.checking
                if "poupança" in type_str or "savings" in type_str:
                    account_type = AccountType.savings
                elif "investimento" in type_str or "investment" in type_str:
                    account_type = AccountType.investment
                elif "carteira" in type_str or "wallet" in type_str:
                    account_type = AccountType.wallet
                
                balance_str = row.get("Saldo", "0").strip().replace(",", ".")
                balance = Decimal(balance_str) if balance_str else Decimal("0")
                
                color = row.get("Cor", "").strip() or "#10B981"
                
                account = Account(
                    tenant_id=self.tenant_id,
                    name=name,
                    type=account_type,
                    balance=balance,
                    color=color,
                )
                self.db.add(account)
                self.created_count += 1
                
            except Exception as e:
                self.errors.append(f"Linha {row_num}: {str(e)}")
        
        if self.created_count > 0:
            await self.db.commit()
        
        return {
            "created": self.created_count,
            "errors": self.errors,
        }
