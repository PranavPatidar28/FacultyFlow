import { createNeonAuth } from "@neondatabase/auth/next/server";
import { cookies } from "next/headers";
import { demoEnabled, loadState, mutate } from "./store";
import { assert } from "./rules";
import type { Member, State, Viewer } from "./types";
let auth: ReturnType<typeof createNeonAuth> | undefined;
export function neonAuth() {
  assert(
    process.env.NEON_AUTH_BASE_URL && process.env.NEON_AUTH_COOKIE_SECRET,
    "Neon Auth has not been configured",
    503,
  );
  return (auth ??= createNeonAuth({
    baseUrl: process.env.NEON_AUTH_BASE_URL!,
    cookies: { secret: process.env.NEON_AUTH_COOKIE_SECRET! },
  }));
}
export async function viewer(state?: State): Promise<Viewer> {
  const s = state || (await loadState());
  if (demoEnabled()) {
    const selected =
      (await cookies()).get("facultyflow-viewer")?.value || "admin";
    const member = s.members.find((m) => m.id === selected);
    assert(member, "Unknown demo member", 401);
    return { member, demo: true };
  }
  const { data: session } = await neonAuth().getSession();
  assert(session?.user, "Sign in to continue", 401);
  assert(
    session.user.emailVerified,
    "Verify your email before joining the college",
    403,
  );
  const member = s.members.find(
    (m) =>
      m.authId === session.user.id ||
      (!m.authId && m.email.toLowerCase() === session.user.email.toLowerCase()),
  );
  assert(member, "Your account has not been invited to this college", 403);
  if (!member.authId) {
    const revision = await mutate((state) => {
      const current = state.members.find((m) => m.id === member.id);
      assert(
        current &&
          (!current.authId || current.authId === session.user.id) &&
          current.email.toLowerCase() === session.user.email.toLowerCase(),
        "Invitation is no longer valid",
        403,
      );
      current.authId = session.user.id;
      return ++state.revision;
    });
    member.authId = session.user.id;
    s.revision = revision;
  }
  return { member, demo: false };
}
export function currentMember(s: State, authenticated: Member) {
  const m = s.members.find((m) => m.id === authenticated.id);
  assert(m, "Membership is no longer active", 403);
  return m;
}
