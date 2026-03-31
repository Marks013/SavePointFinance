import uuid
from typing import Optional, List
from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select
from pydantic import BaseModel
from app.database import get_db
from app.auth import get_current_user
from app.models.user import User
from app.models.category import Category, CategoryType
from app.services.plan_limits import check_limit

router = APIRouter(prefix="/api/v1/categories", tags=["categories"])


# ── Schemas ───────────────────────────────────────────────────────────────────

class CategoryCreate(BaseModel):
    name: str
    icon: str = "tag"
    color: str = "#6B7280"
    type: CategoryType = CategoryType.expense
    keywords: List[str] = []
    parent_id: Optional[uuid.UUID] = None


class CategoryUpdate(BaseModel):
    name: Optional[str] = None
    icon: Optional[str] = None
    color: Optional[str] = None
    type: Optional[CategoryType] = None
    keywords: Optional[List[str]] = None
    parent_id: Optional[uuid.UUID] = None


def cat_to_dict(c: Category) -> dict:
    return {
        "id": str(c.id),
        "name": c.name,
        "icon": c.icon,
        "color": c.color,
        "type": c.type,
        "keywords": c.keywords or [],
        "parent_id": str(c.parent_id) if c.parent_id else None,
        "is_default": c.is_default,
    }


# ── Endpoints ─────────────────────────────────────────────────────────────────

