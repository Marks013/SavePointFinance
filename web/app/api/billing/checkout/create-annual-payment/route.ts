import { NextResponse } from "next/server";
import { z } from "zod";

import { createAnnualBillingPaymentForSession, toBillingRouteStatus } from "@/lib/billing/service";
import { captureRequestError } from "@/lib/observability/sentry";

const createAnnualPaymentSchema = z.object({
  couponCode: z.string().trim().max(64).nullable().optional()
});

export async function POST(request: Request) {
  try {
    const body = createAnnualPaymentSchema.parse(await request.json().catch(() => ({})));
    const result = await createAnnualBillingPaymentForSession({
      couponCode: body.couponCode ?? null
    });
    return NextResponse.json(result, { status: 201 });
  } catch (error) {
    if (error instanceof z.ZodError) {
      return NextResponse.json({ message: error.issues[0]?.message ?? "Dados inválidos" }, { status: 400 });
    }

    captureRequestError(error, { request, feature: "billing-create-annual-payment" });
    return NextResponse.json(
      {
        message: error instanceof Error ? error.message : "Failed to create annual billing payment"
      },
      { status: toBillingRouteStatus(error) }
    );
  }
}
