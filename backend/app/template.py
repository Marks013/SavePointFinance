from fastapi.templating import Jinja2Templates
from jinja2 import pass_context

templates = Jinja2Templates(directory="/app/frontend-html")

ICON_MAP = {
    "tag": "tag",
    "briefcase": "briefcase",
    "code": "code",
    "trending-up": "trending-up",
    "plus-circle": "plus-circle",
    "utensils": "utensils",
    "home": "home",
    "car": "car",
    "activity": "activity",
    "camera": "camera",
    "film": "film",
    "music": "music",
    "gamepad-2": "gamepad-2",
    "book": "book",
    "graduation-cap": "graduation-cap",
    "refresh-cw": "refresh-cw",
    "credit-card": "credit-card",
    "heart": "heart",
    "shopping-bag": "shopping-bag",
    "help-circle": "help-circle",
    "gift": "gift",
    "zap": "zap",
    "coffee": "coffee",
    "phone": "phone",
    "wifi": "wifi",
    "dollar-sign": "dollar-sign",
    "wallet": "wallet",
    "piggy-bank": "piggy-bank",
    "target": "target",
    "clock": "clock",
    "calendar": "calendar",
}

@pass_context
def render_icon(context, icon_name):
    """Render Lucide icon SVG from icon name."""
    name = ICON_MAP.get(icon_name, "tag")
    return f'<i data-lucide="{name}" style="width:20px;height:20px;"></i>'

templates.env.filters["icon"] = render_icon
