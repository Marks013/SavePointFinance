import assert from "node:assert/strict";

import { getWhatsAppPhoneLookupVariants } from "@/lib/whatsapp/phone";

function expectVariants(input: string, expected: string[]) {
  const variants = getWhatsAppPhoneLookupVariants(input);

  for (const value of expected) {
    assert.ok(
      variants.includes(value),
      `Esperava encontrar ${value} nas variantes de ${input}. Obtido: ${variants.join(", ")}`
    );
  }
}

expectVariants("554484565984", ["554484565984", "5544984565984", "44984565984", "4484565984"]);
expectVariants("5544984565984", ["5544984565984", "554484565984", "44984565984", "4484565984"]);
expectVariants("(44) 9 8456-5984", ["5544984565984", "554484565984"]);
expectVariants("(44) 8456-5984", ["554484565984", "5544984565984"]);

console.log("WhatsApp phone lookup audit passed.");
