/**
 * Save Point Finanças Brand Intelligence
 * Brazilian banks, streaming services, and popular subscriptions with logos and emojis.
 */

/** 
 * Returns a brand object { emoji, color, logo } for a given name.
 * Usage: getBrand('netflix') => { emoji: '🎬', color: '#E50914', logo: '<svg...>' }
 */

const BRANDS = {
  // ── Brazilian Banks ───────────────────────────────────────────────────────
  'nubank': {
    emoji: '💜',
    color: '#820AD1',
    logo: `<svg viewBox="0 0 40 40" fill="none" xmlns="http://www.w3.org/2000/svg">
      <rect width="40" height="40" rx="12" fill="#820AD1"/>
      <path d="M20 8C13.373 8 8 13.373 8 20C8 26.627 13.373 32 20 32C26.627 32 32 26.627 32 20C32 13.373 26.627 8 20 8ZM20 28C15.582 28 12 24.418 12 20C12 15.582 15.582 12 20 12C24.418 12 28 15.582 28 20C28 24.418 24.418 28 20 28Z" fill="white"/>
      <circle cx="20" cy="20" r="4" fill="white"/>
    </svg>`
  },
  'itaú': {
    emoji: '🧡',
    color: '#F4811F',
    logo: `<svg viewBox="0 0 40 40" fill="none" xmlns="http://www.w3.org/2000/svg">
      <rect width="40" height="40" rx="12" fill="#003B77"/>
      <text x="50%" y="55%" dominant-baseline="middle" text-anchor="middle" fill="#F4811F" font-size="11" font-weight="bold" font-family="Arial">itaú</text>
    </svg>`
  },
  'itau': {
    emoji: '🧡',
    color: '#F4811F',
    logo: `<svg viewBox="0 0 40 40" fill="none" xmlns="http://www.w3.org/2000/svg">
      <rect width="40" height="40" rx="12" fill="#003B77"/>
      <text x="50%" y="55%" dominant-baseline="middle" text-anchor="middle" fill="#F4811F" font-size="11" font-weight="bold" font-family="Arial">itaú</text>
    </svg>`
  },
  'bradesco': {
    emoji: '🔴',
    color: '#CC0000',
    logo: `<svg viewBox="0 0 40 40" fill="none" xmlns="http://www.w3.org/2000/svg">
      <rect width="40" height="40" rx="12" fill="#CC0000"/>
      <text x="50%" y="55%" dominant-baseline="middle" text-anchor="middle" fill="white" font-size="9" font-weight="bold" font-family="Arial">BRADESCO</text>
    </svg>`
  },
  'santander': {
    emoji: '🔥',
    color: '#EC0000',
    logo: `<svg viewBox="0 0 40 40" fill="none" xmlns="http://www.w3.org/2000/svg">
      <rect width="40" height="40" rx="12" fill="#EC0000"/>
      <circle cx="14" cy="20" r="5" fill="white" opacity="0.9"/>
      <circle cx="26" cy="20" r="5" fill="white" opacity="0.9"/>
    </svg>`
  },
  'banco do brasil': {
    emoji: '🌟',
    color: '#F8D000',
    logo: `<svg viewBox="0 0 40 40" fill="none" xmlns="http://www.w3.org/2000/svg">
      <rect width="40" height="40" rx="12" fill="#003D8F"/>
      <circle cx="20" cy="20" r="8" fill="#F8D000"/>
      <text x="50%" y="57%" dominant-baseline="middle" text-anchor="middle" fill="#003D8F" font-size="8" font-weight="bold" font-family="Arial">BB</text>
    </svg>`
  },
  'bb': {
    emoji: '🌟',
    color: '#F8D000',
    logo: `<svg viewBox="0 0 40 40" fill="none" xmlns="http://www.w3.org/2000/svg">
      <rect width="40" height="40" rx="12" fill="#003D8F"/>
      <circle cx="20" cy="20" r="8" fill="#F8D000"/>
      <text x="50%" y="57%" dominant-baseline="middle" text-anchor="middle" fill="#003D8F" font-size="8" font-weight="bold" font-family="Arial">BB</text>
    </svg>`
  },
  'caixa': {
    emoji: '🏛️',
    color: '#0866C6',
    logo: `<svg viewBox="0 0 40 40" fill="none" xmlns="http://www.w3.org/2000/svg">
      <rect width="40" height="40" rx="12" fill="#0866C6"/>
      <text x="50%" y="55%" dominant-baseline="middle" text-anchor="middle" fill="white" font-size="8" font-weight="bold" font-family="Arial">CAIXA</text>
    </svg>`
  },
  'caixa econômica': {
    emoji: '🏛️',
    color: '#0866C6',
    logo: `<svg viewBox="0 0 40 40" fill="none" xmlns="http://www.w3.org/2000/svg">
      <rect width="40" height="40" rx="12" fill="#0866C6"/>
      <text x="50%" y="55%" dominant-baseline="middle" text-anchor="middle" fill="white" font-size="8" font-weight="bold" font-family="Arial">CAIXA</text>
    </svg>`
  },
  'inter': {
    emoji: '🍊',
    color: '#FF6E00',
    logo: `<svg viewBox="0 0 40 40" fill="none" xmlns="http://www.w3.org/2000/svg">
      <rect width="40" height="40" rx="12" fill="#FF6E00"/>
      <text x="50%" y="57%" dominant-baseline="middle" text-anchor="middle" fill="white" font-size="10" font-weight="bold" font-family="Arial">inter</text>
    </svg>`
  },
  'banco inter': {
    emoji: '🍊',
    color: '#FF6E00',
    logo: `<svg viewBox="0 0 40 40"><rect width="40" height="40" rx="12" fill="#FF6E00"/><text x="50%" y="57%" dominant-baseline="middle" text-anchor="middle" fill="white" font-size="10" font-weight="bold" font-family="Arial">inter</text></svg>`
  },
  'c6': {
    emoji: '⬛',
    color: '#2B2B2B',
    logo: `<svg viewBox="0 0 40 40"><rect width="40" height="40" rx="12" fill="#2B2B2B"/><text x="50%" y="57%" dominant-baseline="middle" text-anchor="middle" fill="#F5C100" font-size="12" font-weight="bold" font-family="Arial">C6</text></svg>`
  },
  'c6 bank': {
    emoji: '⬛',
    color: '#2B2B2B',
    logo: `<svg viewBox="0 0 40 40"><rect width="40" height="40" rx="12" fill="#2B2B2B"/><text x="50%" y="57%" dominant-baseline="middle" text-anchor="middle" fill="#F5C100" font-size="12" font-weight="bold" font-family="Arial">C6</text></svg>`
  },
  'neon': {
    emoji: '🌊',
    color: '#00EFFF',
    logo: `<svg viewBox="0 0 40 40"><rect width="40" height="40" rx="12" fill="#1A1A2E"/><text x="50%" y="57%" dominant-baseline="middle" text-anchor="middle" fill="#00EFFF" font-size="10" font-weight="bold" font-family="Arial">neon</text></svg>`
  },
  'original': {
    emoji: '🟢',
    color: '#00A651',
    logo: `<svg viewBox="0 0 40 40"><rect width="40" height="40" rx="12" fill="#00A651"/><text x="50%" y="57%" dominant-baseline="middle" text-anchor="middle" fill="white" font-size="9" font-weight="bold" font-family="Arial">original</text></svg>`
  },
  'banco original': {
    emoji: '🟢',
    color: '#00A651',
    logo: `<svg viewBox="0 0 40 40"><rect width="40" height="40" rx="12" fill="#00A651"/><text x="50%" y="57%" dominant-baseline="middle" text-anchor="middle" fill="white" font-size="9" font-weight="bold" font-family="Arial">original</text></svg>`
  },
  'picpay': {
    emoji: '💚',
    color: '#21C25E',
    logo: `<svg viewBox="0 0 40 40"><rect width="40" height="40" rx="12" fill="#21C25E"/><text x="50%" y="57%" dominant-baseline="middle" text-anchor="middle" fill="white" font-size="8" font-weight="bold" font-family="Arial">PicPay</text></svg>`
  },
  'pagbank': {
    emoji: '💛',
    color: '#FFD700',
    logo: `<svg viewBox="0 0 40 40"><rect width="40" height="40" rx="12" fill="#FFD700"/><text x="50%" y="57%" dominant-baseline="middle" text-anchor="middle" fill="#333" font-size="8" font-weight="bold" font-family="Arial">PagBank</text></svg>`
  },
  'sicoob': {
    emoji: '🟦',
    color: '#005BAA',
    logo: `<svg viewBox="0 0 40 40"><rect width="40" height="40" rx="12" fill="#005BAA"/><text x="50%" y="57%" dominant-baseline="middle" text-anchor="middle" fill="white" font-size="9" font-weight="bold" font-family="Arial">Sicoob</text></svg>`
  },
  'sicredi': {
    emoji: '🟩',
    color: '#00923F',
    logo: `<svg viewBox="0 0 40 40"><rect width="40" height="40" rx="12" fill="#00923F"/><text x="50%" y="57%" dominant-baseline="middle" text-anchor="middle" fill="white" font-size="9" font-weight="bold" font-family="Arial">Sicredi</text></svg>`
  },
  'next': {
    emoji: '🌈',
    color: '#3BC43C',
    logo: `<svg viewBox="0 0 40 40"><rect width="40" height="40" rx="12" fill="#3BC43C"/><text x="50%" y="57%" dominant-baseline="middle" text-anchor="middle" fill="white" font-size="11" font-weight="bold" font-family="Arial">next</text></svg>`
  },
  'will bank': {
    emoji: '💙',
    color: '#4300FF',
    logo: `<svg viewBox="0 0 40 40"><rect width="40" height="40" rx="12" fill="#4300FF"/><text x="50%" y="57%" dominant-baseline="middle" text-anchor="middle" fill="white" font-size="10" font-weight="bold" font-family="Arial">will</text></svg>`
  },

  // ── Streaming / Subscriptions ─────────────────────────────────────────────
  'netflix': {
    emoji: '🎬',
    color: '#E50914',
    logo: `<svg viewBox="0 0 40 40" xmlns="http://www.w3.org/2000/svg">
      <rect width="40" height="40" rx="10" fill="#141414"/>
      <path d="M10 8H15L20 24L25 8H30L22 32L20 32L18 32L10 8Z" fill="#E50914"/>
    </svg>`
  },
  'spotify': {
    emoji: '🎵',
    color: '#1DB954',
    logo: `<svg viewBox="0 0 40 40"><rect width="40" height="40" rx="20" fill="#1DB954"/>
      <circle cx="20" cy="20" r="9" fill="none" stroke="white" stroke-width="2" stroke-dasharray="4 2"/>
      <circle cx="20" cy="20" r="5" fill="none" stroke="white" stroke-width="2"/>
      <circle cx="20" cy="20" r="2" fill="white"/>
    </svg>`
  },
  'youtube': {
    emoji: '▶️',
    color: '#FF0000',
    logo: `<svg viewBox="0 0 40 40"><rect width="40" height="40" rx="10" fill="#FF0000"/>
      <polygon points="15,12 15,28 28,20" fill="white"/>
    </svg>`
  },
  'youtube premium': {
    emoji: '👑',
    color: '#FF0000',
    logo: `<svg viewBox="0 0 40 40"><rect width="40" height="40" rx="10" fill="#FF0000"/>
      <polygon points="15,12 15,28 28,20" fill="white"/>
    </svg>`
  },
  'amazon prime': {
    emoji: '📦',
    color: '#00A8E1',
    logo: `<svg viewBox="0 0 40 40"><rect width="40" height="40" rx="10" fill="#232F3E"/>
      <text x="50%" y="42%" dominant-baseline="middle" text-anchor="middle" fill="#FF9900" font-size="11" font-weight="bold" font-family="Arial">prime</text>
      <path d="M10 27 Q20 32 30 27" stroke="#FF9900" stroke-width="2" fill="none" stroke-linecap="round"/>
    </svg>`
  },
  'prime video': {
    emoji: '🎥',
    color: '#00A8E1',
    logo: `<svg viewBox="0 0 40 40"><rect width="40" height="40" rx="10" fill="#232F3E"/>
      <text x="50%" y="42%" dominant-baseline="middle" text-anchor="middle" fill="#FF9900" font-size="11" font-weight="bold" font-family="Arial">prime</text>
      <path d="M10 27 Q20 32 30 27" stroke="#FF9900" stroke-width="2" fill="none" stroke-linecap="round"/>
    </svg>`
  },
  'disney+': {
    emoji: '✨',
    color: '#113CCF',
    logo: `<svg viewBox="0 0 40 40"><rect width="40" height="40" rx="10" fill="#040E36"/>
      <text x="50%" y="57%" dominant-baseline="middle" text-anchor="middle" fill="#00B9E1" font-size="9" font-weight="bold" font-family="Georgia">Disney+</text>
    </svg>`
  },
  'disney': {
    emoji: '✨',
    color: '#113CCF',
    logo: `<svg viewBox="0 0 40 40"><rect width="40" height="40" rx="10" fill="#040E36"/><text x="50%" y="57%" dominant-baseline="middle" text-anchor="middle" fill="#00B9E1" font-size="9" font-weight="bold" font-family="Georgia">Disney+</text></svg>`
  },
  'hbo max': {
    emoji: '🎭',
    color: '#5A189A',
    logo: `<svg viewBox="0 0 40 40"><rect width="40" height="40" rx="10" fill="#161327"/>
      <text x="50%" y="40%" dominant-baseline="middle" text-anchor="middle" fill="#8B5CF6" font-size="12" font-weight="bold" font-family="Arial">MAX</text>
      <text x="50%" y="67%" dominant-baseline="middle" text-anchor="middle" fill="#6D4BF8" font-size="8" font-family="Arial">HBO</text>
    </svg>`
  },
  'max': {
    emoji: '🎭',
    color: '#5A189A',
    logo: `<svg viewBox="0 0 40 40"><rect width="40" height="40" rx="10" fill="#161327"/><text x="50%" y="40%" dominant-baseline="middle" text-anchor="middle" fill="#8B5CF6" font-size="12" font-weight="bold" font-family="Arial">MAX</text></svg>`
  },
  'globoplay': {
    emoji: '📺',
    color: '#FF6B00',
    logo: `<svg viewBox="0 0 40 40"><rect width="40" height="40" rx="10" fill="#FF6B00"/>
      <text x="50%" y="57%" dominant-baseline="middle" text-anchor="middle" fill="white" font-size="8" font-weight="bold" font-family="Arial">globoplay</text>
    </svg>`
  },
  'telecine': {
    emoji: '🎞️',
    color: '#E20013',
    logo: `<svg viewBox="0 0 40 40"><rect width="40" height="40" rx="10" fill="#E20013"/>
      <text x="50%" y="57%" dominant-baseline="middle" text-anchor="middle" fill="white" font-size="8" font-weight="bold" font-family="Arial">telecine</text>
    </svg>`
  },
  'crunchyroll': {
    emoji: '🍥',
    color: '#F47521',
    logo: `<svg viewBox="0 0 40 40"><rect width="40" height="40" rx="20" fill="#F47521"/>
      <circle cx="20" cy="20" r="9" fill="#1A1A1A"/>
      <circle cx="20" cy="20" r="5" fill="#F47521"/>
      <circle cx="20" cy="20" r="2" fill="#1A1A1A"/>
    </svg>`
  },
  'funimation': {
    emoji: '⛩️',
    color: '#400080',
    logo: `<svg viewBox="0 0 40 40"><rect width="40" height="40" rx="10" fill="#400080"/><text x="50%" y="57%" dominant-baseline="middle" text-anchor="middle" fill="white" font-size="8" font-weight="bold" font-family="Arial">FUNI</text></svg>`
  },
  'apple tv': {
    emoji: '🍎',
    color: '#000000',
    logo: `<svg viewBox="0 0 40 40"><rect width="40" height="40" rx="10" fill="#1C1C1E"/>
      <text x="50%" y="47%" dominant-baseline="middle" text-anchor="middle" fill="white" font-size="14">🍎</text>
      <text x="50%" y="73%" dominant-baseline="middle" text-anchor="middle" fill="white" font-size="7" font-family="Arial">TV+</text>
    </svg>`
  },
  'apple music': {
    emoji: '🎶',
    color: '#FC3C44',
    logo: `<svg viewBox="0 0 40 40"><rect width="40" height="40" rx="10" fill="#1C1C1E"/>
      <text x="50%" y="47%" dominant-baseline="middle" text-anchor="middle" fill="white" font-size="14">🎶</text>
    </svg>`
  },
  'deezer': {
    emoji: '🎧',
    color: '#FF0092',
    logo: `<svg viewBox="0 0 40 40"><rect width="40" height="40" rx="10" fill="#FF0092"/>
      <text x="50%" y="57%" dominant-baseline="middle" text-anchor="middle" fill="white" font-size="9" font-weight="bold" font-family="Arial">deezer</text>
    </svg>`
  },
  'tidal': {
    emoji: '🌊',
    color: '#00FFFF',
    logo: `<svg viewBox="0 0 40 40"><rect width="40" height="40" rx="10" fill="#000000"/><text x="50%" y="57%" dominant-baseline="middle" text-anchor="middle" fill="#00FFFF" font-size="10" font-weight="bold" font-family="Arial">TIDAL</text></svg>`
  },
  'twitch': {
    emoji: '🎮',
    color: '#9147FF',
    logo: `<svg viewBox="0 0 40 40"><rect width="40" height="40" rx="10" fill="#9147FF"/>
      <rect x="12" y="10" width="16" height="20" rx="3" fill="white"/>
      <rect x="16" y="16" width="3" height="7" fill="#9147FF"/>
      <rect x="21" y="16" width="3" height="7" fill="#9147FF"/>
    </svg>`
  },
  'adobe': {
    emoji: '🎨',
    color: '#FF0000',
    logo: `<svg viewBox="0 0 40 40"><rect width="40" height="40" rx="10" fill="#FF0000"/>
      <text x="50%" y="57%" dominant-baseline="middle" text-anchor="middle" fill="white" font-size="8" font-weight="bold" font-family="Arial">Adobe</text>
    </svg>`
  },
  'microsoft': {
    emoji: '🪟',
    color: '#00A4EF',
    logo: `<svg viewBox="0 0 40 40"><rect width="40" height="40" rx="10" fill="white"/>
      <rect x="10" y="10" width="9" height="9" fill="#F25022"/>
      <rect x="21" y="10" width="9" height="9" fill="#7FBA00"/>
      <rect x="10" y="21" width="9" height="9" fill="#00A4EF"/>
      <rect x="21" y="21" width="9" height="9" fill="#FFB900"/>
    </svg>`
  },
  'office 365': {
    emoji: '📊',
    color: '#D83B01',
    logo: `<svg viewBox="0 0 40 40"><rect width="40" height="40" rx="10" fill="#D83B01"/><text x="50%" y="57%" dominant-baseline="middle" text-anchor="middle" fill="white" font-size="8" font-weight="bold" font-family="Arial">Office</text></svg>`
  },
  'google one': {
    emoji: '☁️',
    color: '#4285F4',
    logo: `<svg viewBox="0 0 40 40"><rect width="40" height="40" rx="10" fill="white"/>
      <circle cx="14" cy="20" r="4" fill="#4285F4"/>
      <circle cx="20" cy="15" r="4" fill="#EA4335"/>
      <circle cx="26" cy="20" r="4" fill="#FBBC05"/>
      <circle cx="20" cy="25" r="4" fill="#34A853"/>
    </svg>`
  },
  'icloud': {
    emoji: '☁️',
    color: '#1D88F5',
    logo: `<svg viewBox="0 0 40 40"><rect width="40" height="40" rx="10" fill="#1D88F5"/>
      <text x="50%" y="47%" dominant-baseline="middle" text-anchor="middle" fill="white" font-size="14">🍎</text>
    </svg>`
  },

  // ── Food & Delivery ───────────────────────────────────────────────────────
  'ifood': {
    emoji: '🍔',
    color: '#EA1D2C',
    logo: `<svg viewBox="0 0 40 40"><rect width="40" height="40" rx="20" fill="#EA1D2C"/>
      <text x="50%" y="57%" dominant-baseline="middle" text-anchor="middle" fill="white" font-size="9" font-weight="bold" font-family="Arial">iFood</text>
    </svg>`
  },
  'rappi': {
    emoji: '🛵',
    color: '#FF441F',
    logo: `<svg viewBox="0 0 40 40"><rect width="40" height="40" rx="10" fill="#FF441F"/><text x="50%" y="57%" dominant-baseline="middle" text-anchor="middle" fill="white" font-size="10" font-weight="bold" font-family="Arial">rappi</text></svg>`
  },

  // ── Gym / Health ──────────────────────────────────────────────────────────
  'academia': {
    emoji: '💪',
    color: '#F59E0B',
    logo: null
  },
  'smartfit': {
    emoji: '🏋️',
    color: '#FFD600',
    logo: `<svg viewBox="0 0 40 40"><rect width="40" height="40" rx="10" fill="#FFD600"/>
      <text x="50%" y="57%" dominant-baseline="middle" text-anchor="middle" fill="black" font-size="8" font-weight="bold" font-family="Arial">SmartFit</text>
    </svg>`
  },
  'bluefit': {
    emoji: '🏊',
    color: '#0066CC',
    logo: `<svg viewBox="0 0 40 40"><rect width="40" height="40" rx="10" fill="#0066CC"/><text x="50%" y="57%" dominant-baseline="middle" text-anchor="middle" fill="white" font-size="9" font-weight="bold" font-family="Arial">BlueFit</text></svg>`
  },

  // ── Telecom ───────────────────────────────────────────────────────────────
  'claro': {
    emoji: '📡',
    color: '#CE1126',
    logo: `<svg viewBox="0 0 40 40"><rect width="40" height="40" rx="10" fill="#CE1126"/><text x="50%" y="57%" dominant-baseline="middle" text-anchor="middle" fill="white" font-size="11" font-weight="bold" font-family="Arial">claro</text></svg>`
  },
  'vivo': {
    emoji: '📱',
    color: '#660099',
    logo: `<svg viewBox="0 0 40 40"><rect width="40" height="40" rx="10" fill="#660099"/><text x="50%" y="57%" dominant-baseline="middle" text-anchor="middle" fill="white" font-size="11" font-weight="bold" font-family="Arial">vivo</text></svg>`
  },
  'tim': {
    emoji: '📞',
    color: '#003DA5',
    logo: `<svg viewBox="0 0 40 40"><rect width="40" height="40" rx="10" fill="#003DA5"/><text x="50%" y="57%" dominant-baseline="middle" text-anchor="middle" fill="white" font-size="13" font-weight="bold" font-family="Arial">TIM</text></svg>`
  },
  'oi': {
    emoji: '📶',
    color: '#00B140',
    logo: `<svg viewBox="0 0 40 40"><rect width="40" height="40" rx="10" fill="#00B140"/><text x="50%" y="57%" dominant-baseline="middle" text-anchor="middle" fill="white" font-size="16" font-weight="bold" font-family="Arial">oi</text></svg>`
  },
};

