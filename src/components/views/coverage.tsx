"use client";
import { useState } from "react";
import {
  ArrowRight,
  CalendarDays,
  Check,
  CheckCheck,
  Clock3,
  Plus,
  Repeat2,
  ShieldCheck,
  Sparkles,
} from "lucide-react";
import type { AppData, Coverage } from "@/lib/types";
import { localDate, classStart } from "@/lib/time";
import {
  Avatar,
  Badge,
  Empty,
  Modal,
  type RunAction,
} from "../ui/workspace-ui";
import { Button } from "../ui/button";
import { RepairInbox } from "./repair-review";
export function AbsenceForm({
  data,
  run,
  busy,
  onClose,
}: {
  data: AppData;
  run: RunAction;
  busy: boolean;
  onClose: () => void;
}) {
  const faculty =
    data.viewer.member.role === "faculty"
      ? data.faculty.filter((f) => f.id === data.viewer.member.facultyId)
      : data.faculty.filter(
          (f) =>
            data.viewer.member.role === "admin" ||
            f.departmentId === data.viewer.member.departmentId,
        );
  return (
    <Modal
      title="Plan for an absence"
      description="Choose the dates you will be unavailable."
      onClose={onClose}
    >
      <form
        onSubmit={async (e) => {
          e.preventDefault();
          const form = new FormData(e.currentTarget);
          const result = await run({
            type: "absence",
            facultyId: String(form.get("facultyId")),
            date: String(form.get("date")),
            reason: String(form.get("reason")),
            periods: form.getAll("periods").map(Number),
            urgent: form.get("urgent") === "on",
          });
          if (result) onClose();
        }}
      >
        <div className="form-grid">
          <label>
            Faculty
            <select name="facultyId">
              {faculty.map((f) => (
                <option key={f.id} value={f.id}>
                  {f.name}
                </option>
              ))}
            </select>
          </label>
          <label>
            Date
            <input
              name="date"
              type="date"
              min={localDate(new Date(), data.settings.timezone)}
              max={data.settings.end}
              defaultValue={localDate(new Date(), data.settings.timezone)}
              required
            />
          </label>
        </div>
        <label>
          Periods <span className="muted">Leave empty for the whole day</span>
        </label>
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
            placeholder="A brief note for your coordinator…"
            required
            maxLength={1000}
          />
        </label>
        {data.viewer.member.role !== "faculty" && (
          <label className="checkbox-label">
            <input type="checkbox" name="urgent" />
            Approve immediately as an urgent absence
          </label>
        )}
        <div className="modal-actions">
          <Button variant="outline" type="button" onClick={onClose}>
            Cancel
          </Button>
          <Button disabled={busy}>Submit request</Button>
        </div>
      </form>
    </Modal>
  );
}
export function CoverageView({
  data,
  run,
  busy,
}: {
  data: AppData;
  run: RunAction;
  busy: boolean;
}) {
  const [tab, setTab] = useState("active"),
    [selected, setSelected] = useState<Coverage | null>(null),
    [absence, setAbsence] = useState(false),
    [windowMinutes, setWindowMinutes] = useState(30);
  const pending = data.absences.filter((a) => a.status === "pending");
  const tasks = data.coverage.filter((c) =>
    tab === "covered" ? c.status === "covered" : c.status !== "covered",
  );
  return (
    <>
      <div className="section-actions">
        <div className="segmented-control">
          <button
            className={tab === "active" ? "selected" : ""}
            onClick={() => setTab("active")}
          >
            Coverage queue{" "}
            <span>
              {data.coverage.filter((c) => c.status !== "covered").length}
            </span>
          </button>
          <button
            className={tab === "covered" ? "selected" : ""}
            onClick={() => setTab("covered")}
          >
            Confirmed cover
          </button>
          <button
            className={tab === "requests" ? "selected" : ""}
            onClick={() => setTab("requests")}
          >
            Absence requests <span>{pending.length}</span>
          </button>
        </div>
        <Button variant="outline" onClick={() => setAbsence(true)}>
          <Plus size={16} />
          Record absence
        </Button>
      </div>
      {tab === "requests" ? (
        <section className="panel">
          {data.absences.length ? (
            <div className="table-scroll">
              <table className="data-table">
                <thead>
                  <tr>
                    <th>Faculty</th>
                    <th>Date / periods</th>
                    <th>Reason</th>
                    <th>Status</th>
                    <th>Decision</th>
                  </tr>
                </thead>
                <tbody>
                  {data.absences.map((a) => (
                    <tr key={a.id}>
                      <td>
                        <strong>
                          {data.faculty.find((f) => f.id === a.facultyId)?.name}
                        </strong>
                      </td>
                      <td>
                        {a.date}
                        <small>
                          {a.periods.length
                            ? `${a.periods.length} selected periods`
                            : "Full day"}
                        </small>
                      </td>
                      <td>{a.reason}</td>
                      <td>
                        <Badge
                          tone={
                            a.status === "approved"
                              ? "emerald"
                              : a.status === "rejected"
                                ? "rose"
                                : "amber"
                          }
                        >
                          {a.status}
                        </Badge>
                      </td>
                      <td>
                        {a.status === "pending" && (
                          <div className="row-actions">
                            <Button
                              size="sm"
                              disabled={busy}
                              onClick={() =>
                                run({
                                  type: "absence-decision",
                                  id: a.id,
                                  approve: true,
                                })
                              }
                            >
                              Approve
                            </Button>
                            <Button
                              size="sm"
                              variant="ghost"
                              disabled={busy}
                              onClick={() =>
                                run({
                                  type: "absence-decision",
                                  id: a.id,
                                  approve: false,
                                })
                              }
                            >
                              Reject
                            </Button>
                          </div>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          ) : (
            <Empty
              title="No absence requests"
              body="Requests from your faculty will appear here."
            />
          )}
        </section>
      ) : (
        <div className="coverage-layout">
          <section className="panel coverage-list">
            <div className="panel-heading">
              <div>
                <h2>
                  {tab === "covered"
                    ? "Classes in good hands"
                    : "Classes needing cover"}
                </h2>
                <p>
                  {tab === "covered"
                    ? "Accepted substitutions for dated classes."
                    : ""}
                </p>
              </div>
              <Badge tone={tab === "covered" ? "emerald" : "amber"}>
                {tasks.length} classes
              </Badge>
            </div>
            {tasks.length ? (
              tasks.map((c) => {
                const o = data.occurrences.find(
                  (o) => o.id === c.occurrenceId,
                )!;
                const req = data.requirements.find(
                  (r) => r.id === o.requirementId,
                );
                const subject = data.subjects.find(
                  (s) => s.id === req?.subjectId,
                );
                const original = data.faculty.find(
                  (f) => f.id === o.originalFacultyId,
                )!;
                const offer = data.offers.find(
                  (x) => x.coverageId === c.id && x.status === "pending",
                );
                return (
                  <div
                    key={c.id}
                    className={`coverage-card ${selected?.id === c.id ? "coverage-selected" : ""}`}
                  >
                    <div className="coverage-card-top">
                      <Badge tone={subject?.color || "violet"}>
                        {subject?.code}
                      </Badge>
                      <Badge
                        tone={
                          c.status === "covered"
                            ? "emerald"
                            : c.status === "offered"
                              ? "violet"
                              : "amber"
                        }
                      >
                        {c.status === "uncovered"
                          ? "Needs cover"
                          : c.status === "offered"
                            ? "Awaiting acceptance"
                            : "Confirmed"}
                      </Badge>
                    </div>
                    <h3>{subject?.name}</h3>
                    <p>
                      {data.sections.find((s) => s.id === o.sectionId)?.name}{" "}
                      <span>·</span>{" "}
                      {data.rooms.find((r) => r.id === o.roomId)?.name}
                    </p>
                    <div className="coverage-meta">
                      <span>
                        <CalendarDays size={14} />
                        {o.date}
                      </span>
                      <span>
                        <Clock3 size={14} />
                        {
                          data.settings.periods.find((p) => p.id === o.period)
                            ?.start
                        }{" "}
                        –{" "}
                        {
                          data.settings.periods.find(
                            (p) => p.id === o.period + o.duration - 1,
                          )?.end
                        }
                      </span>
                    </div>
                    <div className="coverage-card-bottom">
                      <span className="faculty-tag">
                        <Avatar faculty={original} size="avatar-small" />
                        {original.name}
                      </span>
                      {c.status === "uncovered" ? (
                        <Button
                          size="sm"
                          variant="outline"
                          onClick={() => setSelected(c)}
                        >
                          <Sparkles size={14} />
                          View suggestions
                        </Button>
                      ) : c.status === "offered" && offer ? (
                        <Button
                          size="sm"
                          variant="ghost"
                          disabled={busy}
                          onClick={() =>
                            run({
                              type: "offer-response",
                              id: offer.id,
                              decision: "withdrawn",
                            })
                          }
                        >
                          Withdraw offer
                        </Button>
                      ) : (
                        <div className="confirmed-cover">
                          <span className="confirmed-name">
                            <Check size={14} />
                            {
                              data.faculty.find((f) => f.id === c.substituteId)
                                ?.name
                            }
                          </span>
                          <Button
                            size="sm"
                            variant="ghost"
                            disabled={busy}
                            onClick={() =>
                              run({ type: "reopen-coverage", coverageId: c.id })
                            }
                          >
                            Reopen
                          </Button>
                        </div>
                      )}
                    </div>
                    {offer && (
                      <div className="offer-caption">
                        Offered to{" "}
                        {
                          data.faculty.find((f) => f.id === offer.facultyId)
                            ?.name
                        }{" "}
                        · Expires{" "}
                        {new Intl.DateTimeFormat("en-IN", {
                          timeZone: data.settings.timezone,
                          hour: "2-digit",
                          minute: "2-digit",
                        }).format(new Date(offer.expiresAt))}
                      </div>
                    )}
                  </div>
                );
              })
            ) : (
              <Empty
                title="No classes needing cover"
                body={
                  tab === "covered"
                    ? "Accepted substitutions will appear here."
                    : "There are no uncovered classes in your department."
                }
              />
            )}
          </section>
          <aside className="panel suggestions-panel">
            <div className="panel-heading">
              <div>
                <h2>Qualified substitutes</h2>
              </div>
            </div>
            {selected &&
            data.coverage.find((c) => c.id === selected.id)?.status ===
              "uncovered" ? (
              <>
                <div className="suggestion-context">
                  Ranked by workload headroom, recent substitutions, and
                  adjacent teaching.
                  <label className="offer-window">
                    Offer expiry
                    <select
                      aria-label="Offer response window"
                      value={windowMinutes}
                      onChange={(e) => setWindowMinutes(Number(e.target.value))}
                    >
                      <option value={10}>10 minutes</option>
                      <option value={30}>30 minutes</option>
                      <option value={60}>60 minutes</option>
                    </select>
                  </label>
                  <small>Offers always expire before the class starts.</small>
                </div>
                {data.candidates[selected.id]?.length ? (
                  data.candidates[selected.id].map((candidate, i) => {
                    const f = data.faculty.find(
                      (f) => f.id === candidate.facultyId,
                    )!;
                    return (
                      <div className="candidate-card" key={f.id}>
                        <div className="candidate-heading">
                          <Avatar faculty={f} />
                          <div>
                            <strong>{f.name}</strong>
                            <span>{f.title}</span>
                          </div>
                          {i === 0 && <Badge tone="violet">Top match</Badge>}
                        </div>
                        <div className="candidate-load">
                          <span>Weekly teaching load</span>
                          <strong>
                            {candidate.resultingLoad} / {f.maxWeekly}
                          </strong>
                        </div>
                        <div className="workload-track">
                          <span
                            style={{
                              width: `${(candidate.resultingLoad / f.maxWeekly) * 100}%`,
                            }}
                          />
                        </div>
                        <ul>
                          {candidate.reasons.map((reason) => (
                            <li key={reason}>
                              <Check size={13} />
                              {reason}
                            </li>
                          ))}
                        </ul>
                        <Button
                          variant={i === 0 ? "default" : "outline"}
                          disabled={busy}
                          onClick={async () => {
                            if (
                              await run({
                                type: "offer",
                                coverageId: selected.id,
                                facultyId: f.id,
                                expiresAt:
                                  windowMinutes === 30
                                    ? undefined
                                    : new Date(
                                        Math.min(
                                          Date.now() + windowMinutes * 60000,
                                          classStart(
                                            data.occurrences.find(
                                              (o) =>
                                                o.id === selected.occurrenceId,
                                            )!.date,
                                            data.occurrences.find(
                                              (o) =>
                                                o.id === selected.occurrenceId,
                                            )!.period,
                                            data.settings,
                                          ).getTime(),
                                        ),
                                      ).toISOString(),
                              })
                            )
                              setSelected(null);
                          }}
                        >
                          Send offer <ArrowRight size={14} />
                        </Button>
                      </div>
                    );
                  })
                ) : (
                  <Empty
                    title="No eligible match yet"
                    body="Review availability or approved subject qualifications. The class remains uncovered."
                  />
                )}
              </>
            ) : (
              <div className="suggestions-empty">
                <span className="generation-icon">
                  <Repeat2 size={30} />
                </span>
                <h3>Select a class</h3>
                <p>
                  Select a class to see available, qualified faculty and how
                  each assignment affects their workload.
                </p>
                <span>
                  <ShieldCheck size={14} /> Confirmed only after acceptance
                </span>
              </div>
            )}
          </aside>
        </div>
      )}
      {absence && (
        <AbsenceForm
          data={data}
          run={run}
          busy={busy}
          onClose={() => setAbsence(false)}
        />
      )}
    </>
  );
}
export function InboxView({
  data,
  run,
  busy,
}: {
  data: AppData;
  run: RunAction;
  busy: boolean;
}) {
  const m = data.viewer.member;
  const offers = data.offers.filter((o) => o.facultyId === m.facultyId);
  return (
    <>
      <div className="section-actions">
        <Button
          variant="outline"
          onClick={() => run({ type: "read-notifications" })}
          disabled={busy}
        >
          <CheckCheck size={16} />
          Mark all as read
        </Button>
      </div>
      <RepairInbox data={data} run={run} busy={busy} />
      <div className="inbox-layout">
        <section className="panel">
          <div className="panel-heading">
            <div>
              <h2>Substitution offers</h2>
            </div>
          </div>
          {offers.length ? (
            offers.map((offer) => {
              const c = data.coverage.find((c) => c.id === offer.coverageId);
              const o = data.occurrences.find((o) => o.id === c?.occurrenceId);
              const req = data.requirements.find(
                (r) => r.id === o?.requirementId,
              );
              return (
                <article className="inbox-offer" key={offer.id}>
                  <Badge
                    tone={
                      offer.status === "pending"
                        ? "violet"
                        : offer.status === "accepted"
                          ? "emerald"
                          : "neutral"
                    }
                  >
                    {offer.status}
                  </Badge>
                  <h3>
                    {data.subjects.find((s) => s.id === req?.subjectId)?.name ||
                      "Class substitution"}
                  </h3>
                  <p>
                    {o?.date} ·{" "}
                    {
                      data.settings.periods.find((p) => p.id === o?.period)
                        ?.start
                    }{" "}
                    · {data.sections.find((s) => s.id === o?.sectionId)?.name}
                  </p>
                  <p className="tiny muted">
                    Expires{" "}
                    {new Intl.DateTimeFormat("en-IN", {
                      timeZone: data.settings.timezone,
                      dateStyle: "medium",
                      timeStyle: "short",
                    }).format(new Date(offer.expiresAt))}
                  </p>
                  {offer.status === "pending" && (
                    <div className="row-actions">
                      <Button
                        disabled={busy}
                        onClick={() =>
                          run({
                            type: "offer-response",
                            id: offer.id,
                            decision: "accepted",
                          })
                        }
                      >
                        <Check size={15} />
                        Accept offer
                      </Button>
                      <Button
                        variant="outline"
                        disabled={busy}
                        onClick={() =>
                          run({
                            type: "offer-response",
                            id: offer.id,
                            decision: "declined",
                          })
                        }
                      >
                        Decline
                      </Button>
                    </div>
                  )}
                </article>
              );
            })
          ) : (
            <Empty
              title="No offers waiting"
              body="When a coordinator offers you a class, you can review and respond here."
            />
          )}
        </section>
        <section className="panel">
          <div className="panel-heading">
            <div>
              <h2>Campus updates</h2>
            </div>
          </div>
          {data.notifications.length ? (
            [...data.notifications].reverse().map((n) => (
              <a
                className={`notification-row ${n.read ? "" : "notification-unread"}`}
                key={n.id}
                href={n.href}
              >
                <span className="icon-tile tone-violet">
                  <CalendarDays size={18} />
                </span>
                <div>
                  <strong>{n.title}</strong>
                  <p>{n.body}</p>
                  <small>
                    {new Intl.DateTimeFormat("en-IN", {
                      timeZone: data.settings.timezone,
                      dateStyle: "medium",
                    }).format(new Date(n.createdAt))}
                  </small>
                </div>
                {!n.read && <span className="unread-dot" />}
              </a>
            ))
          ) : (
            <Empty
              title="You’re up to date"
              body="Timetable publications and offer decisions will appear here."
            />
          )}
        </section>
      </div>
    </>
  );
}