@router.get("")
async def list_categories(
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    result = await db.execute(
        select(Category)
        .where(Category.tenant_id == current_user.tenant_id)
        .order_by(Category.type, Category.name)
    )
    return [cat_to_dict(c) for c in result.scalars().all()]


@router.post("", status_code=201)
async def create_category(
    body: CategoryCreate,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    allowed, error = await check_limit(current_user.tenant_id, "categories", db)
    if not allowed:
        raise HTTPException(status_code=403, detail=error)
    
    name_clean = body.name.strip()

    # FIX: Prevent duplicate category names in the same tenant (case-insensitive)
    existing = await db.execute(
        select(Category).where(
            Category.tenant_id == current_user.tenant_id,
            Category.name.ilike(name_clean),
        )
    )
    if existing.scalar_one_or_none():
        raise HTTPException(status_code=400, detail="Já existe uma categoria com este nome.")

    data = body.model_dump()
    data["name"] = name_clean
    category = Category(**data, tenant_id=current_user.tenant_id)
    db.add(category)
    await db.commit()
    await db.refresh(category)
    return cat_to_dict(category)


@router.put("/{category_id}")
async def update_category(
    category_id: uuid.UUID,
    body: CategoryUpdate,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    result = await db.execute(
        select(Category).where(
            Category.id == category_id,
            Category.tenant_id == current_user.tenant_id,
        )
    )
    category = result.scalar_one_or_none()
    if not category:
        raise HTTPException(status_code=404, detail="Categoria não encontrada.")

    dump = body.model_dump(exclude_unset=True)

    if "name" in dump:
        name_clean = dump["name"].strip()
        dup = await db.execute(
            select(Category).where(
                Category.tenant_id == current_user.tenant_id,
                Category.name.ilike(name_clean),
                Category.id != category_id,
            )
        )
        if dup.scalar_one_or_none():
            raise HTTPException(status_code=400, detail="Já existe outra categoria com este nome.")
        dump["name"] = name_clean

    for field, value in dump.items():
        setattr(category, field, value)

    await db.commit()
    await db.refresh(category)
    return cat_to_dict(category)


@router.delete("/{category_id}")
async def delete_category(
    category_id: uuid.UUID,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """
    BUG FIX: Was returning HTTP 204 (no content) with a JSON body — browsers
    silently drop 204 bodies causing the frontend to get no error message.
    Changed to HTTP 200.
    """
    result = await db.execute(
        select(Category).where(
            Category.id == category_id,
            Category.tenant_id == current_user.tenant_id,
        )
    )
    category = result.scalar_one_or_none()
    if not category:
        raise HTTPException(status_code=404, detail="Categoria não encontrada.")

    if category.is_default:
        raise HTTPException(status_code=400, detail="Categorias padrão não podem ser excluídas.")

    from app.models.transaction import Transaction
    tx_check = await db.execute(
        select(Transaction).where(Transaction.category_id == category_id).limit(1)
    )
    if tx_check.scalar_one_or_none():
        raise HTTPException(
            status_code=400,
            detail=(
                "Esta categoria possui transações vinculadas e não pode ser excluída. "
                "Remova ou re-categorize as transações primeiro."
            ),
        )

    await db.delete(category)
    await db.commit()
    return {"message": "Categoria excluída com sucesso."}


@router.post("/seed-defaults", status_code=201)
async def seed_defaults(
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    await _seed_defaults(str(current_user.tenant_id), db)
    return {"message": "Categorias padrão criadas."}


# ── Internal helper ───────────────────────────────────────────────────────────

async def _seed_defaults(tenant_id: str, db: AsyncSession) -> None:
    """Called automatically on register. Idempotent — skips if categories exist."""
    tid = uuid.UUID(tenant_id)
    existing = await db.execute(
        select(Category).where(Category.tenant_id == tid).limit(1)
    )
    if existing.scalar_one_or_none():
        return

    defaults = [
        # Income
        {"name": "Salário", "icon": "briefcase", "color": "#10B981", "type": CategoryType.income,
         "keywords": ["salario", "pagamento", "folha", "vencimento"]},
        {"name": "Freelance", "icon": "code", "color": "#3B82F6", "type": CategoryType.income,
         "keywords": ["freelance", "projeto", "servico"]},
        {"name": "Investimentos", "icon": "trending-up", "color": "#6366F1", "type": CategoryType.income,
         "keywords": ["dividendos", "rendimento", "acao", "fundo"]},
        {"name": "Outras Receitas", "icon": "plus-circle", "color": "#8B5CF6", "type": CategoryType.income,
         "keywords": ["extra", "outros", "venda", "premio"]},
        # Expense
        {"name": "Alimentação", "icon": "utensils", "color": "#EF4444", "type": CategoryType.expense,
         "keywords": ["ifood", "mercado", "restaurante", "lanche", "padaria"]},
        {"name": "Moradia", "icon": "home", "color": "#F59E0B", "type": CategoryType.expense,
         "keywords": ["aluguel", "condominio", "luz", "agua", "gas", "iptu"]},
        {"name": "Transporte", "icon": "car", "color": "#3B82F6", "type": CategoryType.expense,
         "keywords": ["uber", "combustivel", "gasolina", "estacionamento", "onibus", "metro"]},
        {"name": "Saúde", "icon": "activity", "color": "#EC4899", "type": CategoryType.expense,
         "keywords": ["farmacia", "medico", "hospital", "plano", "academia"]},
        {"name": "Lazer", "icon": "camera", "color": "#8B5CF6", "type": CategoryType.expense,
         "keywords": ["cinema", "viagem", "show", "jogo", "streaming"]},
        {"name": "Educação", "icon": "book", "color": "#6366F1", "type": CategoryType.expense,
         "keywords": ["faculdade", "curso", "livro", "escola", "treinamento"]},
        {"name": "Assinaturas", "icon": "refresh-cw", "color": "#10B981", "type": CategoryType.expense,
         "keywords": ["netflix", "spotify", "prime", "cloud", "disney", "youtube"]},
        {"name": "Cartão de Crédito", "icon": "credit-card", "color": "#F97316", "type": CategoryType.expense,
         "keywords": ["fatura", "cartao"]},
        {"name": "Dízimo / Doações", "icon": "heart", "color": "#F43F5E", "type": CategoryType.expense,
         "keywords": ["igreja", "oferta", "dizimo", "doacao"]},
        {"name": "Vestuário", "icon": "shopping-bag", "color": "#D97706", "type": CategoryType.expense,
         "keywords": ["roupa", "calcado", "vestuario", "moda"]},
        {"name": "Outros", "icon": "help-circle", "color": "#6B7280", "type": CategoryType.expense,
         "keywords": []},
    ]

    for data in defaults:
        cat = Category(**data, tenant_id=tid, is_default=True)
        db.add(cat)
    await db.commit()
