"use client";
import { useState } from "react";
import {
  ArrowDownToLine,
  Check,
  ChevronLeft,
  ChevronRight,
  GitCompareArrows,
  LockKeyhole,
  Printer,
  ShieldCheck,
  Copy,
  LoaderCircle,
} from "lucide-react";
import { downloadCsv } from "../ui/download-csv";
import type { AppData, Entry } from "@/lib/types";
import { DAYS, localDate, monday, addDays, weekday } from "@/lib/time";
import { Badge, Empty, Modal, type RunAction } from "../ui/workspace-ui";
import { Button } from "../ui/button";
import { ScheduleChangeNotice } from "./repair-review";
export function TimetableView({
  data,
  run,
  busy,
}: {
  data: AppData;
  run: RunAction;
  busy: boolean;
}) {
  const [selected, setSelected] = useState(""),
    [dimension, setDimension] = useState("section"),
    [entity, setEntity] = useState(""),
    [editing, setEditing] = useState<Entry | null>(null),
    [publish, setPublish] = useState(false),
    [compare, setCompare] = useState(""),
    [week, setWeek] = useState(() => {
      const today = localDate(new Date(), data.settings.timezone),
        current = monday(today);
      return data.occurrences.some(
        (o) => o.date >= current && o.date <= addDays(current, 6),
      )
        ? current
        : monday(data.occurrences.find((o) => o.date >= today)?.date || today);
    });
  const versions = [...data.versions].reverse();
  const version =
    versions.find((v) => v.id === selected) ||
    versions.find((v) => v.status === "draft") ||
    versions[0];
  const role = data.viewer.member.role;
  const items =
    dimension === "section"
      ? data.sections
      : dimension === "faculty"
        ? data.faculty
        : data.rooms;
  const entityId =
    entity ||
    (role === "faculty" && dimension === "faculty"
      ? data.viewer.member.facultyId
      : items[0]?.id);
  const displayed =
    version && version.status !== "draft"
      ? data.occurrences
          .filter(
            (o) =>
              o.versionId === version.id &&
              o.date >= week &&
              o.date <= addDays(week, 6),
          )
          .map((o) => ({
            ...version.entries.find((e) => e.id === o.entryId)!,
            facultyId: o.facultyId,
            period: o.period,
            roomId: o.roomId,
            duration: o.duration,
            day: weekday(o.date),
          }))
      : version?.entries;
  const entries =
    displayed?.filter((e) =>
      dimension === "faculty"
        ? e.facultyId === entityId
        : dimension === "room"
          ? e.roomId === entityId
          : data.requirements.find((r) => r.id === e.requirementId)
              ?.sectionId === entityId,
    ) || [];
  const baseline = versions.find((v) => v.id === compare);
  const changed =
    baseline && version
      ? version.entries.filter(
          (e) =>
            !baseline.entries.some(
              (b) =>
                b.requirementId === e.requirementId &&
                b.facultyId === e.facultyId &&
                b.roomId === e.roomId &&
                b.day === e.day &&
                b.period === e.period,
            ),
        ).length
      : 0;
  const jobs = data.jobs.filter((j) => j.status !== "completed");
  const notice = (e: Entry) => {
    if (!version || version.status === "draft") return null;
    const date = addDays(week, (e.day + 6) % 7),
      base = version.entries.find((x) => x.id === e.id);
    if (
      data.roomClosures.some(
        (c) =>
          c.status === "confirmed" &&
          c.date === date &&
          c.roomId === e.roomId &&
          Array.from({ length: e.duration }, (_, i) => e.period + i).some((p) =>
            c.periods.includes(p),
          ),
      )
    )
      return (
        <small className="dated-warning">Room closed · repair pending</small>
      );
    if (
      base &&
      (base.period !== e.period ||
        base.roomId !== e.roomId ||
        base.facultyId !== e.facultyId)
    )
      return (
        <small className="dated-repair-marker">Dated change applied</small>
      );
    return null;
  };
  return (
    <>
      <ScheduleChangeNotice data={data} />
      {jobs.map((job) => (
        <div
          className={
            job.status === "failed" ? "error-box" : "info-box job-status"
          }
          key={job.id}
        >
          {job.status !== "failed" && (
            <LoaderCircle className="spin" size={18} />
          )}
          <div>
            <strong>
              {job.status === "failed"
                ? "Generation needs attention"
                : "Generating timetable…"}
            </strong>
            <p>
              {job.error ||
                "You can keep using your workspace. The draft will appear when the solver finishes."}
            </p>
          </div>
        </div>
      ))}
      <section className="panel timetable-panel">
        <div className="timetable-toolbar">
          <div className="segmented-control">
            {["section", "faculty", "room"].map((d) => (
              <button
                key={d}
                className={dimension === d ? "selected" : ""}
                onClick={() => {
                  setDimension(d);
                  setEntity("");
                }}
              >
                {d[0].toUpperCase() + d.slice(1)}
              </button>
            ))}
          </div>
          <select
            aria-label="Timetable resource"
            value={entityId || ""}
            onChange={(e) => setEntity(e.target.value)}
          >
            {items.map((item) => (
              <option value={item.id} key={item.id}>
                {item.name}
              </option>
            ))}
          </select>
          <span className="toolbar-spacer" />
          {version && version.status !== "draft" && (
            <div className="week-navigation">
              <Button
                variant="ghost"
                size="icon"
                aria-label="Previous week"
                onClick={() => setWeek(addDays(week, -7))}
              >
                <ChevronLeft size={15} />
              </Button>
              <span>{week}</span>
              <Button
                variant="ghost"
                size="icon"
                aria-label="Next week"
                onClick={() => setWeek(addDays(week, 7))}
              >
                <ChevronRight size={15} />
              </Button>
            </div>
          )}
          <Button
            variant="outline"
            size="sm"
            onClick={() =>
              downloadCsv(
                "facultyflow-timetable.csv",
                entries.map((e) => {
                  const r = data.requirements.find(
                    (r) => r.id === e.requirementId,
                  );
                  return {
                    day: DAYS[e.day],
                    start: data.settings.periods.find((p) => p.id === e.period)
                      ?.start,
                    end: data.settings.periods.find(
                      (p) => p.id === e.period + e.duration - 1,
                    )?.end,
                    subject: data.subjects.find((s) => s.id === r?.subjectId)
                      ?.name,
                    section: data.sections.find((s) => s.id === r?.sectionId)
                      ?.name,
                    faculty: data.faculty.find((f) => f.id === e.facultyId)
                      ?.name,
                    room: data.rooms.find((r) => r.id === e.roomId)?.name,
                  };
                }),
              )
            }
          >
            <ArrowDownToLine size={15} />
            Export
          </Button>
          <Button variant="outline" size="sm" onClick={() => window.print()}>
            <Printer size={15} />
            Print
          </Button>
        </div>
        <div className="version-bar">
          <div>
            <span className="live-dot" />
            <select
              aria-label="Timetable version"
              value={version?.id || ""}
              onChange={(e) => setSelected(e.target.value)}
            >
              {versions.map((v) => (
                <option key={v.id} value={v.id}>
                  {v.name} · {v.status}
                </option>
              ))}
            </select>
            {version && (
              <Badge
                tone={version.status === "published" ? "emerald" : "violet"}
              >
                {version.status}
              </Badge>
            )}
            {version?.solverStatus && (
              <Badge>{version.solverStatus.toLowerCase()}</Badge>
            )}
          </div>
          <div>
            {role !== "faculty" && version && (
              <>
                <Button
                  size="sm"
                  variant="ghost"
                  disabled={busy}
                  onClick={async () => {
                    const result = await run({
                      type: "clone",
                      versionId: version.id,
                    });
                    if (result) setSelected(result.versionId);
                  }}
                >
                  <Copy size={14} />
                  Create revision
                </Button>
                {role === "admin" &&
                  version.status === "draft" &&
                  version.entries.length > 0 && (
                    <Button
                      size="sm"
                      disabled={busy}
                      onClick={() => setPublish(true)}
                    >
                      <ShieldCheck size={14} />
                      Publish timetable
                    </Button>
                  )}
              </>
            )}
          </div>
        </div>
        {version?.diagnostics.map((d, i) => (
          <div className="info-box timetable-diagnostic" key={i}>
            {d}
          </div>
        ))}
        {entries.length ? (
          <>
            <div className="timetable-scroll">
              <table className="timetable-grid">
                <caption className="sr-only">
                  {items.find((i) => i.id === entityId)?.name} weekly timetable,{" "}
                  {version?.name}
                </caption>
                <thead>
                  <tr>
                    <th scope="col">TIME</th>
                    {data.settings.days.map((day) => (
                      <th scope="col" key={day}>
                        {DAYS[day]}
                        {day === weekdayToday(data) && (
                          <span className="today-mark">Today</span>
                        )}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {data.settings.periods.map((p) => (
                    <tr key={p.id} className={p.break ? "break-row" : ""}>
                      <th scope="row">
                        <strong>{p.start}</strong>
                        <span>{p.end}</span>
                      </th>
                      {data.settings.days.map((day) => {
                        if (p.break)
                          return (
                            <td key={day}>
                              <span>{p.label}</span>
                            </td>
                          );
                        const matches = entries.filter(
                          (e) =>
                            e.day === day &&
                            p.id >= e.period &&
                            p.id < e.period + e.duration,
                        );
                        return (
                          <td key={day}>
                            {matches.map((e) => {
                              const req = data.requirements.find(
                                (r) => r.id === e.requirementId,
                              );
                              const sub = data.subjects.find(
                                (s) => s.id === req?.subjectId,
                              );
                              return (
                                <button
                                  key={e.id}
                                  className={`class-block tone-${sub?.color || "violet"} ${e.period !== p.id ? "continuation" : ""}`}
                                  onClick={() => setEditing({ ...e })}
                                >
                                  <span>
                                    {sub?.code}{" "}
                                    {req?.kind === "lab" ? "· LAB" : ""}
                                    {e.locked && <LockKeyhole size={11} />}
                                  </span>
                                  <strong>{sub?.name}</strong>
                                  {notice(e)}
                                  <small>
                                    {
                                      data.faculty.find(
                                        (f) => f.id === e.facultyId,
                                      )?.name
                                    }
                                  </small>
                                  <small>
                                    {
                                      data.rooms.find((r) => r.id === e.roomId)
                                        ?.name
                                    }
                                    {dimension !== "section"
                                      ? ` · ${data.sections.find((s) => s.id === req?.sectionId)?.name}`
                                      : ""}
                                    {e.period !== p.id ? " · continued" : ""}
                                  </small>
                                </button>
                              );
                            })}
                          </td>
                        );
                      })}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <div className="mobile-timetable-agenda">
              {data.settings.days.map((day) => (
                <section key={day}>
                  <h3>{DAYS[day]}</h3>
                  {entries
                    .filter((e) => e.day === day)
                    .sort((a, b) => a.period - b.period)
                    .map((e) => {
                      const req = data.requirements.find(
                        (r) => r.id === e.requirementId,
                      );
                      const subject = data.subjects.find(
                        (s) => s.id === req?.subjectId,
                      );
                      return (
                        <button
                          className={`agenda-class tone-${subject?.color || "violet"}`}
                          key={e.id}
                          onClick={() => setEditing({ ...e })}
                        >
                          <span>
                            {
                              data.settings.periods.find(
                                (p) => p.id === e.period,
                              )?.start
                            }{" "}
                            ·{" "}
                            {
                              data.settings.periods.find(
                                (p) => p.id === e.period + e.duration - 1,
                              )?.end
                            }
                          </span>
                          <strong>{subject?.name}</strong>
                          {notice(e)}
                          <small>
                            {
                              data.faculty.find((f) => f.id === e.facultyId)
                                ?.name
                            }{" "}
                            · {data.rooms.find((r) => r.id === e.roomId)?.name}
                          </small>
                        </button>
                      );
                    })}
                  {!entries.some((e) => e.day === day) && (
                    <p className="muted">No scheduled classes</p>
                  )}
                </section>
              ))}
            </div>
            <div className="timetable-legend">
              {data.subjects
                .filter((s) =>
                  entries.some(
                    (e) =>
                      data.requirements.find((r) => r.id === e.requirementId)
                        ?.subjectId === s.id,
                  ),
                )
                .map((s) => (
                  <span key={s.id}>
                    <i className={`tone-${s.color}`} />
                    {s.name}
                  </span>
                ))}
            </div>
          </>
        ) : (
          <Empty
            title={
              version
                ? "No classes in this view"
                : "A fresh start for your semester"
            }
            body={
              version
                ? "Choose another resource or review generation diagnostics."
                : "Add your faculty and teaching requirements, then generate your first draft."
            }
          />
        )}
      </section>
      {version?.quality && (
        <div className="quality-grid">
          {Object.entries(version.quality).map(([key, value]) => (
            <div key={key}>
              <span>
                {(
                  {
                    loadDeviation: "Normalized load deviation",
                    facultyGaps: "Faculty gap periods",
                    preferencePenalty: "Periods outside preferences",
                    subjectSpreadPenalty: "Repeated subject days",
                  } as Record<string, string>
                )[key] || key}
              </span>
              <strong>{value}</strong>
            </div>
          ))}
        </div>
      )}
      {versions.length > 1 && (
        <section className="panel comparison-panel">
          <GitCompareArrows size={20} />
          <div>
            <h3>Compare versions</h3>
            <p>See how many placements differ from another version.</p>
          </div>
          <select
            aria-label="Comparison baseline"
            value={compare}
            onChange={(e) => setCompare(e.target.value)}
          >
            <option value="">Choose a version</option>
            {versions
              .filter((v) => v.id !== version?.id)
              .map((v) => (
                <option key={v.id} value={v.id}>
                  {v.name}
                </option>
              ))}
          </select>
          {baseline && (
            <Badge tone="violet">{changed} changed placements</Badge>
          )}
        </section>
      )}
      {editing && version && (
        <Modal
          title={
            role !== "faculty" && version.status === "draft"
              ? "Adjust this assignment"
              : "Class details"
          }
          description="Changes are checked against the entire college timetable."
          onClose={() => setEditing(null)}
        >
          <form
            onSubmit={async (e) => {
              e.preventDefault();
              if (
                await run({
                  type: "edit-entry",
                  versionId: version.id,
                  entry: editing,
                })
              )
                setEditing(null);
            }}
          >
            <div className="form-grid">
              <label>
                Faculty
                <select
                  value={editing.facultyId}
                  disabled={role === "faculty" || version.status !== "draft"}
                  onChange={(e) =>
                    setEditing({ ...editing, facultyId: e.target.value })
                  }
                >
                  {data.faculty.map((f) => (
                    <option key={f.id} value={f.id}>
                      {f.name}
                    </option>
                  ))}
                </select>
              </label>
              <label>
                Room
                <select
                  value={editing.roomId}
                  disabled={role === "faculty" || version.status !== "draft"}
                  onChange={(e) =>
                    setEditing({ ...editing, roomId: e.target.value })
                  }
                >
                  {data.rooms.map((r) => (
                    <option key={r.id} value={r.id}>
                      {r.name}
                    </option>
                  ))}
                </select>
              </label>
              <label>
                Day
                <select
                  value={editing.day}
                  disabled={role === "faculty" || version.status !== "draft"}
                  onChange={(e) =>
                    setEditing({ ...editing, day: Number(e.target.value) })
                  }
                >
                  {data.settings.days.map((d) => (
                    <option key={d} value={d}>
                      {DAYS[d]}
                    </option>
                  ))}
                </select>
              </label>
              <label>
                Starting period
                <select
                  value={editing.period}
                  disabled={role === "faculty" || version.status !== "draft"}
                  onChange={(e) =>
                    setEditing({ ...editing, period: Number(e.target.value) })
                  }
                >
                  {data.settings.periods
                    .filter((p) => !p.break)
                    .map((p) => (
                      <option key={p.id} value={p.id}>
                        {p.label} · {p.start}
                      </option>
                    ))}
                </select>
              </label>
            </div>
            {version.status === "draft" && role !== "faculty" && (
              <>
                <label className="checkbox-label">
                  <input
                    type="checkbox"
                    checked={editing.locked}
                    onChange={(e) =>
                      setEditing({ ...editing, locked: e.target.checked })
                    }
                  />
                  <LockKeyhole size={15} />
                  Lock this assignment during regeneration
                </label>
                <p className="tiny muted">
                  A component keeps one teacher for the semester. Changing its
                  teacher requires updating the component’s complete set of
                  sessions.
                </p>
                <div className="modal-actions">
                  <Button
                    variant="outline"
                    type="button"
                    onClick={() => setEditing(null)}
                  >
                    Cancel
                  </Button>
                  <Button disabled={busy}>
                    <Check size={15} />
                    Save assignment
                  </Button>
                </div>
              </>
            )}
          </form>
        </Modal>
      )}
      {publish && version && (
        <Modal
          title="Publish timetable"
          description="Publication validates every class and shared resource."
          onClose={() => setPublish(false)}
        >
          <form
            onSubmit={async (e) => {
              e.preventDefault();
              const date = String(new FormData(e.currentTarget).get("date"));
              if (
                await run({
                  type: "publish",
                  versionId: version.id,
                  effectiveDate: date,
                })
              )
                setPublish(false);
            }}
          >
            <label>
              Effective date
              <input
                type="date"
                name="date"
                min={localDate(new Date(), data.settings.timezone)}
                max={data.settings.end}
                defaultValue={localDate(new Date(), data.settings.timezone)}
                required
              />
            </label>
            <div className="info-box">
              Historical classes stay unchanged. Resolve pending offers and
              confirmed substitutions before replacing future classes.
            </div>
            <div className="modal-actions">
              <Button
                variant="outline"
                type="button"
                onClick={() => setPublish(false)}
              >
                Keep reviewing
              </Button>
              <Button disabled={busy}>Publish timetable</Button>
            </div>
          </form>
        </Modal>
      )}
    </>
  );
}
function weekdayToday(data: AppData) {
  return new Date(
    `${localDate(new Date(), data.settings.timezone)}T12:00Z`,
  ).getUTCDay();
}
