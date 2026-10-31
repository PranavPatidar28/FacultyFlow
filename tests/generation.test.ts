import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { State } from "../src/lib/types";
import { demoState } from "../src/lib/seed";
import { runGeneration } from "../src/lib/generation";
let state: State;
vi.mock("../src/lib/store", () => ({
  loadState: async () => structuredClone(state),
  mutate: async (fn: (s: State) => unknown) => fn(state),
}));
beforeEach(() => {
  state = demoState();
  state.jobs = [
    {
      id: "job",
      key: "key",
      status: "queued",
      createdAt: new Date().toISOString(),
      revision: 0,
      input: {
        settings: state.settings,
        faculty: state.faculty,
        rooms: state.rooms,
        sections: state.sections,
        requirements: state.requirements,
        locks: [],
      },
    },
  ];
  vi.stubEnv("SOLVER_URL", "https://solver.example/api/solve");
  vi.stubEnv("SOLVER_SECRET", "local-test-secret");
});
afterEach(() => {
  vi.unstubAllEnvs();
  vi.unstubAllGlobals();
});
describe("Durable generation retries", () => {
  it("does not call the solver again after a completed job", async () => {
    state.jobs[0].status = "completed";
    state.jobs[0].versionId = "draft-job";
    const fetch = vi.fn();
    vi.stubGlobal("fetch", fetch);
    expect(await runGeneration("job")).toBe("draft-job");
    expect(fetch).not.toHaveBeenCalled();
  });
  it("does not overwrite a concurrent successful completion with a failed retry", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => {
        state.jobs[0].status = "completed";
        state.jobs[0].versionId = "draft-job";
        throw new Error("Transient connection failure");
      }),
    );
    expect(await runGeneration("job")).toBe("draft-job");
    expect(state.jobs[0].status).toBe("completed");
  });
  it("records a failed service call without creating a draft", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => new Response("unavailable", { status: 503 })),
    );
    await expect(runGeneration("job")).rejects.toThrow("503");
    expect(state.jobs[0].status).toBe("failed");
    expect(state.versions).toHaveLength(1);
  });
  it("distinguishes an unresolved solver result from infeasibility", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () =>
        Response.json({
          status: "UNKNOWN",
          entries: [],
          quality: {},
          diagnostics: ["Time limit reached"],
        }),
      ),
    );
    expect(await runGeneration("job")).toBe("draft-job");
    expect(state.versions.at(-1)?.solverStatus).toBe("UNKNOWN");
  });
});
