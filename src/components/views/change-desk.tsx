"use client";
import { useState } from "react";
import { CalendarDays, Clock3, DoorClosed, Plus, Sparkles } from "lucide-react";
import type { AppData, Occurrence } from "@/lib/types";
import { classStart, localDate, occupied } from "@/lib/time";
import { Badge, Empty, Modal, type RunAction } from "../ui/workspace-ui";
import { Button } from "../ui/button";
import { CoverageView } from "./coverage";
import { RepairReview, planLabels } from "./repair-review";
type Trigger = {
  trigger: "closure" | "absence";
  triggerId: string;
  date: string;
  occurrences: Occurrence[];
  label: string;
};
export function ChangeDesk({
  data,
  run,
  busy,
}: {
  data: AppData;
  run: RunAction;
  busy: boolean;
}) {
  const [report, setReport] = useState(false),
    [trigger, setTrigger] = useState<Trigger | null>(null),
    [selected, setSelected] = useState<string | null>(null),
    [filter, setFilter] = useState("active");
  const m = data.viewer.member,
    today = localDate(new Date(), data.settings.timezone);
  const inScope = (o: Occurrence) =>
    m.role === "admin" ||
    data.sections.find((s) => s.id === o.sectionId)?.departmentId ===
      m.departmentId;
  const closures = data.roomClosures
    .filter((c) =>
      filter === "history"
        ? c.status === "cancelled" || c.date < today
        : c.status !== "cancelled" && c.date >= today,
    )
    .sort(
      (a, b) =>
        a.date.localeCompare(b.date) ||
        Math.min(...a.periods) - Math.min(...b.periods),
    );
  const triggers: Trigger[] = [
    ...closures
      .filter((c) => c.status === "confirmed")
      .map((c) => ({
        trigger: "closure" as const,
        triggerId: c.id,
        date: c.date,
        occurrences: data.occurrences.filter(
          (o) =>
            o.roomId === c.roomId &&
            o.date === c.date &&
            occupied(o.period, o.duration).some((p) => c.periods.includes(p)) &&
            inScope(o),
        ),
        label: `${data.rooms.find((r) => r.id === c.roomId)?.name} is closed`,
      })),
    ...data.absences
      .filter(
        (a) => a.status === "approved" && a.periods.length && a.date >= today,
      )
      .map((a) => ({
        trigger: "absence" as const,
        triggerId: a.id,
        date: a.date,
        occurrences: data.occurrences.filter(
          (o) =>
            o.facultyId === a.facultyId &&
            o.date === a.date &&
            occupied(o.period, o.duration).some((p) => a.periods.includes(p)) &&
            inScope(o),
        ),
        label: `Partial-day absence · ${data.faculty.find((f) => f.id === a.facultyId)?.name}`,
      })),
  ]
    .filter((t) => t.occurrences.length)
    .sort(
      (a, b) =>
        a.date.localeCompare(b.date) ||
        Math.min(...a.occurrences.map((o) => o.period)) -
          Math.min(...b.occurrences.map((o) => o.period)),
    );
  const plans = [...data.repairPlans]
    .reverse()
    .filter((p) =>
      filter === "history"
        ? [
            "applied",
            "withdrawn",
            "declined",
            "expired",
            "stale",
            "unsolved",
            "failed",
          ].includes(p.status)
        : !["applied", "withdrawn"].includes(p.status),
    );
  const ready = data.repairPlans.filter((p) => p.status === "ready").length;
  if (!data.features.dailyChanges)
    return (
      <Empty
        title="Daily changes are not enabled yet"
        body="Your administrator can enable this feature after authenticated preview verification."
      />
    );
  return (
    <>
      <div className="change-desk-intro">
        <div>
          <h2>Room closures & schedule changes</h2>
          <p>
            Keep the same teachers, protect existing commitments, and review
            every change before applying it.
          </p>
        </div>
        <Button onClick={() => setReport(true)}>
          <Plus size={15} />
          {m.role === "admin" ? "Record room closure" : "Report room closure"}
        </Button>
      </div>
      <div className="quality-grid change-summary">
        <div>
          <span>Disruptions to review</span>
          <strong>{triggers.length}</strong>
        </div>
        <div>
          <span>Awaiting faculty</span>
          <strong>
            {
              data.repairPlans.filter((p) => p.status === "awaiting-consent")
                .length
            }
          </strong>
        </div>
        <div>
          <span>Ready to apply</span>
          <strong>{ready}</strong>
        </div>
        <div>
          <span>Classes needing cover</span>
          <strong>
            {data.coverage.filter((c) => c.status !== "covered").length}
          </strong>
        </div>
      </div>
      <div className="section-actions">
        <div className="segmented-control">
          <button
            className={filter === "active" ? "selected" : ""}
            onClick={() => setFilter("active")}
          >
            Active changes
          </button>
          <button
            className={filter === "history" ? "selected" : ""}
            onClick={() => setFilter("history")}
          >
            Change history
          </button>
        </div>
        <span className="tiny muted">
          Sorted by date and class start · {data.settings.timezone}
        </span>
      </div>
      <section className="panel disruption-panel">
        <div className="panel-heading">
          <div>
            <h2>
              {filter === "history"
                ? "Room closure history"
                : "Disruptions needing a decision"}
            </h2>
            <p>
              Recording a disruption does not silently cancel or move a class.
            </p>
          </div>
        </div>
        {closures
          .filter(
            (c) =>
              c.status !== "confirmed" ||
              !triggers.some((t) => t.triggerId === c.id),
          )
          .map((c) => (
            <article className="disruption-row" key={c.id}>
              <span className="icon-tile tone-amber">
                <DoorClosed size={19} />
              </span>
              <div>
                <strong>
                  {data.rooms.find((r) => r.id === c.roomId)?.name} · {c.date}
                </strong>
                <p>{c.reason}</p>
                <small>
                  {c.status === "reported"
                    ? "Awaiting campus administrator confirmation"
                    : c.status === "cancelled"
                      ? "Cancelled; applied repairs were not reversed"
                      : "No affected classes remain in this scope"}
                </small>
              </div>
              <Badge tone={c.status === "confirmed" ? "emerald" : "amber"}>
                {c.status}
              </Badge>
              {c.status === "reported" && m.role === "admin" && (
                <Button
                  size="sm"
                  disabled={busy}
                  onClick={() =>
                    run({
                      type: "closure-decision",
                      id: c.id,
                      decision: "confirm",
                    })
                  }
                >
                  Confirm closure
                </Button>
              )}
              {c.status !== "cancelled" &&
                (m.role === "admin" ||
                  (c.status === "reported" && c.reportedBy === m.id)) && (
                  <Button
                    variant="ghost"
                    size="sm"
                    disabled={busy}
                    onClick={() =>
                      run({
                        type: "closure-decision",
                        id: c.id,
                        decision: "cancel",
                      })
                    }
                  >
                    Cancel closure
                  </Button>
                )}
            </article>
          ))}
        {triggers.map((t) => (
          <article
            className="disruption-row"
            key={`${t.trigger}-${t.triggerId}`}
          >
            <span className="icon-tile tone-amber">
              {t.trigger === "closure" ? (
                <DoorClosed size={19} />
              ) : (
                <CalendarDays size={19} />
              )}
            </span>
            <div>
              <strong>{t.label}</strong>
              <p>
                {t.date} · {t.occurrences.length} affected classes ·{" "}
                {
                  data.settings.periods.find(
                    (p) =>
                      p.id === Math.min(...t.occurrences.map((o) => o.period)),
                  )?.start
                }
              </p>
              <small>
                Responsible:{" "}
                {[
                  ...new Set(
                    t.occurrences.map(
                      (o) =>
                        data.departments.find(
                          (d) =>
                            d.id ===
                            data.sections.find((s) => s.id === o.sectionId)
                              ?.departmentId,
                        )?.code,
                    ),
                  ),
                ].join(", ")}{" "}
                coordinator
              </small>
            </div>
            <Button
              variant="outline"
              size="sm"
              disabled={
                busy ||
                t.occurrences.every(
                  (o) =>
                    classStart(o.date, o.period, data.settings) <= new Date(),
                )
              }
              onClick={() => setTrigger(t)}
            >
              <Sparkles size={14} />
              Find a repair
            </Button>
            {t.trigger === "closure" && m.role === "admin" && (
              <Button
                variant="ghost"
                size="sm"
                disabled={busy}
                onClick={() =>
                  run({
                    type: "closure-decision",
                    id: t.triggerId,
                    decision: "cancel",
                  })
                }
              >
                Cancel closure
              </Button>
            )}
          </article>
        ))}
        {!triggers.length && !closures.length && (
          <Empty
            title="No active disruptions"
            body="Room disruptions and approved partial-day absences will appear here. Full-day absences use qualified cover below."
          />
        )}
      </section>
      <section className="panel repair-plans-panel">
        <div className="panel-heading">
          <div>
            <h2>
              Repair proposals <span className="counter">{plans.length}</span>
            </h2>
            <p>
              Faculty acceptance and coordinator application are separate
              decisions.
            </p>
          </div>
        </div>
        {plans.length ? (
          plans
            .sort(
              (a, b) =>
                (
                  data.repairRequests.find((r) => r.id === a.requestId)?.date ||
                  ""
                ).localeCompare(
                  data.repairRequests.find((r) => r.id === b.requestId)?.date ||
                    "",
                ) ||
                Date.parse(a.deadline || a.createdAt) -
                  Date.parse(b.deadline || b.createdAt),
            )
            .map((p) => (
              <article className="disruption-row" key={p.id}>
                <span className="icon-tile tone-violet">
                  <Sparkles size={19} />
                </span>
                <div>
                  <strong>
                    {
                      data.repairRequests.find((r) => r.id === p.requestId)
                        ?.date
                    }{" "}
                    · {p.impact.classesChanged} classes · {p.impact.timeChanges}{" "}
                    time changes
                  </strong>
                  <p>
                    {p.status === "queued" || p.status === "running"
                      ? "Finding a same-day plan. You can keep using your workspace."
                      : p.error ||
                        p.diagnostics[0] ||
                        "Before/after details and faculty decisions are ready to review."}
                  </p>
                  {p.deadline && (
                    <small>
                      <Clock3 size={11} /> Apply before{" "}
                      {new Intl.DateTimeFormat("en-IN", {
                        timeZone: data.settings.timezone,
                        hour: "2-digit",
                        minute: "2-digit",
                      }).format(new Date(p.deadline))}
                    </small>
                  )}
                </div>
                <Badge
                  tone={
                    p.status === "ready" || p.status === "applied"
                      ? "emerald"
                      : "violet"
                  }
                >
                  {planLabels[p.status]}
                </Badge>
                <Button
                  size="sm"
                  variant="outline"
                  onClick={() => setSelected(p.id)}
                >
                  Review repair
                </Button>
              </article>
            ))
        ) : (
          <Empty
            title="No repair proposals yet"
            body="Select a disruption to compare the smallest valid set of changes."
          />
        )}
      </section>
      <div className="desk-coverage-heading">
        <h2>Qualified cover & absence approvals</h2>
        <p>
          Keep class times fixed by offering cover, or approve requests before
          planning a repair.
        </p>
      </div>
      <CoverageView data={data} run={run} busy={busy} />
      {report && (
        <Modal
          title={
            m.role === "admin"
              ? "Record a room closure"
              : "Report a suspected room closure"
          }
          description={
            m.role === "admin"
              ? "Affected classes stay on the timetable and are flagged until repaired."
              : "An admin must confirm a shared-room closure before it affects bookings."
          }
          onClose={() => setReport(false)}
        >
          <form
            onSubmit={async (e) => {
              e.preventDefault();
              const f = new FormData(e.currentTarget);
              if (
                await run({
                  type: "closure-create",
                  roomId: String(f.get("room")),
                  date: String(f.get("date")),
                  periods: f.getAll("periods").map(Number),
                  reason: String(f.get("reason")),
                })
              )
                setReport(false);
            }}
          >
            <div className="form-grid">
              <label>
                Room
                <select name="room" aria-label="Room">
                  {data.rooms.map((r) => (
                    <option value={r.id} key={r.id}>
                      {r.name}
                    </option>
                  ))}
                </select>
              </label>
              <label>
                Date
                <input
                  type="date"
                  name="date"
                  required
                  min={today}
                  max={data.settings.end}
                  defaultValue={
                    data.occurrences.find((o) => o.date >= today)?.date || today
                  }
                />
              </label>
            </div>
            <label>Affected periods</label>
            <div className="period-checkboxes">
              {data.settings.periods
                .filter((p) => !p.break)
                .map((p) => (
                  <label key={p.id}>
                    <input type="checkbox" name="periods" value={p.id} />
                    {p.start}
                  </label>
                ))}
            </div>
            <label>
              Reason
              <textarea
                name="reason"
                required
                maxLength={500}
                placeholder="For example, a maintenance issue or equipment replacement."
              />
            </label>
            <div className="modal-actions">
              <Button
                type="button"
                variant="outline"
                onClick={() => setReport(false)}
              >
                Cancel
              </Button>
              <Button disabled={busy}>
                {m.role === "admin" ? "Confirm room closure" : "Submit report"}
              </Button>
            </div>
          </form>
        </Modal>
      )}
      {trigger && (
        <Modal
          title="Plan the smallest valid repair"
          description={`${trigger.date} · ${trigger.label}`}
          onClose={() => setTrigger(null)}
        >
          <form
            onSubmit={async (e) => {
              e.preventDefault();
              const f = new FormData(e.currentTarget);
              const result = await run({
                type: "repair-request",
                key: crypto.randomUUID(),
                trigger: trigger.trigger,
                triggerId: trigger.triggerId,
                departmentIds: f.getAll("departments").map(String),
              });
              if (result) {
                setTrigger(null);
                setSelected(result.planId);
              }
            }}
          >
            <label>Departments allowed to change</label>
            <div className="department-scope">
              {data.departments
                .filter((d) => m.role === "admin" || d.id === m.departmentId)
                .map((d) => (
                  <label className="checkbox-label" key={d.id}>
                    <input
                      type="checkbox"
                      name="departments"
                      value={d.id}
                      defaultChecked={trigger.occurrences.some(
                        (o) =>
                          data.sections.find((s) => s.id === o.sectionId)
                            ?.departmentId === d.id,
                      )}
                    />
                    {d.name}
                  </label>
                ))}
            </div>
            <div className="info-box">
              Other departments, started classes, pending substitution offers,
              and confirmed cover stay fixed. Existing teachers and class
              lengths are preserved. The solver has up to 30 seconds.
            </div>
            <div className="modal-actions">
              <Button
                type="button"
                variant="outline"
                onClick={() => setTrigger(null)}
              >
                Cancel
              </Button>
              <Button disabled={busy}>
                <Sparkles size={15} />
                {busy ? "Finding a repair…" : "Generate repair proposal"}
              </Button>
            </div>
          </form>
        </Modal>
      )}
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
