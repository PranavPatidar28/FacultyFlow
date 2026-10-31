import { actionSchema } from "@/lib/validation";
import { applyAction } from "@/lib/domain";
import { currentMember, viewer } from "@/lib/auth";
import { demoEnabled, mutate } from "@/lib/store";
import { DomainError } from "@/lib/rules";
import { start } from "workflow/api";
import {
  generationWorkflow,
  offerExpiryWorkflow,
  repairWorkflow,
} from "@/workflows/scheduling";
import { runGeneration } from "@/lib/generation";
import { runRepairPlan } from "@/lib/repair-jobs";
import { z } from "zod";
export const maxDuration = 180;
export async function POST(request: Request) {
  try {
    const origin = request.headers.get("origin");
    if (origin && new URL(origin).host !== request.headers.get("host"))
      return Response.json({ error: "Invalid origin" }, { status: 403 });
    const authenticated = await viewer();
    const raw = await request.text();
    if (raw.length > 1_000_000)
      return Response.json({ error: "Import is too large" }, { status: 413 });
    const body = JSON.parse(raw);
    const action = actionSchema.parse(body.action);
    if (
      (action.type.startsWith("repair-") ||
        action.type.startsWith("closure-")) &&
      process.env.DEMO_MODE !== "true" &&
      process.env.DAILY_CHANGES_ENABLED !== "true"
    )
      return Response.json(
        {
          error:
            "Daily changes are disabled until authenticated preview verification is complete.",
        },
        { status: 503 },
      );
    const revision = z.number().int().nonnegative().parse(body.revision);
    const result = (await mutate(
      (s) => applyAction(s, currentMember(s, authenticated.member), action),
      action.type === "repair-consent" || action.type === "repair-apply"
        ? undefined
        : revision,
    )) as Record<string, string>;
    if (result.conflict)
      return Response.json({ error: result.error }, { status: 409 });
    if (action.type === "repair-request") {
      if (demoEnabled()) await runRepairPlan(result.planId);
      else
        try {
          await start(repairWorkflow, [result.planId]);
        } catch (error) {
          await mutate((s) => {
            const p = s.repairPlans.find((p) => p.id === result.planId)!;
            if (p.status === "queued") {
              p.status = "failed";
              p.error =
                "Could not dispatch repair workflow. Retry from the Daily Change Desk.";
              s.revision++;
            }
          });
          throw error;
        }
    }
    if (action.type === "generate") {
      if (demoEnabled()) await runGeneration(result.jobId);
      else
        try {
          await start(generationWorkflow, [result.jobId]);
        } catch (error) {
          await mutate((s) => {
            const job = s.jobs.find((j) => j.id === result.jobId)!;
            job.status = "failed";
            job.error = "Could not dispatch workflow. Try generating again.";
            s.revision++;
          });
          throw error;
        }
    }
    if (action.type === "offer" && !demoEnabled())
      try {
        await start(offerExpiryWorkflow, [result.offerId, result.expiresAt]);
      } catch {
        console.error("offer.expiry_dispatch_failed", {
          offerId: result.offerId,
        }); /* Expiry is also enforced during reads and acceptance. */
      }
    return Response.json(result);
  } catch (e) {
    if (e instanceof z.ZodError)
      return Response.json(
        { error: e.issues.map((i) => i.message).join(" ") },
        { status: 422 },
      );
    if (e instanceof DomainError)
      return Response.json({ error: e.message }, { status: e.status });
    console.error("action.failed", {
      kind: e instanceof Error ? e.name : "unknown",
    });
    return Response.json(
      { error: "The operation failed. Refresh the workspace and try again." },
      { status: 500 },
    );
  }
}
