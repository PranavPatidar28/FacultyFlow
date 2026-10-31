import { z } from "zod";
import { loadState, mutate } from "./store";
import { assert, validateEntries } from "./rules";
import { entrySchema } from "./validation";
import { solverHeaders } from "./solver-headers";
const resultSchema = z.object({
  status: z.enum([
    "OPTIMAL",
    "FEASIBLE",
    "INFEASIBLE",
    "UNKNOWN",
    "MODEL_INVALID",
  ]),
  entries: z.array(entrySchema),
  quality: z.record(z.string(), z.number()),
  diagnostics: z.array(z.string()),
});
export async function runGeneration(jobId: string) {
  const s = await loadState();
  const job = s.jobs.find((j) => j.id === jobId);
  assert(job, "Generation job not found", 404);
  if (job.status === "completed") return job.versionId;
  const alreadyCompleted = await mutate((state) => {
    const j = state.jobs.find((j) => j.id === jobId)!;
    if (j.status === "completed") return j.versionId;
    j.status = "running";
    state.revision++;
  });
  if (alreadyCompleted) return alreadyCompleted;
  try {
    assert(
      process.env.SOLVER_URL && process.env.SOLVER_SECRET,
      "The solver service is not configured. Set SOLVER_URL and SOLVER_SECRET.",
      503,
    );
    const response = await fetch(process.env.SOLVER_URL, {
      method: "POST",
      headers: await solverHeaders(),
      body: JSON.stringify(job.input),
      signal: AbortSignal.timeout(150000),
    });
    assert(response.ok, `Solver service returned ${response.status}`, 502);
    const solved = resultSchema.parse(await response.json());
    return await mutate((state) => {
      const current = state.jobs.find((j) => j.id === jobId)!;
      if (current.status === "completed") return current.versionId;
      if (solved.status === "FEASIBLE" || solved.status === "OPTIMAL") {
        const validationState = { ...state, ...job.input };
        const errors = validateEntries(validationState, solved.entries);
        assert(
          !errors.length,
          `Solver returned invalid assignments: ${errors.join(" ")}`,
          502,
        );
      }
      const id = `draft-${jobId}`;
      if (!state.versions.some((v) => v.id === id))
        state.versions.push({
          id,
          name: `Draft ${state.versions.length + 1}`,
          status: "draft",
          entries: solved.entries,
          createdAt: new Date().toISOString(),
          solverStatus: solved.status,
          quality: solved.quality,
          diagnostics: solved.diagnostics,
          sourceRevision: job.revision,
        });
      current.status = "completed";
      current.versionId = id;
      state.revision++;
      return id;
    });
  } catch (error) {
    const recovered = await mutate((state) => {
      const j = state.jobs.find((j) => j.id === jobId)!;
      if (j.status === "completed") return j.versionId;
      j.status = "failed";
      j.error = error instanceof Error ? error.message : "Generation failed";
      state.revision++;
    });
    if (recovered) return recovered;
    throw error;
  }
}
