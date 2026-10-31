import {
  appData,
  expireOffers,
  invalidateOffers,
  offerIsStale,
} from "@/lib/domain";
import { viewer } from "@/lib/auth";
import { loadState, mutate } from "@/lib/store";
import { DomainError } from "@/lib/rules";
import { planIsStale, refreshRepairPlans } from "@/lib/repairs";
export const dynamic = "force-dynamic";
export async function GET() {
  try {
    let s = await loadState();
    const v = await viewer(s);
    if (
      s.offers.some(
        (o) =>
          o.status === "pending" &&
          (Date.parse(o.expiresAt) <= Date.now() || offerIsStale(s, o)),
      ) ||
      s.repairPlans.some(
        (p) =>
          ["queued", "running", "awaiting-consent", "ready"].includes(
            p.status,
          ) &&
          ((p.deadline && Date.parse(p.deadline) <= Date.now()) ||
            planIsStale(s, p)),
      )
    ) {
      await mutate((s) => {
        expireOffers(s);
        invalidateOffers(s);
        refreshRepairPlans(s);
        s.revision++;
      });
      s = await loadState();
    }
    return Response.json(appData(s, v), {
      headers: { "Cache-Control": "private, no-store" },
    });
  } catch (e) {
    if (!(e instanceof DomainError))
      console.error("state.failed", {
        kind: e instanceof Error ? e.name : "unknown",
      });
    return Response.json(
      {
        error:
          e instanceof DomainError
            ? e.message
            : "Workspace could not be loaded. Check database configuration.",
      },
      { status: e instanceof DomainError ? e.status : 503 },
    );
  }
}
