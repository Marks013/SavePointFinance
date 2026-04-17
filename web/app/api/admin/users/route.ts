import { NextResponse } from "next/server";

import { requireAdminUser } from "@/lib/auth/admin";
import { getCachedAdminUsers } from "@/lib/cache/admin-read-models";

export async function GET(request: Request) {
  try {
    const admin = await requireAdminUser();
    const { searchParams } = new URL(request.url);
    const search = searchParams.get("search")?.trim();
    const tenantId = searchParams.get("tenantId")?.trim();
    const role = searchParams.get("role");
    const status = searchParams.get("status");
    const lastLogin = searchParams.get("lastLogin");
    const sort = searchParams.get("sort") ?? "created_desc";
    const page = Math.max(1, Number(searchParams.get("page") ?? "1") || 1);
    const pageSize = Math.min(50, Math.max(1, Number(searchParams.get("pageSize") ?? "12") || 12));
    const payload = await getCachedAdminUsers({
      tenantId: admin.isPlatformAdmin ? tenantId : admin.tenantId,
      role,
      status,
      lastLogin,
      sort,
      search,
      page,
      pageSize,
      isPlatformAdmin: admin.isPlatformAdmin
    });

    return NextResponse.json(payload);
  } catch (error) {
    if (error instanceof Error && (error.message === "Unauthorized" || error.message === "Forbidden")) {
      return NextResponse.json({ message: error.message }, { status: error.message === "Forbidden" ? 403 : 401 });
    }

    return NextResponse.json({ message: "Failed to load users" }, { status: 500 });
  }
}
