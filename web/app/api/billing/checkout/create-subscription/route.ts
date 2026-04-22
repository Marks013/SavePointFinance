import { NextResponse } from "next/server";
import { z } from "zod";

import { createRecurringBillingSubscriptionForSession, toBillingRouteStatus } from "@/lib/billing/service";
import { captureRequestError } from "@/lib/observability/sentry";

const createBillingCheckoutSchema = z.object({
  planId: z.string().trim().min(1).optional(),
  cardToken: z.string().trim().min(1),
  paymentMethodId: z.string().trim().min(1),
  issuerId: z.string().trim().min(1).nullable().optional(),
  installments: z.number().int().positive().nullable().optional(),
  payer: z
    .object({
      email: z.string().email().nullable().optional(),
      identification: z
        .object({
          type: z.string().trim().min(1).nullable().optional(),
          number: z.string().trim().min(1).nullable().optional()
        })
        .nullable()
        .optional()
    })
    .nullable()
    .optional(),
  metadata: z.record(z.string(), z.unknown()).optional()
});

export async function POST(request: Request) {
  try {
    const body = createBillingCheckoutSchema.parse(await request.json());
    const result = await createRecurringBillingSubscriptionForSession({
      planId: body.planId,
      cardToken: body.cardToken,
      paymentMethodId: body.paymentMethodId,
      issuerId: body.issuerId ?? null,
      installments: body.installments ?? null,
      payer: body.payer ?? null,
      metadata: body.metadata
    });

    return NextResponse.json(result, { status: 201 });
  } catch (error) {
    if (error instanceof z.ZodError) {
      return NextResponse.json({ message: error.issues[0]?.message ?? "Dados inválidos" }, { status: 400 });
    }

    captureRequestError(error, { request, feature: "billing-create-subscription" });
    return NextResponse.json(
      {
        message: error instanceof Error ? error.message : "Failed to create billing subscription"
      },
      { status: toBillingRouteStatus(error) }
    );
  }
}
