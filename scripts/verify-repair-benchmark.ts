import { readFileSync } from "node:fs";
import type { RepairInput } from "../src/lib/types";
import { validateRepairAssignments } from "../src/lib/repairs";
const reports = JSON.parse(
  readFileSync(".local/repair-benchmark.json", "utf8"),
) as {
  scenario: string;
  input: RepairInput;
  result: {
    status: string;
    assignments: { occurrenceId: string; period: number; roomId: string }[];
  };
}[];
for (const report of reports) {
  if (!["OPTIMAL", "FEASIBLE"].includes(report.result.status))
    throw new Error(`${report.scenario}: ${report.result.status}`);
  const proposed = report.input.occurrences.map((o) => {
    const a = report.result.assignments.find((a) => a.occurrenceId === o.id);
    if (!a) throw new Error("Solver omitted a class");
    return { ...o, period: a.period, roomId: a.roomId };
  });
  const errors = validateRepairAssignments(report.input, proposed);
  if (errors.length) throw new Error(errors.join("\n"));
  console.log(
    `${report.scenario}: independently validated ${proposed.length} dated assignments (${report.result.status}).`,
  );
}
