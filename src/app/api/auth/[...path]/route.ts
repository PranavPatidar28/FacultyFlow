import { neonAuth } from "@/lib/auth";
import { NextRequest } from "next/server";
async function handle(
  request: NextRequest,
  context: { params: Promise<{ path: string[] }> },
) {
  try {
    const handlers = neonAuth().handler();
    return await handlers[request.method as keyof typeof handlers](
      request,
      context,
    );
  } catch {
    return Response.json(
      { error: "Neon Auth is not configured" },
      { status: 503 },
    );
  }
}
export {
  handle as GET,
  handle as POST,
  handle as PUT,
  handle as DELETE,
  handle as PATCH,
};
