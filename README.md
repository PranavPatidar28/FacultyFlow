# FacultyFlow

A Next.js college workspace for faculty allocation, weekly timetables, and acceptance-based absence coverage. Built with Neon Postgres, Neon managed Auth, Drizzle, Vercel Workflow, and a separate Python OR-Tools solver.

## Run the local demo

Node.js 22+ and Python 3.12–3.14 are recommended. The checked-in lockfile pins the tested packages.

```powershell
npm ci
npm run demo:setup
```

The setup script creates `.env.local` with demo mode, the local solver URL, and a cryptographically generated shared secret without printing it. It refuses to overwrite an existing environment file.

```powershell
python -m venv solver/.venv
solver/.venv/Scripts/python -m pip install -r solver/requirements.txt
powershell -File scripts/solver-dev.ps1
```

In another terminal, run `npm run dev` and open [localhost:3000](http://localhost:3000). Use **View as** to explore admin, coordinator, and faculty workflows. Demo data is synthetic and isolated by an HTTP-only browser cookie. It lives in process memory and resets on restart; demo mode is for local review, not durable hosting.

## Configure Neon and Vercel

1. Sign in with `npx neon login` and `npx vercel login`. The connected Vercel project created for this workspace is `facultyflow` (`prj_Q2047u3BWMHHqd6ELHPywdkNLcWT`). Its existing deployment protection must be preserved.
2. Provision Neon through the Vercel integration where available. Otherwise create a Neon project, link it, and create an isolated development branch. Use a pooled `DATABASE_URL` for application traffic. Do not point development or automated tests at production.
3. Enable managed Neon Auth. Set `NEON_AUTH_BASE_URL` and a cryptographically generated `NEON_AUTH_COOKIE_SECRET` of at least 32 characters. Configure verified email sign-in and email OTP; add the preview and production origins to Auth's trusted domains. Production authentication email requires custom SMTP.
4. Copy `.env.example` to `.env.local` for a new authenticated environment. Set `DEMO_MODE=false`, `BOOTSTRAP_ADMIN_EMAIL`, and `BOOTSTRAP_ADMIN_NAME`. With the Vercel project linked and required environment keys verified, run `npm run db:migrate` and `npm run db:seed` against the intended new branch. Seed refuses to overwrite an existing campus. `SEED_DEMO=true` is only for a dedicated synthetic-data branch.
5. Deploy the `solver/` directory as a separate Vercel Python project. Set its `SOLVER_SECRET`, preserve platform deployment protection, and configure server-to-server protection bypass if required by the team's settings. No browser calls the solver directly. Test the deployed OR-Tools bundle and invocation before wiring production.
6. Set the web project's `SOLVER_URL` to the solver's `/api/solve` endpoint and the same `SOLVER_SECRET`. The solver uses a 120-second budget; both Python and the generation step need a deployment execution limit above that budget. Verify limits on the selected Vercel plan. For protected deployments, authorize the intended web environment in the solver project's Vercel Trusted Sources. The web service forwards its short-lived Vercel OIDC token automatically. `SOLVER_PROTECTION_BYPASS` remains an optional fallback.
7. Deploy a preview using an isolated Neon branch. Verify sign-up, verification, sign-in/out, invitations, generation, publication, absence, and acceptance before promoting a production build with production-only credentials.

Sign up using the bootstrap administrator's verified email. In **Settings → Members & access**, invite faculty and coordinators by email and assign departments and faculty profiles. The first verified login binds the invitation to the identity's stable ID; clients cannot grant themselves roles.

## Workflows

- **Academics:** departments → subjects and sections → rooms → weekly teaching requirements. A requirement describes a subject–section lecture or lab component, session count, consecutive-period duration, and optional fixed teacher.
- **Faculty directory:** approve subject qualifications and configure target, daily, weekly, and consecutive teaching limits. CSV import provides a validation preview, downloadable headers, and all-or-nothing reference checks. CSV export escapes spreadsheet formulas.
- **Availability:** recurring unavailable periods are mandatory; preferred slots guide generation. Existing published commitments require dated absence requests.
- **Timetable:** generate an immutable-input job, review its draft and diagnostics, edit and lock assignments, compare versions, and publish with an effective date. Changing a component's teacher updates all its sessions. Published views use dated occurrences so accepted substitutions appear in the relevant week.
- **Substitutions:** approve an absence, review eligible suggestions, and send a time-limited offer. Faculty accept or decline from Inbox. Management may withdraw a pending offer or reopen future confirmed cover. No qualified match leaves the class explicitly uncovered.

One component keeps one teacher for the semester. Hard constraints are never relaxed. The optimizer prioritizes squared normalized workload deviation, faculty gaps, preferred hours, and subject distribution, in that order. A fast constraint-checked incumbent warms CP-SAT; bounded optimization may return `FEASIBLE` rather than `OPTIMAL`. `UNKNOWN` means no solution was established within the budget, not proven infeasibility. Infeasibility diagnostics include preflight qualification/room failures; the current solver does not compute minimal unsatisfiable cores.

## Daily Change Desk

Use **Daily Change Desk** to report and confirm room closures, plan minimal same-day repairs for room disruptions or partial-day absences, collect affected faculty acceptance, and apply the complete change atomically. Full-day absences continue to use qualified substitution.

Published recurring timetables remain immutable. Dated agendas, closure warnings, consent, deadlines, escalations, and repair history are included. Production use is gated by `DAILY_CHANGES_ENABLED`; demo mode enables the feature for local review. See [implementation, verification, and restart instructions](docs/daily-change-desk.md) for current evidence and remaining release gates.

## Persistence and concurrency

Each domain collection has a dedicated Postgres table with a typed, versionable JSON payload. Calendar settings and a revision counter belong to the campus row. Writes lock that row for the transaction, apply server-side authorization and invariants, and persist changed records. This single-college design deliberately serializes administrative mutations.

Dated occupancy expands consecutive labs into individual periods. Database unique indexes independently enforce faculty, room, and section exclusivity, one coverage task per occurrence, one pending offer per task, unique membership emails/identities, and generation idempotency. An approved absence releases the absent faculty's occupancy while preserving section and room reservations. Acceptance rechecks qualifications, availability, absence, limits, offer expiry, and version in the same transaction.

Vercel Workflow orchestrates generation and offer expiry in authenticated deployments. Demo generation runs in the request for convenient local review. Expiry is also checked during reads and mutations, so delayed dispatch cannot permit late acceptance. Notifications are in-app and refresh every 15 seconds while the app is visible. Audit entries omit absence reasons and credentials.

The current single-college store reads the term's domain records into the service layer. The pilot benchmark measures the solver, not production database throughput. Larger workloads should replace these aggregate reads with indexed, date-scoped repositories before increasing the supported scale.

## Verification

```powershell
npm run lint
npm run typecheck
npm test
solver/.venv/Scripts/python -m unittest discover -s solver/tests -v
npx playwright install chromium
# Start both local services before the browser suite.
npm run test:e2e
solver/.venv/Scripts/python solver/benchmark.py
```

Stop `next dev` before `npm run build` so the processes do not share generated output. Workflow routes under `src/app/.well-known/` are generated and ignored; do not hand-edit them.

Tests cover hard timetable constraints, permissions, offer state transitions, stale revisions, concurrent offers, responsive navigation, actual solver generation and publication, invalid CSV previews, and verification-code delivery failure/resend. The protected Vercel Preview additionally passes Managed Auth browser checks, deployed Python generation, hosted durable repair workflows, faculty consent, concurrent application, substitution acceptance/expiry, and Neon occupancy checks against an isolated branch. User-authorized real email delivery and OTP verification also passed with Neon's shared development sender. Custom production SMTP remains unconfigured. See the Daily Change Desk report for precise limits and current Preview URLs.

## Release boundaries

- One academic term per workspace; calendar configuration freezes after first publication. Multiple terms and term rollover are not implemented.
- Shared teaching, combined electives, rotating weeks, student accounts, attendance, payroll, multi-college tenancy, and external messaging are outside this release.
- Scheduling and coverage are deterministic application logic and constraint optimization; no LLM key is required.
- Do not enable `DEMO_MODE` on a real-data deployment. Use separate Neon branches and credentials for development, preview, and production.
- Dependency overrides patch transitive Better Auth, Undici, and Zod issues. Remaining low/moderate upstream advisories are recorded in the verification report; review them before an institutional production rollout.
