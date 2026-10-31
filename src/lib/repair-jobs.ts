import { z } from "zod";
import { loadState, mutate } from "./store";
import { assert } from "./rules";
import { finishRepairPlan, refreshRepairPlans } from "./repairs";
import { solverHeaders } from "./solver-headers";
const resultSchema = z.object({
  status: z.enum([
    "OPTIMAL",
    "FEASIBLE",
    "INFEASIBLE",
    "UNKNOWN",
    "MODEL_INVALID",
  ]),
  assignments: z.array(
    z.object({
      occurrenceId: z.string(),
      period: z.number().int().min(0),
      roomId: z.string(),
    }),
  ),
  diagnostics: z.array(z.string()),
});
export async function runRepairPlan(
  planId: string,
): Promise<string | undefined> {
  const state = await loadState();
  const plan = state.repairPlans.find((p) => p.id === planId);
  assert(plan, "Repair plan not found", 404);
  if (!["queued", "running"].includes(plan.status)) return plan.deadline;
  const run = await mutate((s) => {
    refreshRepairPlans(s);
    const p = s.repairPlans.find((p) => p.id === planId)!;
    if (!["queued", "running"].includes(p.status)) return false;
    p.status = "running";
    s.revision++;
    return true;
  });
  if (!run) return;
  try {
    assert(
      process.env.SOLVER_URL && process.env.SOLVER_SECRET,
      "The solver service is not configured",
      503,
    );
    const response = await fetch(process.env.SOLVER_URL, {
      method: "POST",
      headers: await solverHeaders(),
      body: JSON.stringify(plan.input),
      signal: AbortSignal.timeout(45000),
    });
    assert(response.ok, `Repair solver returned ${response.status}`, 502);
    const result = resultSchema.parse(await response.json());
    return await mutate((s) => {
      finishRepairPlan(s, planId, result);
      s.revision++;
      return s.repairPlans.find((p) => p.id === planId)!.deadline;
    });
  } catch (error) {
    const completed = await mutate((s) => {
      const p = s.repairPlans.find((p) => p.id === planId)!;
      if (!["queued", "running"].includes(p.status)) return true;
      p.status = "failed";
      p.error =
        error instanceof Error ? error.message : "Repair generation failed";
      const r = s.repairRequests.find((r) => r.id === p.requestId)!;
      for (const m of s.members.filter(
        (m) =>
          m.role === "admin" ||
          (m.role === "coordinator" &&
            r.departmentIds.includes(m.departmentId)),
      )) {
        const id = `${p.id}-failed-${m.id}`;
        if (!s.notifications.some((n) => n.id === id))
          s.notifications.push({
            id,
            memberId: m.id,
            title: "Repair generation needs attention",
            body: "No changes were applied. Review the Daily Change Desk and retry.",
            href: "/changes",
            read: false,
            createdAt: new Date().toISOString(),
          });
      }
      s.revision++;
      return false;
    });
    if (!completed) throw error;
  }
}
