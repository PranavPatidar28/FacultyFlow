import { NextResponse } from "next/server";
import { demoEnabled } from "@/lib/store";
export async function GET(request: Request) {
  if (!demoEnabled())
    return new NextResponse(null, {
      status: 303,
      headers: { Location: "/login" },
    });
  const response = new NextResponse(null, {
    status: 303,
    headers: { Location: "/" },
  });
  response.cookies.set("facultyflow-demo", crypto.randomUUID(), {
    httpOnly: true,
    sameSite: "lax",
    secure: new URL(request.url).protocol === "https:",
    path: "/",
    maxAge: 86400,
  });
  response.cookies.set("facultyflow-viewer", "admin", {
    httpOnly: true,
    sameSite: "lax",
    path: "/",
  });
  return response;
}
export async function POST(request: Request) {
  if (!demoEnabled())
    return Response.json({ error: "Demo is disabled" }, { status: 404 });
  const origin = request.headers.get("origin");
  if (origin && new URL(origin).host !== request.headers.get("host"))
    return Response.json({ error: "Invalid origin" }, { status: 403 });
  const { memberId } = await request.json();
  if (typeof memberId !== "string" || memberId.length > 100)
    return Response.json({ error: "Invalid member" }, { status: 400 });
  const response = NextResponse.json({ ok: true });
  response.cookies.set("facultyflow-viewer", memberId, {
    httpOnly: true,
    sameSite: "lax",
    path: "/",
  });
  return response;
}
