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

function getBrazilianPhoneVariants(value: string) {
  const variants = new Set<string>([value]);
  const national = value.startsWith("55") ? value.slice(2) : value;

  variants.add(national);
  variants.add(`55${national}`);

  if (!/^\d+$/.test(national) || (national.length !== 10 && national.length !== 11)) {
    return variants;
  }

  const areaCode = national.slice(0, 2);
  const subscriber = national.slice(2);

  if (subscriber.length === 8) {
    const withNinthDigit = `${areaCode}9${subscriber}`;
    variants.add(withNinthDigit);
    variants.add(`55${withNinthDigit}`);
  }

  if (subscriber.length === 9 && subscriber.startsWith("9")) {
    const withoutNinthDigit = `${areaCode}${subscriber.slice(1)}`;
    variants.add(withoutNinthDigit);
    variants.add(`55${withoutNinthDigit}`);
  }

  return variants;
}

export function getWhatsAppPhoneLookupVariants(value: string | null | undefined) {
  const normalized = normalizeWhatsAppPhone(value);
  if (!normalized) {
    return [];
  }

  const baseVariants = new Set<string>([normalized, formatWhatsAppPhone(normalized) ?? normalized]);

  for (const variant of [...baseVariants]) {
    for (const derivedVariant of getBrazilianPhoneVariants(variant)) {
      baseVariants.add(derivedVariant);
    }
  }

  return [...baseVariants].filter(Boolean);
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
