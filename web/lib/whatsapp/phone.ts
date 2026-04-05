export function normalizeWhatsAppPhone(value: string | null | undefined) {
  if (!value) {
    return null;
  }

  const digits = value.replace(/\D/g, "");
  return digits.length >= 10 ? digits : null;
}

export function formatWhatsAppPhone(value: string | null | undefined) {
  const normalized = normalizeWhatsAppPhone(value);
  if (!normalized) {
    return null;
  }

  return normalized.startsWith("55") ? normalized : `55${normalized}`;
}

export function formatWhatsAppDisplayPhone(value: string | null | undefined) {
  const normalized = formatWhatsAppPhone(value);

  if (!normalized) {
    return "";
  }

  const national = normalized.startsWith("55") ? normalized.slice(2) : normalized;

  if (national.length <= 2) {
    return `(${national}`;
  }

  if (national.length <= 3) {
    return `(${national.slice(0, 2)}) ${national.slice(2)}`;
  }

  if (national.length <= 7) {
    return `(${national.slice(0, 2)}) ${national.slice(2, 3)} ${national.slice(3)}`;
  }

  return `(${national.slice(0, 2)}) ${national.slice(2, 3)} ${national.slice(3, 7)}-${national.slice(7, 11)}`;
}
