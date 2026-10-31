export async function GET() {
  return Response.json({
    app: "FacultyFlow",
    status: "ready",
    mode: process.env.DEMO_MODE === "true" ? "synthetic-demo" : "authenticated",
    databaseConfigured: !!process.env.DATABASE_URL,
    authConfigured: !!process.env.NEON_AUTH_BASE_URL,
    solverConfigured: !!process.env.SOLVER_URL,
  });
}
