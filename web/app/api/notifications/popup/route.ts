import { NextResponse } from "next/server";

import { requireSessionUser } from "@/lib/auth/session";
import {
  acknowledgePopupCampaign,
  getActivePopupCampaignForUser,
  parsePopupCampaignAck
} from "@/lib/notifications/popup-campaigns";
import { captureRequestError } from "@/lib/observability/sentry";

export async function GET(request: Request) {
  try {
    const user = await requireSessionUser();
    const item = await getActivePopupCampaignForUser(user.id);

    return NextResponse.json({
      item
    });
  } catch (error) {
    if (error instanceof Error && error.message === "Unauthorized") {
      return NextResponse.json({ message: error.message }, { status: 401 });
    }

    captureRequestError(error, { request, feature: "popup-campaigns", surface: "user" });
    return NextResponse.json({ message: "Failed to load popup campaign" }, { status: 500 });
  }
}

export async function POST(request: Request) {
  try {
    const user = await requireSessionUser();
    const body = parsePopupCampaignAck(await request.json().catch(() => ({})));

    await acknowledgePopupCampaign({
      ...body,
      userId: user.id
    });

    return NextResponse.json({
      success: true
    });
  } catch (error) {
    if (error instanceof Error && error.message === "Unauthorized") {
      return NextResponse.json({ message: error.message }, { status: 401 });
    }

    captureRequestError(error, { request, feature: "popup-campaigns", surface: "user" });
    return NextResponse.json(
      { message: error instanceof Error ? error.message : "Failed to acknowledge popup campaign" },
      { status: 400 }
    );
  }
}
