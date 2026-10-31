"use client";
import { useState } from "react";
import { useSearchParams } from "next/navigation";
import {
  ArrowDownToLine,
  ArrowUpFromLine,
  CalendarDays,
  Check,
  Download,
  Pencil,
  Plus,
  Search,
  Settings2,
  ShieldCheck,
  SlidersHorizontal,
} from "lucide-react";
import Papa from "papaparse";
import type { AppData, Faculty } from "@/lib/types";
import { recordSchemas, settingsSchema } from "@/lib/validation";
import { DAYS } from "@/lib/time";
import {
  Avatar,
  Badge,
  Empty,
  Modal,
  type RunAction,
} from "../ui/workspace-ui";
import { Button } from "../ui/button";
import { downloadCsv } from "../ui/download-csv";
import { AbsenceForm } from "./coverage";
type Collection = keyof typeof recordSchemas;
type RecordData = Record<string, unknown>;
const fields: Record<Collection, string[]> = {
  departments: ["name", "code", "color"],
  faculty: [
    "name",
    "email",
    "departmentId",
    "title",
    "subjects",
    "target",
    "maxWeekly",
    "maxDaily",
    "maxConsecutive",
  ],
  subjects: ["name", "code", "departmentId", "color"],
  sections: ["name", "departmentId", "size"],
  rooms: ["name", "type", "capacity"],
  requirements: [
    "subjectId",
    "sectionId",
    "kind",
    "sessions",
    "duration",
    "facultyId",
  ],
  members: ["name", "email", "role", "departmentId", "facultyId"],
};
const labels: Record<string, string> = {
  name: "Name",
  code: "Code",
  color: "Color",
  email: "Email",
  departmentId: "Department",
  title: "Designation",
  subjects: "Approved subjects",
  target: "Target periods / week",
  maxWeekly: "Maximum / week",
  maxDaily: "Maximum / day",
  maxConsecutive: "Maximum consecutive",
  size: "Students",
  type: "Room type",
  capacity: "Capacity",
  subjectId: "Subject",
  sectionId: "Section",
  kind: "Teaching component",
  sessions: "Sessions / week",
  duration: "Consecutive periods / session",
  facultyId: "Faculty",
  role: "Access role",
};
const numberFields = new Set([
  "target",
  "maxWeekly",
  "maxDaily",
  "maxConsecutive",
  "size",
  "capacity",
  "sessions",
  "duration",
]);
function options(field: string, data: AppData) {
  if (field === "departmentId") return data.departments;
  if (field === "facultyId") return data.faculty;
  if (field === "subjectId" || field === "subjects") return data.subjects;
  if (field === "sectionId") return data.sections;
  return (
    field === "color"
      ? ["violet", "blue", "emerald", "amber", "rose", "cyan"]
      : field === "type" || field === "kind"
        ? ["lecture", "lab"]
        : field === "role"
          ? ["admin", "coordinator", "faculty"]
          : []
  ).map((id) => ({ id, name: id[0].toUpperCase() + id.slice(1) }));
}
export function RecordEditor({
  collection,
  data,
  initial,
  run,
  busy,
  onClose,
}: {
  collection: Collection;
  data: AppData;
  initial?: RecordData;
  run: RunAction;
  busy: boolean;
  onClose: () => void;
}) {
  const [error, setError] = useState("");
  const defaults: RecordData = {
    id: crypto.randomUUID(),
    departmentId:
      data.viewer.member.role === "coordinator"
        ? data.viewer.member.departmentId
        : data.departments[0]?.id || "",
    title: "Assistant Professor",
    subjects: [],
    target: 12,
    maxWeekly: 20,
    maxDaily: 5,
    maxConsecutive: 3,
    unavailable: [],
    preferred: [],
    color: "violet",
    kind: "lecture",
    type: "lecture",
    sessions: 3,
    duration: 1,
    size: 40,
    capacity: 60,
    role: "faculty",
    ...initial,
  };
  return (
    <Modal
      title={`${initial ? "Edit" : "Add"} ${collection === "requirements" ? "teaching requirement" : collection === "members" ? "college member" : collection === "faculty" ? "faculty member" : collection.replace(/s$/, "")}`}
      description={
        collection === "members"
          ? "An invited, verified email can join with this role."
          : undefined
      }
      onClose={onClose}
    >
      <form
        onSubmit={async (e) => {
          e.preventDefault();
          setError("");
          const form = new FormData(e.currentTarget);
          const record = { ...defaults };
          for (const field of fields[collection]) {
            const value = form.get(field);
            record[field] =
              field === "subjects"
                ? form.getAll(field)
                : numberFields.has(field)
                  ? Number(value)
                  : value || undefined;
          }
          try {
            const parsed = recordSchemas[collection].parse(record);
            if (await run({ type: "upsert", collection, records: [parsed] }))
              onClose();
          } catch (err) {
            setError(err instanceof Error ? err.message : "Check the fields");
          }
        }}
      >
        <div className="form-grid">
          {fields[collection].map((field) => {
            const opts = options(field, data).filter(
              (option) =>
                field !== "departmentId" ||
                data.viewer.member.role !== "coordinator" ||
                option.id === data.viewer.member.departmentId,
            );
            const optional = field === "facultyId";
            return (
              <label
                key={field}
                className={field === "subjects" ? "full-width" : ""}
              >
                {labels[field]}
                {optional && (
                  <span className="muted">
                    Optional
                    {collection === "requirements"
                      ? " · auto-allocate if empty"
                      : ""}
                  </span>
                )}
                {opts.length ||
                [
                  "facultyId",
                  "departmentId",
                  "subjectId",
                  "sectionId",
                  "subjects",
                ].includes(field) ? (
                  <select
                    name={field}
                    multiple={field === "subjects"}
                    defaultValue={
                      field === "subjects"
                        ? (defaults[field] as string[])
                        : String(defaults[field] || "")
                    }
                    required={!optional && field !== "subjects"}
                  >
                    {optional && (
                      <option value="">
                        {collection === "requirements"
                          ? "Automatically allocate"
                          : "No faculty profile"}
                      </option>
                    )}
                    {!optional && field !== "subjects" && (
                      <option value="" disabled>
                        Choose {labels[field].toLowerCase()}
                      </option>
                    )}
                    {opts.map((option) => (
                      <option key={option.id} value={option.id}>
                        {option.name}
                      </option>
                    ))}
                  </select>
                ) : (
                  <input
                    type={
                      numberFields.has(field)
                        ? "number"
                        : field === "email"
                          ? "email"
                          : "text"
                    }
                    min={field === "target" ? 0 : 1}
                    max={numberFields.has(field) ? 500 : undefined}
                    name={field}
                    defaultValue={String(defaults[field] ?? "")}
                    required={!optional}
                  />
                )}
                {field === "subjects" && (
                  <small>
                    Hold Ctrl / Cmd to select multiple approved subjects.
                  </small>
                )}
              </label>
            );
          })}
        </div>
        {error && (
          <div role="alert" className="error-box">
            {error}
          </div>
        )}
        <div className="modal-actions">
          <Button variant="outline" type="button" onClick={onClose}>
            Cancel
          </Button>
          <Button disabled={busy}>
            <Check size={15} />
            {initial ? "Save changes" : "Add record"}
          </Button>
        </div>
      </form>
    </Modal>
  );
}
function ImportDialog({
  collection,
  data,
  run,
  busy,
  onClose,
}: {
  collection: Collection;
  data: AppData;
  run: RunAction;
  busy: boolean;
  onClose: () => void;
}) {
  const [rows, setRows] = useState<unknown[]>([]),
    [errors, setErrors] = useState<string[]>([]),
    [fileName, setFileName] = useState("");
  function read(file: File) {
    setFileName(file.name);
    Papa.parse<Record<string, string>>(file, {
      header: true,
      skipEmptyLines: "greedy",
      complete(result) {
        const valid: unknown[] = [];
        const issues = result.errors.map((e) => `CSV: ${e.message}`);
        for (const [i, row] of result.data.entries()) {
          const mapped: RecordData = {
            ...row,
            id: row.id || crypto.randomUUID(),
          };
          for (const key of numberFields)
            if (key in mapped) mapped[key] = Number(mapped[key]);
          for (const key of ["subjects", "unavailable", "preferred"])
            if (key in mapped)
              mapped[key] = String(mapped[key])
                .split(";")
                .map((v) => v.trim())
                .filter(Boolean);
          if (collection === "faculty") {
            mapped.unavailable ??= [];
            mapped.preferred ??= [];
          }
          if (!mapped.facultyId) delete mapped.facultyId;
          const parsed = recordSchemas[collection].safeParse(mapped);
          if (parsed.success) valid.push(parsed.data);
          else
            issues.push(
              `Row ${i + 2}: ${parsed.error.issues.map((e) => `${e.path.join(".")}: ${e.message}`).join("; ")}`,
            );
        }
        if (result.data.length > 500)
          issues.push("Import at most 500 rows at a time.");
        setRows(valid);
        setErrors(issues);
      },
    });
  }
  return (
    <Modal
      title={`Import ${collection}`}
      description="Preview and validate before anything is saved."
      onClose={onClose}
      wide
    >
      <div className="import-help">
        <p>
          Use existing record IDs for references. Separate subject IDs and
          availability slots with semicolons.
        </p>
        <Button
          variant="outline"
          size="sm"
          onClick={() => {
            const sample: Record<string, unknown> = Object.fromEntries(
              [
                "id",
                ...fields[collection],
                ...(collection === "faculty"
                  ? ["unavailable", "preferred"]
                  : []),
              ].map((key) => [
                key,
                key === "id"
                  ? ""
                  : key === "departmentId"
                    ? data.departments[0]?.id || ""
                    : key === "subjects"
                      ? data.subjects[0]?.id || ""
                      : "",
              ]),
            );
            downloadCsv(`facultyflow-${collection}-template.csv`, [sample]);
          }}
        >
          <Download size={14} />
          Download CSV template
        </Button>
      </div>
      <label className="file-drop">
        <ArrowUpFromLine size={24} />
        <strong>Choose a CSV file</strong>
        <span>Up to 500 records per import</span>
        <input
          type="file"
          accept=".csv,text/csv"
          aria-label="CSV file"
          onChange={(e) => e.target.files?.[0] && read(e.target.files[0])}
        />
      </label>
      {fileName && (
        <div className="import-preview">
          <strong>{fileName}</strong>
          <p>
            {rows.length} valid records · {errors.length} issues
          </p>
          {errors.length ? (
            <div role="alert" className="error-box">
              <ul>
                {errors.map((e, i) => (
                  <li key={i}>{e}</li>
                ))}
              </ul>
            </div>
          ) : (
            <div className="info-box">
              Validation passed. Reference checks will run when you import.
            </div>
          )}
          <pre>{JSON.stringify(rows.slice(0, 3), null, 2)}</pre>
        </div>
      )}
      <div className="modal-actions">
        <Button variant="outline" onClick={onClose}>
          Cancel
        </Button>
        <Button
          disabled={busy || !rows.length || errors.length > 0}
          onClick={async () => {
            if (await run({ type: "upsert", collection, records: rows }))
              onClose();
          }}
        >
          Import {rows.length} records
        </Button>
      </div>
    </Modal>
  );
}
export function FacultyView({
  data,
  run,
  busy,
}: {
  data: AppData;
  run: RunAction;
  busy: boolean;
}) {
  const urlQuery = useSearchParams().get("q") || "";
  const [search, setSearch] = useState({ source: urlQuery, value: urlQuery }),
    [department, setDepartment] = useState("all"),
    [edit, setEdit] = useState<RecordData | null | undefined>(undefined),
    [importing, setImporting] = useState(false);
  const query = search.source === urlQuery ? search.value : urlQuery;
  const setQuery = (value: string) => setSearch({ source: urlQuery, value });
  const list = data.faculty.filter(
    (f) =>
      (department === "all" || f.departmentId === department) &&
      `${f.name} ${f.email} ${f.title}`
        .toLowerCase()
        .includes(query.toLowerCase()),
  );
  const version = data.versions.find((v) => v.status === "published");
  const canEdit = (f?: Faculty) =>
    data.viewer.member.role === "admin" ||
    (data.viewer.member.role === "coordinator" &&
      (!f || f.departmentId === data.viewer.member.departmentId));
  return (
    <>
      <div className="section-actions">
        <div className="filter-group">
          <div className="search-input">
            <Search size={16} />
            <input
              placeholder="Search faculty…"
              aria-label="Search faculty directory"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
            />
          </div>
          <select
            aria-label="Filter department"
            value={department}
            onChange={(e) => setDepartment(e.target.value)}
          >
            <option value="all">All departments</option>
            {data.departments.map((d) => (
              <option key={d.id} value={d.id}>
                {d.name}
              </option>
            ))}
          </select>
        </div>
        <div className="row-actions">
          <Button
            variant="outline"
            onClick={() =>
              downloadCsv(
                "facultyflow-faculty.csv",
                list.map((f) => ({
                  ...f,
                  subjects: f.subjects.join(";"),
                  unavailable: f.unavailable.join(";"),
                  preferred: f.preferred.join(";"),
                })),
              )
            }
          >
            <ArrowDownToLine size={15} />
            Export
          </Button>
          {canEdit() && (
            <>
              <Button variant="outline" onClick={() => setImporting(true)}>
                <ArrowUpFromLine size={15} />
                Import
              </Button>
              <Button onClick={() => setEdit(null)}>
                <Plus size={16} />
                Add faculty
              </Button>
            </>
          )}
        </div>
      </div>
      <section className="panel">
        <div className="panel-heading">
          <div>
            <h2>
              Your faculty <span className="counter">{list.length}</span>
            </h2>
          </div>
          <Badge tone="emerald">
            <ShieldCheck size={12} />
            Approved qualifications
          </Badge>
        </div>
        {list.length ? (
          <div className="table-scroll">
            <table className="data-table faculty-table">
              <thead>
                <tr>
                  <th>FACULTY MEMBER</th>
                  <th>DEPARTMENT</th>
                  <th>APPROVED SUBJECTS</th>
                  <th>WEEKLY WORKLOAD</th>
                  <th>TEACHING LIMITS</th>
                  <th>
                    <span className="sr-only">Actions</span>
                  </th>
                </tr>
              </thead>
              <tbody>
                {list.map((f, i) => {
                  const load =
                    version?.entries
                      .filter((e) => e.facultyId === f.id)
                      .reduce((s, e) => s + e.duration, 0) || 0;
                  const dep = data.departments.find(
                    (d) => d.id === f.departmentId,
                  );
                  return (
                    <tr key={f.id}>
                      <td>
                        <div className="person-cell">
                          <Avatar
                            faculty={f}
                            color={
                              [
                                "violet",
                                "blue",
                                "rose",
                                "amber",
                                "emerald",
                                "cyan",
                              ][i % 6]
                            }
                          />
                          <div>
                            <strong>{f.name}</strong>
                            <small>{f.title}</small>
                            <small>{f.email}</small>
                          </div>
                        </div>
                      </td>
                      <td>
                        <Badge tone={dep?.color || "neutral"}>
                          {dep?.code}
                        </Badge>
                      </td>
                      <td>
                        <div className="subject-tags">
                          {f.subjects.map((id) => (
                            <Badge key={id}>
                              {data.subjects.find((s) => s.id === id)?.code ||
                                id}
                            </Badge>
                          ))}
                        </div>
                      </td>
                      <td>
                        <div className="load-cell">
                          <span>
                            <strong>{load}</strong> / {f.target} target
                          </span>
                          <div className="workload-track">
                            <span
                              style={{
                                width: `${Math.min(100, (load / Math.max(f.target, 1)) * 100)}%`,
                              }}
                            />
                          </div>
                        </div>
                      </td>
                      <td>
                        <span>{f.maxDaily} / day</span>
                        <small>
                          {f.maxWeekly} / week · {f.maxConsecutive} consecutive
                        </small>
                      </td>
                      <td>
                        {canEdit(f) && (
                          <Button
                            variant="ghost"
                            size="icon"
                            aria-label={`Edit ${f.name}`}
                            onClick={() => setEdit(f as unknown as RecordData)}
                          >
                            <Pencil size={15} />
                          </Button>
                        )}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        ) : (
          <Empty
            title="No faculty found"
            body="Add faculty or adjust your search to find a match."
          />
        )}
      </section>
      {edit !== undefined && (
        <RecordEditor
          collection="faculty"
          data={data}
          initial={edit || undefined}
          run={run}
          busy={busy}
          onClose={() => setEdit(undefined)}
        />
      )}
      {importing && (
        <ImportDialog
          collection="faculty"
          data={data}
          run={run}
          busy={busy}
          onClose={() => setImporting(false)}
        />
      )}
    </>
  );
}
export function AcademicsView({
  data,
  run,
  busy,
}: {
  data: AppData;
  run: RunAction;
  busy: boolean;
}) {
  const [tab, setTab] = useState<Collection>("requirements"),
    [edit, setEdit] = useState<RecordData | null | undefined>(undefined),
    [importing, setImporting] = useState(false);
  const tabs: Collection[] = [
    "requirements",
    "subjects",
    "sections",
    "rooms",
    "departments",
  ];
  const rows = data[tab] as unknown as RecordData[];
  const canEdit =
    data.viewer.member.role === "admin" ||
    (data.viewer.member.role === "coordinator" &&
      !["rooms", "departments"].includes(tab));
  function display(key: string, value: unknown) {
    if (key === "departmentId")
      return data.departments.find((d) => d.id === value)?.name;
    if (key === "subjectId")
      return data.subjects.find((d) => d.id === value)?.name;
    if (key === "sectionId")
      return data.sections.find((d) => d.id === value)?.name;
    if (key === "facultyId")
      return data.faculty.find((d) => d.id === value)?.name || "Auto-allocate";
    return String(value ?? "—");
  }
  return (
    <>
      <div className="section-actions">
        <div className="segmented-control">
          {tabs.map((t) => (
            <button
              key={t}
              className={tab === t ? "selected" : ""}
              onClick={() => setTab(t)}
            >
              {t === "requirements"
                ? "Teaching requirements"
                : t[0].toUpperCase() + t.slice(1)}
            </button>
          ))}
        </div>
        {canEdit && (
          <div className="row-actions">
            <Button variant="outline" onClick={() => setImporting(true)}>
              <ArrowUpFromLine size={15} />
              Import CSV
            </Button>
            <Button onClick={() => setEdit(null)}>
              <Plus size={15} />
              Add {tab === "requirements" ? "requirement" : "record"}
            </Button>
          </div>
        )}
      </div>
      <div className="info-box">
        <ShieldCheck size={17} />
        {tab === "requirements"
          ? "Define weekly sessions and lab lengths. Leave faculty empty to let the generator allocate a qualified teacher."
          : "Use these records as the source of truth for your campus timetable."}
      </div>
      <section className="panel">
        {rows.length ? (
          <div className="table-scroll">
            <table className="data-table">
              <thead>
                <tr>
                  {fields[tab].map((key) => (
                    <th key={key}>{labels[key]}</th>
                  ))}
                  <th>ID</th>
                  <th>
                    <span className="sr-only">Edit</span>
                  </th>
                </tr>
              </thead>
              <tbody>
                {rows.map((row) => (
                  <tr key={String(row.id)}>
                    {fields[tab].map((key) => (
                      <td key={key}>{display(key, row[key])}</td>
                    ))}
                    <td>
                      <code className="record-id">{String(row.id)}</code>
                    </td>
                    <td>
                      {canEdit && (
                        <Button
                          variant="ghost"
                          size="icon"
                          aria-label="Edit record"
                          onClick={() => setEdit(row)}
                        >
                          <Pencil size={15} />
                        </Button>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : (
          <Empty
            title={`Add your ${tab}`}
            body="Add records to use them in your timetable."
          />
        )}
      </section>
      {edit !== undefined && (
        <RecordEditor
          collection={tab}
          data={data}
          initial={edit || undefined}
          run={run}
          busy={busy}
          onClose={() => setEdit(undefined)}
        />
      )}
      {importing && (
        <ImportDialog
          collection={tab}
          data={data}
          run={run}
          busy={busy}
          onClose={() => setImporting(false)}
        />
      )}
    </>
  );
}
export function AvailabilityView({
  data,
  run,
  busy,
}: {
  data: AppData;
  run: RunAction;
  busy: boolean;
}) {
  const f = data.faculty.find((f) => f.id === data.viewer.member.facultyId);
  const [slots, setSlots] = useState<string[] | null>(null),
    [preferred, setPreferred] = useState<string[] | null>(null),
    [mode, setMode] = useState("unavailable"),
    [absence, setAbsence] = useState(false);
  if (!f)
    return (
      <Empty
        title="No linked faculty profile"
        body="Ask your administrator to link your account to a faculty record."
      />
    );
  const blocked = slots || f.unavailable,
    prefs = preferred || f.preferred;
  return (
    <>
      <div className="section-actions">
        <div className="segmented-control">
          <button
            className={mode === "unavailable" ? "selected" : ""}
            onClick={() => setMode("unavailable")}
          >
            Mark unavailable
          </button>
          <button
            className={mode === "preferred" ? "selected" : ""}
            onClick={() => setMode("preferred")}
          >
            Mark preferred hours
          </button>
        </div>
        <div className="row-actions">
          <Button variant="outline" onClick={() => setAbsence(true)}>
            <CalendarDays size={15} />
            Request absence
          </Button>
          <Button
            disabled={busy}
            onClick={() =>
              run({
                type: "availability",
                unavailable: blocked,
                preferred: prefs,
              })
            }
          >
            <Check size={15} />
            Save availability
          </Button>
        </div>
      </div>
      <div className="info-box">
        Click periods to mark recurring availability. Existing published classes
        require an absence request; preferences guide future generation.
      </div>
      <section className="panel availability-panel">
        <div className="panel-heading">
          <div>
            <h2>Weekly availability</h2>
            <p>
              Unavailable periods are mandatory. Preferred hours are a
              scheduling preference.
            </p>
          </div>
          <SlidersHorizontal size={20} />
        </div>
        <div className="table-scroll">
          <table className="availability-grid">
            <thead>
              <tr>
                <th>Time</th>
                {data.settings.days.map((d) => (
                  <th key={d}>{DAYS[d]}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {data.settings.periods
                .filter((p) => !p.break)
                .map((p) => (
                  <tr key={p.id}>
                    <th>
                      {p.start} – {p.end}
                    </th>
                    {data.settings.days.map((d) => {
                      const key = `${d}:${p.id}`,
                        unavailable = blocked.includes(key),
                        pref = prefs.includes(key);
                      return (
                        <td key={d}>
                          <button
                            aria-label={`${DAYS[d]} ${p.start}: ${unavailable ? "unavailable" : pref ? "preferred" : "available"}`}
                            aria-pressed={
                              mode === "unavailable" ? unavailable : pref
                            }
                            className={
                              unavailable
                                ? "availability-blocked"
                                : pref
                                  ? "availability-preferred"
                                  : ""
                            }
                            onClick={() => {
                              if (mode === "unavailable")
                                setSlots(
                                  unavailable
                                    ? blocked.filter((v) => v !== key)
                                    : [...blocked, key],
                                );
                              else
                                setPreferred(
                                  pref
                                    ? prefs.filter((v) => v !== key)
                                    : [...prefs, key],
                                );
                            }}
                          >
                            {unavailable
                              ? "Unavailable"
                              : pref
                                ? "Preferred"
                                : "Available"}
                          </button>
                        </td>
                      );
                    })}
                  </tr>
                ))}
            </tbody>
          </table>
        </div>
      </section>
      <section className="panel absence-history">
        <div className="panel-heading">
          <h2>My absence requests</h2>
        </div>
        {data.absences.filter((a) => a.facultyId === f.id).length ? (
          data.absences
            .filter((a) => a.facultyId === f.id)
            .map((a) => (
              <div className="simple-row" key={a.id}>
                <span>
                  {a.date} ·{" "}
                  {a.periods.length
                    ? `${a.periods.length} periods`
                    : "Full day"}
                </span>
                <Badge tone={a.status === "approved" ? "emerald" : "amber"}>
                  {a.status}
                </Badge>
              </div>
            ))
        ) : (
          <Empty
            title="No requests yet"
            body="Plan for a day away without leaving your classes behind."
          />
        )}
      </section>
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
export function SettingsView({
  data,
  run,
  busy,
}: {
  data: AppData;
  run: RunAction;
  busy: boolean;
}) {
  const [tab, setTab] = useState("campus"),
    [edit, setEdit] = useState<RecordData | null | undefined>(undefined),
    [error, setError] = useState(""),
    [periods, setPeriods] = useState(data.settings.periods);
  const admin = data.viewer.member.role === "admin",
    published = data.versions.some((v) => v.status === "published");
  return (
    <>
      <div className="segmented-control settings-tabs">
        {["campus", "members", "activity"].map((t) => (
          <button
            key={t}
            className={tab === t ? "selected" : ""}
            onClick={() => setTab(t)}
          >
            {t === "campus"
              ? "Campus & calendar"
              : t === "members"
                ? "Members & access"
                : "Activity log"}
          </button>
        ))}
      </div>
      {tab === "campus" ? (
        <section className="panel settings-panel">
          <div className="panel-heading">
            <div>
              <h2>Campus details</h2>
            </div>
            <Settings2 size={20} />
          </div>
          {published && (
            <div className="info-box">
              The calendar is frozen after publication to preserve dated
              classes. This release manages one academic term per workspace.
            </div>
          )}
          <form
            onSubmit={async (e) => {
              e.preventDefault();
              setError("");
              const form = new FormData(e.currentTarget);
              try {
                const settings = settingsSchema.parse({
                  name: form.get("name"),
                  term: form.get("term"),
                  timezone: form.get("timezone"),
                  start: form.get("start"),
                  end: form.get("end"),
                  days: form.getAll("days").map(Number),
                  holidays: String(form.get("holidays"))
                    .split(",")
                    .map((d) => d.trim())
                    .filter(Boolean),
                  periods,
                });
                await run({ type: "settings", settings });
              } catch (err) {
                setError(
                  err instanceof Error ? err.message : "Invalid calendar",
                );
              }
            }}
          >
            <fieldset disabled={!admin || published}>
              <div className="form-grid">
                <label>
                  Institution name
                  <input
                    name="name"
                    defaultValue={data.settings.name}
                    required
                  />
                </label>
                <label>
                  Academic term
                  <input
                    name="term"
                    defaultValue={data.settings.term}
                    required
                  />
                </label>
                <label>
                  Term starts
                  <input
                    type="date"
                    name="start"
                    defaultValue={data.settings.start}
                    required
                  />
                </label>
                <label>
                  Term ends
                  <input
                    type="date"
                    name="end"
                    defaultValue={data.settings.end}
                    required
                  />
                </label>
                <label>
                  Timezone
                  <input
                    name="timezone"
                    defaultValue={data.settings.timezone}
                    required
                  />
                </label>
                <label>
                  Holiday dates{" "}
                  <span className="muted">Comma-separated YYYY-MM-DD</span>
                  <input
                    name="holidays"
                    defaultValue={data.settings.holidays.join(", ")}
                  />
                </label>
              </div>
              <label>Working days</label>
              <div className="period-checkboxes">
                {DAYS.map((d, i) => (
                  <label key={d}>
                    <input
                      type="checkbox"
                      name="days"
                      value={i}
                      defaultChecked={data.settings.days.includes(i)}
                    />
                    {d.slice(0, 3)}
                  </label>
                ))}
              </div>
              <div className="period-editor">
                <h3>Teaching periods & breaks</h3>
                <p className="muted">
                  Arrange your day from first class to last. Labs can span
                  adjacent teaching periods.
                </p>
                {periods.map((period, index) => (
                  <div className="period-editor-row" key={period.id}>
                    <label>
                      Label
                      <input
                        aria-label={`Period ${index + 1} label`}
                        value={period.label}
                        required
                        onChange={(e) =>
                          setPeriods(
                            periods.map((p, i) =>
                              i === index ? { ...p, label: e.target.value } : p,
                            ),
                          )
                        }
                      />
                    </label>
                    <label>
                      Starts
                      <input
                        type="time"
                        aria-label={`Period ${index + 1} starts`}
                        value={period.start}
                        required
                        onChange={(e) =>
                          setPeriods(
                            periods.map((p, i) =>
                              i === index ? { ...p, start: e.target.value } : p,
                            ),
                          )
                        }
                      />
                    </label>
                    <label>
                      Ends
                      <input
                        type="time"
                        aria-label={`Period ${index + 1} ends`}
                        value={period.end}
                        required
                        onChange={(e) =>
                          setPeriods(
                            periods.map((p, i) =>
                              i === index ? { ...p, end: e.target.value } : p,
                            ),
                          )
                        }
                      />
                    </label>
                    <label className="checkbox-label">
                      <input
                        type="checkbox"
                        checked={period.break}
                        onChange={(e) =>
                          setPeriods(
                            periods.map((p, i) =>
                              i === index
                                ? { ...p, break: e.target.checked }
                                : p,
                            ),
                          )
                        }
                      />
                      Break
                    </label>
                    <Button
                      variant="ghost"
                      size="sm"
                      type="button"
                      disabled={periods.length === 1}
                      onClick={() =>
                        setPeriods(
                          periods
                            .filter((_, i) => i !== index)
                            .map((p, i) => ({ ...p, id: i })),
                        )
                      }
                    >
                      Remove
                    </Button>
                  </div>
                ))}
                <Button
                  variant="outline"
                  size="sm"
                  type="button"
                  disabled={periods.length >= 24}
                  onClick={() =>
                    setPeriods([
                      ...periods,
                      {
                        id: periods.length,
                        label: `Period ${periods.length + 1}`,
                        start: periods.at(-1)?.end || "09:00",
                        end: "16:00",
                        break: false,
                      },
                    ])
                  }
                >
                  <Plus size={14} />
                  Add period
                </Button>
              </div>
            </fieldset>
            {error && (
              <div role="alert" className="error-box">
                {error}
              </div>
            )}
            {admin && !published && (
              <div className="modal-actions">
                <Button disabled={busy}>Save calendar</Button>
              </div>
            )}
          </form>
        </section>
      ) : tab === "members" ? (
        <section className="panel">
          <div className="panel-heading">
            <div>
              <h2>Members & access</h2>
              <p>Only invited, verified accounts can enter this workspace.</p>
            </div>
            {admin && (
              <Button onClick={() => setEdit(null)}>
                <Plus size={15} />
                Invite member
              </Button>
            )}
          </div>
          {admin ? (
            <div className="table-scroll">
              <table className="data-table">
                <thead>
                  <tr>
                    <th>Member</th>
                    <th>Email</th>
                    <th>Role</th>
                    <th>Department</th>
                    <th>Faculty profile</th>
                    <th />
                  </tr>
                </thead>
                <tbody>
                  {data.members.map((m) => (
                    <tr key={m.id}>
                      <td>
                        <strong>{m.name}</strong>
                      </td>
                      <td>{m.email}</td>
                      <td>
                        <Badge tone={m.role === "admin" ? "violet" : "neutral"}>
                          {m.role}
                        </Badge>
                      </td>
                      <td>
                        {data.departments.find((d) => d.id === m.departmentId)
                          ?.name || "Campus"}
                      </td>
                      <td>
                        {data.faculty.find((f) => f.id === m.facultyId)?.name ||
                          "—"}
                      </td>
                      <td>
                        <Button
                          variant="ghost"
                          size="icon"
                          aria-label={`Edit access for ${m.name}`}
                          onClick={() => setEdit(m as unknown as RecordData)}
                        >
                          <Pencil size={15} />
                        </Button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          ) : (
            <Empty
              title="Managed by your administrator"
              body="Contact your campus admin for changes to access or roles."
            />
          )}
        </section>
      ) : (
        <section className="panel">
          <div className="panel-heading">
            <div>
              <h2>Activity log</h2>
              <p>Administrative actions without private absence details.</p>
            </div>
          </div>
          {admin && data.audit.length ? (
            <div className="table-scroll">
              <table className="data-table">
                <thead>
                  <tr>
                    <th>When</th>
                    <th>Member</th>
                    <th>Action</th>
                  </tr>
                </thead>
                <tbody>
                  {[...data.audit]
                    .reverse()
                    .slice(0, 100)
                    .map((a) => (
                      <tr key={a.id}>
                        <td>
                          {new Intl.DateTimeFormat("en-IN", {
                            timeZone: data.settings.timezone,
                            dateStyle: "medium",
                            timeStyle: "short",
                          }).format(new Date(a.createdAt))}
                        </td>
                        <td>
                          {data.members.find((m) => m.id === a.actorId)?.name ||
                            "System"}
                        </td>
                        <td>{a.action.replaceAll("-", " ")}</td>
                      </tr>
                    ))}
                </tbody>
              </table>
            </div>
          ) : (
            <Empty
              title={admin ? "No activity yet" : "Admin access required"}
              body={
                admin
                  ? "Your workspace changes will be recorded here."
                  : "The activity log is available to campus administrators."
              }
            />
          )}
        </section>
      )}
      {edit !== undefined && (
        <RecordEditor
          collection="members"
          data={data}
          initial={edit || undefined}
          run={run}
          busy={busy}
          onClose={() => setEdit(undefined)}
        />
      )}
    </>
  );
}
