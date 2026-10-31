import { getVercelOidcToken } from "@vercel/oidc";

export async function solverHeaders(): Promise<Record<string, string>> {
  return {
    "Content-Type": "application/json",
    Authorization: `Bearer ${process.env.SOLVER_SECRET}`,
    ...(process.env.VERCEL === "1"
      ? { "x-vercel-trusted-oidc-idp-token": await getVercelOidcToken() }
      : {}),
    ...(process.env.SOLVER_PROTECTION_BYPASS
      ? { "x-vercel-protection-bypass": process.env.SOLVER_PROTECTION_BYPASS }
      : {}),
  };
}