/** Generic fallback based on first char */
function genericLogo(name, color = '#10B981') {
  const letter = (name || '?')[0].toUpperCase();
  return `<svg viewBox="0 0 40 40" xmlns="http://www.w3.org/2000/svg">
    <rect width="40" height="40" rx="12" fill="${color}22"/>
    <text x="50%" y="57%" dominant-baseline="middle" text-anchor="middle" fill="${color}" font-size="18" font-weight="700" font-family="Arial">${letter}</text>
  </svg>`;
}

/**
 * Get brand info for a subscription/account name.
 * @param {string} name - Name to look up
 * @param {string} fallbackColor - Fallback color if no brand found
 */
export function getBrand(name, fallbackColor = '#10B981') {
  const key = (name || '').toLowerCase().trim();
  
  // Exact match
  if (BRANDS[key]) return BRANDS[key];
  
  // Partial match: check if any brand key is contained in the name
  for (const [bKey, bVal] of Object.entries(BRANDS)) {
    if (key.includes(bKey) || bKey.includes(key)) {
      return bVal;
    }
  }
  
  // No match — generate fallback
  return {
    emoji: '💳',
    color: fallbackColor,
    logo: genericLogo(name, fallbackColor)
  };
}

/**
 * Renders a brand avatar HTML element.
 * @param {string} name
 * @param {string} fallbackColor
 * @param {number} size - px size (default 40)
 */
export function brandAvatar(name, fallbackColor = '#10B981', size = 40) {
  const brand = getBrand(name, fallbackColor);
  if (brand.logo) {
    return `<div style="width:${size}px;height:${size}px;border-radius:${size * 0.3}px;overflow:hidden;flex-shrink:0;">${brand.logo}</div>`;
  }
  const letter = (name || '?')[0].toUpperCase();
  return `<div style="width:${size}px;height:${size}px;border-radius:${size * 0.3}px;background:${brand.color}22;display:flex;align-items:center;justify-content:center;flex-shrink:0;font-size:${size * 0.45}px;font-weight:700;color:${brand.color};">${letter}</div>`;
}
