"use client";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useCallback, useEffect, useRef, useState } from "react";
import {
  ArrowRight,
  Bell,
  CalendarDays,
  Check,
  ChevronRight,
  CircleHelp,
  Clock3,
  GraduationCap,
  LayoutDashboard,
  Layers,
  LogOut,
  Menu,
  Search,
  Settings2,
  ShieldCheck,
  Sparkles,
  Users,
  X,
  Repeat2,
  BookOpen,
  SlidersHorizontal,
} from "lucide-react";
import type { AppData } from "@/lib/types";
import { DAYS, localDate, weekday } from "@/lib/time";
import { Button } from "./ui/button";
import { DashboardBanner } from "./dashboard-banner";
import dynamic from "next/dynamic";
import { Avatar, Badge, Empty, Modal, type RunAction } from "./ui/workspace-ui";
import { ViewSkeleton } from "./ui/view-skeleton";
const GenerationDialog = dynamic(() =>
  import("./generation-dialog").then((m) => m.GenerationDialog),
);
import { ScheduleChangeNotice } from "./views/repair-review";
import { WorkspaceView, preloadView } from "./workspace-views";
const nav = [
  { id: "dashboard", name: "Overview", icon: LayoutDashboard },
  { id: "timetable", name: "Timetable", icon: CalendarDays },
  { id: "changes", name: "Daily Change Desk", icon: Repeat2 },
  { id: "faculty", name: "Faculty directory", icon: Users },
  { id: "academics", name: "Academics", icon: BookOpen },
  { id: "availability", name: "My availability", icon: SlidersHorizontal },
  { id: "inbox", name: "Inbox", icon: Bell },
];
const titles: Record<string, string> = {
  changes: "Daily Change Desk",
  dashboard: "Campus overview",
  timetable: "Timetable",
  substitutions: "Substitutions",
  faculty: "Faculty directory",
  academics: "Academic planning",
  availability: "My availability",
  inbox: "Your inbox",
  settings: "Campus settings",
};
export function Workspace({ view }: { view: string }) {
  const router = useRouter();
  const [data, setData] = useState<AppData | null>(null),
    [error, setError] = useState(""),
    [toast, setToast] = useState(""),
    [busy, setBusy] = useState(false),
    [menu, setMenu] = useState(false),
    [generate, setGenerate] = useState(false),
    [help, setHelp] = useState(false),
    [search, setSearch] = useState("");
  const request = useRef<{
    controller: AbortController;
    promise: Promise<void>;
  } | null>(null);
  const reload = useCallback(
    (fresh = false): Promise<void> => {
      if (request.current && !fresh) return request.current.promise;
      request.current?.controller.abort();
      const controller = new AbortController();
      const promise = (async () => {
        try {
          const response = await fetch("/api/state", {
            cache: "no-store",
            signal: controller.signal,
          });
          const body = await response.json();
          if (controller.signal.aborted) return;
          if (response.status === 401) {
            router.replace("/login");
            return;
          }
          if (!response.ok)
            throw new Error(body.error || "Could not load workspace");
          setData((previous) =>
            !previous || body.revision >= previous.revision ? body : previous,
          );
        } catch (error) {
          if (!controller.signal.aborted) throw error;
        } finally {
          if (request.current?.controller === controller)
            request.current = null;
        }
      })();
      request.current = { controller, promise };
      return promise;
    },
    [router],
  );
  useEffect(() => {
    const refresh = () => {
      if (document.visibilityState === "visible")
        reload().catch((e) => setError(e.message));
    };
    refresh();
    const id = setInterval(refresh, 15000);
    document.addEventListener("visibilitychange", refresh);
    return () => {
      clearInterval(id);
      document.removeEventListener("visibilitychange", refresh);
      request.current?.controller.abort();
      request.current = null;
    };
  }, [reload]);
  useEffect(() => {
    if (!toast) return;
    const id = setTimeout(() => setToast(""), 4500);
    return () => clearTimeout(id);
  }, [toast]);
  useEffect(() => {
    if (!menu) return;
    const active = document.activeElement as HTMLElement | null;
    const sidebar = document.getElementById("workspace-navigation");
    const controls = () => [
      ...(sidebar?.querySelectorAll<HTMLElement>(
        "a[href], button:not(:disabled), select",
      ) || []),
    ];
    controls()[0]?.focus();
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    const handleKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") setMenu(false);
      if (event.key !== "Tab") return;
      const first = controls()[0],
        last = controls().at(-1);
      if (event.shiftKey && document.activeElement === first) {
        event.preventDefault();
        last?.focus();
      } else if (!event.shiftKey && document.activeElement === last) {
        event.preventDefault();
        first?.focus();
      }
    };
    document.addEventListener("keydown", handleKey);
    return () => {
      document.removeEventListener("keydown", handleKey);
      document.body.style.overflow = previousOverflow;
      active?.focus();
    };
  }, [menu]);
  const run: RunAction = async (action) => {
    if (!data) return null;
    setBusy(true);
    setError("");
    try {
      const response = await fetch("/api/actions", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action, revision: data.revision }),
      });
      const result = await response.json();
      if (!response.ok) throw new Error(result.error);
      await reload(true);
      setToast(
        action.type === "generate"
          ? "Timetable generation started"
          : "Workspace updated",
      );
      return result;
    } catch (e) {
      setError(e instanceof Error ? e.message : "Operation failed");
      await reload(true).catch(() => {});
      return null;
    } finally {
      setBusy(false);
    }
  };
  const isFaculty = data?.viewer.member.role === "faculty";
  const visibleNav = nav
    .filter((n) => !isFaculty || !["changes", "academics"].includes(n.id))
    .filter((n) => n.id !== "availability" || data?.viewer.member.facultyId);
  const counts = {
    uncovered: data?.coverage.filter((c) => c.status !== "covered").length || 0,
    unread: data?.notifications.filter((n) => !n.read).length || 0,
  };
  async function switchMember(id: string) {
    await fetch("/api/demo", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ memberId: id }),
    });
    // A demo identity change starts a fresh client workspace and clears route caches.
    // eslint-disable-next-line @next/next/no-location-assign-relative-destination -- Reset client state at an identity boundary.
    window.location.href = "/";
  }
  if (!data)
    return (
      <div className="boot-screen">
        <span className="brand-mark">
          <Layers />
        </span>
        <h2>FacultyFlow</h2>
        {error ? (
          <>
            <p role="alert">{error}</p>
            <Link href="/login">Go to sign in</Link>
            <Button
              onClick={() => {
                setError("");
                reload().catch((e) => setError(e.message));
              }}
            >
              Try again
            </Button>
          </>
        ) : (
          <>
            <ViewSkeleton />
          </>
        )}
      </div>
    );
  const m = data.viewer.member;
  return (
    <div className="app-shell" aria-busy={busy}>
      <a href="#main-content" className="skip-link">
        Skip to content
      </a>
      <aside
        id="workspace-navigation"
        aria-label="Workspace navigation"
        className={`sidebar ${menu ? "sidebar-open" : ""}`}
      >
        <Link className="brand" href="/">
          <span className="brand-mark">
            <Layers size={23} />
          </span>
          Faculty<span>Flow</span>
        </Link>
        <div className="campus-switch">
          <span className="campus-icon">
            <GraduationCap size={19} />
          </span>
          <div>
            <strong>{data.settings.name}</strong>
            <span>College workspace</span>
          </div>
        </div>
        <nav aria-label="Main navigation">
          {visibleNav.map((n) => (
            <Link
              key={n.id}
              onMouseEnter={() => {
                void preloadView(n.id).catch(() => {});
              }}
              onFocus={() => {
                void preloadView(n.id).catch(() => {});
              }}
              aria-current={view === n.id ? "page" : undefined}
              href={n.id === "dashboard" ? "/" : `/${n.id}`}
              className={`nav-item ${view === n.id ? "active" : ""}`}
              onClick={() => setMenu(false)}
            >
              <n.icon size={18} />
              {n.name}
              {n.id === "changes" && counts.uncovered > 0 ? (
                <span className="nav-count">{counts.uncovered}</span>
              ) : n.id === "inbox" && counts.unread > 0 ? (
                <span className="unread-dot" />
              ) : null}
            </Link>
          ))}
        </nav>
        <div className="sidebar-bottom">
          <Link
            href="/settings"
            onMouseEnter={() => {
              void preloadView("settings").catch(() => {});
            }}
            onFocus={() => {
              void preloadView("settings").catch(() => {});
            }}
            onClick={() => setMenu(false)}
            className={`nav-item ${view === "settings" ? "active" : ""}`}
          >
            <Settings2 size={18} />
            Settings
          </Link>
          <button className="nav-item" onClick={() => setHelp(true)}>
            <CircleHelp size={18} />
            Help
          </button>
          <div className="user-profile">
            <Avatar faculty={m} />
            <div>
              <strong>{m.name}</strong>
              <span>
                {m.role === "admin"
                  ? "Campus administrator"
                  : m.role === "coordinator"
                    ? "Department coordinator"
                    : "Faculty member"}
              </span>
            </div>
            {!data.viewer.demo && (
              <button
                className="text-button"
                aria-label="Sign out"
                onClick={async () => {
                  const { createAuthClient } =
                    await import("@neondatabase/auth/next");
                  await createAuthClient().signOut();
                  router.replace("/login");
                  router.refresh();
                }}
              >
                <LogOut size={16} />
              </button>
            )}
          </div>
        </div>
      </aside>
      {menu && (
        <button
          className="sidebar-backdrop"
          aria-label="Close navigation"
          onClick={() => setMenu(false)}
        />
      )}
      <div className="main-shell">
        <header className="topbar">
          <Button
            size="icon"
            variant="ghost"
            className="mobile-menu"
            aria-label="Open navigation"
            aria-expanded={menu}
            aria-controls="workspace-navigation"
            onClick={() => setMenu(true)}
          >
            <Menu size={20} />
          </Button>
          <div className="breadcrumbs">
            Workspace <ChevronRight size={13} />
            <strong>{titles[view]}</strong>
          </div>
          <div className="top-actions">
            <div className="global-search">
              <Search size={16} />
              <input
                aria-label="Search faculty"
                placeholder="Find a faculty member…"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
              />
              <kbd>⌕</kbd>
              {search && (
                <div className="search-results">
                  {data.faculty
                    .filter((f) =>
                      f.name.toLowerCase().includes(search.toLowerCase()),
                    )
                    .slice(0, 5)
                    .map((f) => (
                      <Link
                        href={`/faculty?q=${encodeURIComponent(f.name)}`}
                        key={f.id}
                        onClick={() => setSearch("")}
                      >
                        <Avatar faculty={f} />
                        <span>{f.name}</span>
                        <ArrowRight size={14} />
                      </Link>
                    ))}
                </div>
              )}
            </div>
            <span className="top-divider" />
            <Link
              href="/inbox"
              className="notification-button"
              aria-label={`${counts.unread} unread notifications`}
            >
              <Bell size={19} />
              {counts.unread > 0 && <i />}
            </Link>
            <Avatar faculty={m} size="avatar-small" />
          </div>
        </header>
        <main id="main-content" className="page-content">
          {data.viewer.demo && (
            <div className="demo-bar">
              <span>
                <span className="live-dot" /> Demo{" "}
                <span className="demo-note">Changes reset on restart.</span>
              </span>
              <label>
                View as
                <select
                  aria-label="Demo role"
                  value={m.id}
                  onChange={(e) => switchMember(e.target.value)}
                >
                  {data.members.length > 1 ? (
                    data.members.map((member) => (
                      <option key={member.id} value={member.id}>
                        {member.name} · {member.role}
                      </option>
                    ))
                  ) : (
                    <>
                      <option value={m.id}>
                        {m.name} · {m.role}
                      </option>
                      <option value="admin">Alex Morgan · admin</option>
                      <option value="coordinator">
                        Dr. Priya Nair · coordinator
                      </option>
                      {data.faculty.map((f) => (
                        <option key={f.id} value={`m-${f.id}`}>
                          {f.name} · faculty
                        </option>
                      ))}
                    </>
                  )}
                </select>
              </label>
            </div>
          )}
          <div className="page-heading">
            <div>
              <div className="eyebrow">{data.settings.term}</div>
              <h1>
                {titles[view]}
                <span className="heading-dot">.</span>
              </h1>
            </div>
            <div className="heading-actions">
              {view === "dashboard" ? (
                <>
                  <span className="today-pill">
                    <CalendarDays size={15} />
                    {new Intl.DateTimeFormat("en-IN", {
                      timeZone: data.settings.timezone,
                      day: "numeric",
                      month: "short",
                      year: "numeric",
                    }).format(new Date())}
                  </span>
                  {!isFaculty && (
                    <Button onClick={() => setGenerate(true)}>
                      <Sparkles size={16} />
                      Generate timetable
                    </Button>
                  )}
                </>
              ) : view === "timetable" && !isFaculty ? (
                <Button onClick={() => setGenerate(true)}>
                  <Sparkles size={16} />
                  Generate timetable
                </Button>
              ) : null}
            </div>
          </div>
          {error && (
            <div role="alert" className="error-box page-error">
              <span>{error}</span>
              <button aria-label="Dismiss error" onClick={() => setError("")}>
                <X size={16} />
              </button>
            </div>
          )}
          {view === "dashboard" ? (
            <>
              <ScheduleChangeNotice data={data} />
              <Dashboard data={data} />
            </>
          ) : (
            <WorkspaceView
              key={view}
              view={view}
              data={data}
              run={run}
              busy={busy}
            />
          )}
          <footer className="page-footer">
            <span>
              <span className="live-dot" />{" "}
              {data.viewer.demo ? "Demo workspace" : "Campus workspace"}
            </span>
            <span>FacultyFlow</span>
          </footer>
        </main>
      </div>
      {toast && (
        <div role="status" className="toast">
          <Check size={17} />
          {toast}
        </div>
      )}
      {busy && <div className="progress-line" />}
      {generate && (
        <GenerationDialog
          data={data}
          busy={busy}
          run={run}
          onClose={() => setGenerate(false)}
          onGenerated={() => {
            setGenerate(false);
            router.push("/timetable");
          }}
        />
      )}
      {help && (
        <Modal title="Getting started" onClose={() => setHelp(false)}>
          <ol className="help-steps">
            <li>
              <strong>Set up your campus</strong>
              <p>
                Add departments, subjects, sections, rooms, and teaching periods
                in Academics and Settings.
              </p>
            </li>
            <li>
              <strong>Add faculty and members</strong>
              <p>
                Add faculty with approved subject qualifications and workload
                limits. Invite members from Settings.
              </p>
            </li>
            <li>
              <strong>Generate and review</strong>
              <p>
                Define weekly teaching requirements, generate a draft, edit or
                lock assignments, and compare versions.
              </p>
            </li>
            <li>
              <strong>Publish the timetable</strong>
              <p>
                An admin publishes a validated timetable from its effective
                date.
              </p>
            </li>
            <li>
              <strong>Keep classes covered</strong>
              <p>
                Approve absences, review qualified suggestions, and send an
                offer. Cover is confirmed after acceptance.
              </p>
            </li>
          </ol>
          <div className="info-box">
            Offers appear in the faculty inbox. Keep the app open to receive
            refreshed updates.
          </div>
        </Modal>
      )}
    </div>
  );
}
function Dashboard({ data }: { data: AppData }) {
  const today = localDate(new Date(), data.settings.timezone);
  const version = data.versions.find((v) => v.status === "published");
  const m = data.viewer.member;
  const classes = data.occurrences
    .filter(
      (o) =>
        o.date === today &&
        (m.role !== "faculty" || o.facultyId === m.facultyId),
    )
    .sort((a, b) => a.period - b.period);
  const uncovered = data.coverage.filter(
      (c) => c.status === "uncovered",
    ).length,
    offered = data.offers.filter((o) => o.status === "pending").length;
  const loads = data.faculty.map((f) => ({
    f,
    load:
      version?.entries
        .filter((e) => e.facultyId === f.id)
        .reduce((s, e) => s + e.duration, 0) || 0,
  }));
  const total = version?.entries.reduce((s, e) => s + e.duration, 0) || 0;
  const metrics = [
    {
      label: "Faculty members",
      value: data.faculty.length,
      icon: Users,
      tone: "violet",
    },
    {
      label: "Weekly periods",
      value: total,
      icon: CalendarDays,
      tone: "blue",
    },
    {
      label: "Needs cover",
      value: uncovered,
      icon: Repeat2,
      tone: "amber",
    },
    {
      label: "Awaiting acceptance",
      value: offered,
      icon: Clock3,
      tone: "emerald",
    },
  ];
  return (
    <>
      <DashboardBanner />
      <section className="metrics-grid">
        {metrics.map((metric) => (
          <div className="metric-card" key={metric.label}>
            <div className="metric-top">
              <span>{metric.label}</span>
              <span className={`metric-icon tone-${metric.tone}`}>
                <metric.icon size={18} />
              </span>
            </div>
            <strong>{metric.value.toString()}</strong>
          </div>
        ))}
      </section>
      <div className="dashboard-columns">
        <section className="panel today-panel">
          <div className="panel-heading">
            <div>
              <h2>
                Today’s classes{" "}
                <span className="counter">{classes.length}</span>
              </h2>
              <p>
                {DAYS[weekday(today)]},{" "}
                {new Intl.DateTimeFormat("en-IN", {
                  day: "numeric",
                  month: "long",
                }).format(new Date(`${today}T12:00Z`))}
              </p>
            </div>
            <Link className="inline-link" href="/timetable">
              View timetable <ArrowRight size={14} />
            </Link>
          </div>
          {classes.length ? (
            <div className="today-list">
              {classes.slice(0, 5).map((o) => {
                const req = data.requirements.find(
                  (r) => r.id === o.requirementId,
                )!;
                const subject = data.subjects.find(
                  (s) => s.id === req.subjectId,
                );
                const f = data.faculty.find((f) => f.id === o.facultyId)!;
                const cover = data.coverage.find(
                  (c) => c.occurrenceId === o.id && c.status !== "covered",
                );
                return (
                  <div className="today-row" key={o.id}>
                    <div className="class-time">
                      <strong>
                        {
                          data.settings.periods.find((p) => p.id === o.period)
                            ?.start
                        }
                      </strong>
                      <span>
                        {
                          data.settings.periods.find(
                            (p) => p.id === o.period + o.duration - 1,
                          )?.end
                        }
                      </span>
                    </div>
                    <span
                      className={`class-line tone-${subject?.color || "violet"}`}
                    />
                    <div className="class-detail">
                      <strong>{subject?.name}</strong>
                      <span>
                        {data.sections.find((s) => s.id === o.sectionId)?.name}{" "}
                        <i>·</i>{" "}
                        {data.rooms.find((r) => r.id === o.roomId)?.name}
                      </span>
                    </div>
                    <span className="faculty-tag">
                      <Avatar faculty={f} size="avatar-tiny" />
                      {f.name.replace("Dr. ", "").split(" ")[0]}
                    </span>
                    {cover && <Badge tone="amber">Needs cover</Badge>}
                  </div>
                );
              })}
            </div>
          ) : (
            <Empty
              title="No classes today"
              body={
                version
                  ? ""
                  : "Publish your first timetable to see today’s classes here."
              }
            />
          )}
        </section>
        <section className="panel attention-panel">
          <div className="panel-heading">
            <div>
              <h2>Needs your attention</h2>
            </div>
            <span className="attention-dot" />
          </div>
          {uncovered > 0 && (
            <Link href="/changes" className="attention-item">
              <span className="icon-tile tone-amber">
                <Repeat2 size={19} />
              </span>
              <div>
                <strong>
                  {uncovered} {uncovered === 1 ? "class needs" : "classes need"}{" "}
                  a substitute
                </strong>
                <p>Qualified suggestions are ready to review.</p>
              </div>
              <ChevronRight size={17} />
            </Link>
          )}
          {data.absences.filter((a) => a.status === "pending").length > 0 && (
            <Link href="/changes" className="attention-item">
              <span className="icon-tile tone-blue">
                <CalendarDays size={19} />
              </span>
              <div>
                <strong>Absence requests</strong>
                <p>Review requests and plan coverage.</p>
              </div>
              <ChevronRight size={17} />
            </Link>
          )}
          {offered > 0 && (
            <Link href="/inbox" className="attention-item">
              <span className="icon-tile tone-violet">
                <Clock3 size={19} />
              </span>
              <div>
                <strong>{offered} pending offers</strong>
                <p>Waiting for faculty acceptance.</p>
              </div>
              <ChevronRight size={17} />
            </Link>
          )}
          {!uncovered &&
            !offered &&
            !data.absences.some((a) => a.status === "pending") && (
              <div className="all-clear">
                <span>
                  <Check size={24} />
                </span>
                <strong>You’re all caught up</strong>
              </div>
            )}
          <div className="acceptance-note">
            <ShieldCheck size={16} />
            <p>
              Every suggestion respects qualifications, availability, and
              teaching limits.
            </p>
          </div>
        </section>
      </div>
      <div className="dashboard-columns lower-columns">
        <section className="panel">
          <div className="panel-heading">
            <div>
              <h2>Faculty workload</h2>
              <p>Teaching periods against individual workload targets.</p>
            </div>
            <Link className="inline-link" href="/faculty">
              All faculty <ArrowRight size={14} />
            </Link>
          </div>
          <div className="workload-list">
            {loads.slice(0, 5).map(({ f, load }, i) => (
              <div className="workload-row" key={f.id}>
                <Avatar
                  faculty={f}
                  color={["violet", "blue", "rose", "amber", "emerald"][i]}
                />
                <div className="workload-name">
                  <strong>{f.name}</strong>
                  <span>
                    {
                      data.departments.find((d) => d.id === f.departmentId)
                        ?.code
                    }
                  </span>
                </div>
                <div className="workload-track">
                  <span
                    style={{
                      width: `${Math.min(100, (load / Math.max(1, f.target)) * 100)}%`,
                    }}
                  />
                </div>
                <span className="workload-value">
                  <strong>{load}</strong> / {f.target}
                </span>
              </div>
            ))}
          </div>
        </section>
      </div>
    </>
  );
}
