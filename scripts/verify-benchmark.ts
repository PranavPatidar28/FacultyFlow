import { readFileSync } from "node:fs";
import { emptyState } from "../src/lib/seed";
import { validateEntries } from "../src/lib/rules";
import type { SolverInput, Entry } from "../src/lib/types";
const report = JSON.parse(readFileSync(".local/benchmark.json", "utf-8")) as {
  input: SolverInput;
  result: { entries: Entry[]; status: string };
};
const state = { ...emptyState(), ...report.input };
const errors = validateEntries(state, report.result.entries);
if (errors.length) throw new Error(errors.join("\n"));
console.log(
  `Independently validated ${report.result.entries.length} assignments (${report.result.status}) against all application constraints.`,
);
