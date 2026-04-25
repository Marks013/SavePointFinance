import { NextResponse } from "next/server";
import { z } from "zod";

import { toBillingRouteStatus, updateBillingSubscriptionCardForSession } from "@/lib/billing/service";
import { captureRequestError } from "@/lib/observability/sentry";

const updateBillingCardSchema = z.object({
  cardToken: z.string().trim().min(1),
  paymentMethodId: z.string().trim().min(1),
  issuerId: z.string().trim().min(1).nullable().optional(),
  installments: z.number().int().positive().nullable().optional(),
  payer: z.unknown().nullable().optional(),
  metadata: z.record(z.string(), z.unknown()).optional()
});

export async function POST(request: Request) {
  try {
    const body = updateBillingCardSchema.parse(await request.json());
    const result = await updateBillingSubscriptionCardForSession({
      cardToken: body.cardToken,
      paymentMethodId: body.paymentMethodId,
      issuerId: body.issuerId ?? null,
      installments: body.installments ?? null,
      payer: body.payer ?? null,
      metadata: body.metadata
    });

    return NextResponse.json(result);
  } catch (error) {
    if (error instanceof z.ZodError) {
      return NextResponse.json({ message: error.issues[0]?.message ?? "Dados inválidos" }, { status: 400 });
    }

    captureRequestError(error, { request, feature: "billing-update-card" });
    return NextResponse.json(
      {
        message: error instanceof Error ? error.message : "Failed to update billing card"
      },
      { status: toBillingRouteStatus(error) }
    );
  }
}
