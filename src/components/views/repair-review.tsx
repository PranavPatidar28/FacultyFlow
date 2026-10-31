"use client";
import { useState } from "react";
import Link from "next/link";
import { Check, ArrowRight, Clock3, ShieldCheck, X } from "lucide-react";
import type { AppData } from "@/lib/types";
import { localDate, occupied } from "@/lib/time";
import { Badge, Modal, type RunAction } from "../ui/workspace-ui";
import { Button } from "../ui/button";
type Plan = AppData["repairPlans"][number];
export function ScheduleChangeNotice({ data }: { data: AppData }) {
  const m = data.viewer.member,
    today = localDate(new Date(), data.settings.timezone);
  const affected = data.occurrences.filter(
    (o) =>
      o.date >= today &&
      (m.role !== "faculty" || o.facultyId === m.facultyId) &&
      data.roomClosures.some(
        (c) =>
          c.status === "confirmed" &&
          c.date === o.date &&
          c.roomId === o.roomId &&
          occupied(o.period, o.duration).some((p) => c.periods.includes(p)),
      ),
  );
  if (!affected.length) return null;
  return (
    <div className="info-box">
      <Clock3 size={17} />
      <div>
        <strong>
          {affected.length} upcoming{" "}
          {affected.length === 1 ? "class has" : "classes have"} a room
          disruption
        </strong>
        <p>
          These classes remain scheduled until a valid repair is applied.{" "}
          {m.role !== "faculty" ? (
            <Link href="/changes" className="inline-link">
              Review the Daily Change Desk
            </Link>
          ) : (
            "Your coordinator is reviewing the change. Check your inbox and dated agenda for updates."
          )}
        </p>
      </div>
    </div>
  );
}
export const planLabels: Record<Plan["status"], string> = {
  queued: "Planning",
  running: "Planning",
  ready: "Ready to apply",
  "awaiting-consent": "Awaiting faculty",
  applied: "Resolved",
  declined: "Needs a new plan",
  expired: "Expired",
  withdrawn: "Withdrawn",
  stale: "Needs a new plan",
  unsolved: "Needs a decision",
  failed: "Needs a decision",
};
export function RepairReview({
  data,
  plan,
  run,
  busy,
  onClose,
}: {
  data: AppData;
  plan: Plan;
  run: RunAction;
  busy: boolean;
  onClose: () => void;
}) {
  const m = data.viewer.member,
    request = data.repairRequests.find((r) => r.id === plan.requestId),
    consents = data.repairConsents.filter((c) => c.planId === plan.id),
    own = consents.find((c) => c.facultyId === m.facultyId),
    canManage =
      m.role === "admin" ||
      (m.role === "coordinator" &&
        request?.departmentIds.length === 1 &&
        request.departmentIds[0] === m.departmentId);
  const time = (p: number, d: number) =>
    `${data.settings.periods.find((x) => x.id === p)?.start}–${data.settings.periods.find((x) => x.id === p + d - 1)?.end}`;
  return (
    <Modal
      wide
      title="Review the smallest valid change"
      description={`${request?.date || ""} · One date. The same teachers. No automatic application.`}
      onClose={onClose}
    >
      <div className="repair-review-heading">
        <Badge
          tone={
            plan.status === "applied"
              ? "emerald"
              : plan.status === "ready"
                ? "violet"
                : "amber"
          }
        >
          {planLabels[plan.status]}
        </Badge>
        {plan.solverStatus && <Badge>{plan.solverStatus.toLowerCase()}</Badge>}
        {plan.deadline && (
          <span>
            <Clock3 size={13} />
            Deadline{" "}
            {new Intl.DateTimeFormat("en-IN", {
              timeZone: data.settings.timezone,
              dateStyle: "medium",
              timeStyle: "short",
            }).format(new Date(plan.deadline))}
          </span>
        )}
      </div>
      <div className="quality-grid repair-impact">
        {[
          ["Time changes", plan.impact.timeChanges],
          ["Classes changed", plan.impact.classesChanged],
          ["Room changes", plan.impact.roomChanges],
          [
            "Faculty gap change",
            plan.impact.gapDelta > 0
              ? `+${plan.impact.gapDelta}`
              : plan.impact.gapDelta,
          ],
        ].map(([label, value]) => (
          <div key={label}>
            <span>{label}</span>
            <strong>{value}</strong>
          </div>
        ))}
      </div>
      <p className="tiny muted">
        {plan.impact.facultyAffected} faculty affected. All affected class
        commitments are shown below.
      </p>
      {plan.diagnostics.map((d, i) => (
        <div className="info-box" key={i}>
          {d}
        </div>
      ))}
      {plan.error && (
        <div role="alert" className="error-box">
          {plan.error}
        </div>
      )}
      {plan.unresolvedOccurrenceIds?.length > 0 && (
        <div className="repair-unresolved">
          <strong>Still needs attention outside this repair</strong>
          <ul>
            {plan.unresolvedOccurrenceIds.map((id) => {
              const o = data.occurrences.find((o) => o.id === id);
              const r = data.requirements.find(
                (r) => r.id === o?.requirementId,
              );
              return (
                <li key={id}>
                  {data.subjects.find((s) => s.id === r?.subjectId)?.name} ·{" "}
                  {data.sections.find((s) => s.id === o?.sectionId)?.name} ·{" "}
                  {data.settings.periods.find((p) => p.id === o?.period)?.start}
                </li>
              );
            })}
          </ul>
        </div>
      )}
      <div className="repair-changes">
        {plan.changes.map((c) => {
          const req = data.requirements.find(
              (r) => r.id === c.before.requirementId,
            ),
            subject = data.subjects.find((s) => s.id === req?.subjectId);
          return (
            <article key={c.occurrenceId}>
              <header>
                <div>
                  <strong>{subject?.name}</strong>
                  <p>
                    {
                      data.sections.find((s) => s.id === c.before.sectionId)
                        ?.name
                    }{" "}
                    ·{" "}
                    {
                      data.faculty.find((f) => f.id === c.before.facultyId)
                        ?.name
                    }
                  </p>
                </div>
                <Badge
                  tone={
                    c.before.period === c.after.period ? "emerald" : "violet"
                  }
                >
                  {c.before.period === c.after.period
                    ? "Room only"
                    : "Time changes"}
                </Badge>
              </header>
              <div className="before-after">
                <div>
                  <span>BEFORE</span>
                  <strong>{time(c.before.period, c.before.duration)}</strong>
                  <small>
                    {data.rooms.find((r) => r.id === c.before.roomId)?.name}
                  </small>
                </div>
                <ArrowRight size={18} />
                <div>
                  <span>PROPOSED</span>
                  <strong>{time(c.after.period, c.after.duration)}</strong>
                  <small>
                    {data.rooms.find((r) => r.id === c.after.roomId)?.name}
                  </small>
                </div>
              </div>
              <p className="tiny muted">{c.reason}</p>
            </article>
          );
        })}
      </div>
      {consents.length > 0 && (
        <section className="repair-consents">
          <h3>Faculty acceptance</h3>
          {consents.map((c) => (
            <div className="simple-row" key={c.id}>
              <span>
                {data.faculty.find((f) => f.id === c.facultyId)?.name}
              </span>
              <Badge
                tone={
                  c.status === "accepted"
                    ? "emerald"
                    : c.status === "declined"
                      ? "rose"
                      : "amber"
                }
              >
                {c.status}
              </Badge>
            </div>
          ))}
        </section>
      )}
      {plan.changes.length > 0 && (
        <div className="info-box">
          <ShieldCheck size={17} />
          {plan.status === "applied"
            ? "This repair changed dated classes. The recurring timetable is unchanged."
            : plan.impact.timeChanges
              ? "Faculty acceptance leaves bookings unchanged. A coordinator must still review and apply the complete plan."
              : "Teaching times stay unchanged. Faculty receive an in-app notification when the room changes are applied."}
        </div>
      )}
      <div className="modal-actions">
        {own?.status === "pending" && plan.status === "awaiting-consent" ? (
          <>
            <Button
              variant="outline"
              disabled={busy}
              onClick={() =>
                run({
                  type: "repair-consent",
                  planId: plan.id,
                  decision: "declined",
                })
              }
            >
              <X size={14} />
              Decline repair
            </Button>
            <Button
              disabled={busy}
              onClick={() =>
                run({
                  type: "repair-consent",
                  planId: plan.id,
                  decision: "accepted",
                })
              }
            >
              <Check size={14} />
              Accept time changes
            </Button>
          </>
        ) : canManage ? (
          <>
            {["queued", "running", "ready", "awaiting-consent"].includes(
              plan.status,
            ) && (
              <Button
                variant="outline"
                disabled={busy}
                onClick={() =>
                  run({ type: "repair-withdraw", planId: plan.id })
                }
              >
                Withdraw proposal
              </Button>
            )}
            {plan.status === "ready" && (
              <Button
                disabled={busy}
                onClick={async () => {
                  if (await run({ type: "repair-apply", planId: plan.id }))
                    onClose();
                }}
              >
                <Check size={15} />
                Apply repair
              </Button>
            )}
          </>
        ) : null}
        <Button variant="ghost" onClick={onClose}>
          Close
        </Button>
      </div>
    </Modal>
  );
}
export function RepairInbox({
  data,
  run,
  busy,
}: {
  data: AppData;
  run: RunAction;
  busy: boolean;
}) {
  const [selected, setSelected] = useState<string | null>(null);
  const plans = data.repairPlans.filter((p) =>
    data.repairConsents.some(
      (c) => c.planId === p.id && c.facultyId === data.viewer.member.facultyId,
    ),
  );
  if (!plans.length) return null;
  return (
    <>
      <section className="panel repair-inbox">
        <div className="panel-heading">
          <div>
            <h2>Timetable changes for your review</h2>
            <p>
              Review the complete proposal before accepting a change to your
              teaching time.
            </p>
          </div>
        </div>
        {[...plans].reverse().map((p) => (
          <div className="repair-inbox-row" key={p.id}>
            <div>
              <strong>
                {data.repairRequests.find((r) => r.id === p.requestId)?.date} ·{" "}
                {p.impact.timeChanges} time changes
              </strong>
              <p>{planLabels[p.status]}</p>
            </div>
            <Button variant="outline" onClick={() => setSelected(p.id)}>
              Review repair
            </Button>
          </div>
        ))}
      </section>
      {selected && data.repairPlans.find((p) => p.id === selected) && (
        <RepairReview
          data={data}
          plan={data.repairPlans.find((p) => p.id === selected)!}
          run={run}
          busy={busy}
          onClose={() => setSelected(null)}
        />
      )}
    </>
  );
}
