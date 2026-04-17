export const FOOD_BENEFIT_CATEGORY_SYSTEM_KEYS = [
  "supermercado",
  "feira-hortifruti",
  "restaurantes",
  "delivery",
  "cafe-padaria"
] as const;

export const FOOD_BENEFIT_CATEGORY_SYSTEM_KEY_SET = new Set<string>(FOOD_BENEFIT_CATEGORY_SYSTEM_KEYS);

export function isAllowedBenefitFoodCategory(systemKey: string | null | undefined) {
  return Boolean(systemKey && FOOD_BENEFIT_CATEGORY_SYSTEM_KEY_SET.has(systemKey));
}
