# Daily Change Desk — implementation and handoff

Verified on **31 October 2026, Asia/Kolkata**. The implementation is saved in this workspace and deployed to a protected Vercel Preview. Production serves only a protected setup placeholder; the application has not been released there.

## What changed

- **Daily Change Desk** replaces the primary Substitutions navigation item and combines room disruptions, partial-day absences, repair proposals, existing coverage offers, and absence approvals. The existing `/substitutions` route remains compatible; the new primary route is `/changes`.
- Admins confirm room closures. Coordinators can report closures and repair their section-owned department. Cross-department repair scope requires an admin.
- The Python solver creates same-day plans with unchanged teachers, subjects, sections, durations, and occurrence IDs. It minimizes time changes, changed classes, displacement, and faculty gaps, in that order, within a 30-second budget.
- Started classes, pending substitution offers, confirmed cover, and classes outside the selected scope remain fixed. Other unresolved classes are explicitly identified in the proposal.
- Faculty whose teaching times change accept or decline the complete proposal in Inbox. Acceptance does not book anything. An authorized coordinator explicitly applies the entire plan after all required acceptance.
- Plans expire before the earliest affected old/new class start or 30 minutes after submission, whichever is earlier. Declines, expiry, stale inputs, withdrawal, and solver failures return decisions to management without automatically contacting another faculty member.
- Repairs update dated occurrences and resource occupancy atomically. Recurring timetable versions remain unchanged. Applied changes and closure warnings appear in desktop/mobile agendas and notifications.
- Full timetable publication cannot silently overwrite applied repairs or create bookings in confirmed closed rooms. Cancelling a closure does not reverse an applied repair.

## Persistence and correctness

Migration `0002_common_wraith.sql` adds closure, repair-request, repair-plan, and faculty-consent tables. It does not rewrite existing timetable data or occupancy. Unique indexes protect plan idempotency and one consent per faculty/plan.

The existing campus transaction lock serializes applications. All old claims are released before new claims are inserted; resource indexes independently reject clashes. Tests cover successful chain swaps and rollback of plan status, occurrences, and claims together on failure.

Source snapshots exclude notification counters, member sign-in binding, and other workflow metadata. Snapshot comparison normalizes JSON object key order because Postgres JSONB reorders keys. Changes to relevant bookings, availability, closures, approved absences, qualifications, or workload constraints require a fresh plan and fresh consent.

The solver never receives private absence reasons. Client payloads omit solver snapshots; faculty receive only their own consent records and authorized absence details.

## Verification evidence

| Check                            | Result                                                                                                                                                                                                 |
| -------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| TypeScript/domain/database tests | **47 passed**, including migration preservation, resource constraints, transaction rollback, JSONB round trips, role boundaries, acceptance, expiry, stale plans, retry safety, and publication guards |
| Python solver tests              | **17 passed**, including 10 new daily-repair scenarios and a two-teacher chain move                                                                                                                    |
| Chromium browser tests           | **9 passed** against the production build; all 3 Daily Change Desk scenarios were rechecked after the JSONB fix                                                                                        |
| Lint and TypeScript              | Passed without warnings/errors                                                                                                                                                                         |
| Next.js production build         | Passed; 21 registered Workflow steps and 3 workflows                                                                                                                                                   |
| Sparse pilot benchmark           | 150 faculty, 60 sections, 20 rooms, 60 classes: `OPTIMAL`, 0 time changes, 1 room/class change, **0.717 seconds**                                                                                      |
| Tightly packed pilot benchmark   | 150 faculty, 60 sections, 20 rooms, 114 classes: `FEASIBLE`, 1 time/class change, **17.579 seconds**; optimality not proven                                                                            |
| Independent solver verification  | Both benchmark outputs passed the TypeScript dated-assignment validator                                                                                                                                |

These are synthetic scenarios, not production latency guarantees. The benchmark records all 150 faculty and 60 sections but does not simulate every possible institutional constraint.

## Connected Neon preview

- Existing project: `FacultyFlow` (`fragrant-band-10895969`).
- Isolated schema-only preview branch: `daily-change-desk-preview-2026-10-31` (`br-winter-sound-b56vpowc`), with expiry set to **14 November 2026, 05:30 IST**.
- Dedicated database on that branch: `facultyflow_preview`. Existing production database/schema/data were not changed.
- Migrations and a synthetic seed were applied successfully. Managed Neon Auth was enabled on this preview database.
- Auth provisioning initially failed because the Neon service lacked database `CREATE`. That permission was granted only to `neon_service` on the dedicated preview database; no public grants or production permissions were changed.
- Browser sign-in, invited admin access, faculty permission rejection, a durable Workflow using the actual solver, faculty acceptance, transactional application, occupancy consistency, and sign-out all passed against Neon-backed records.

The initial checks used only `@facultyflow.invalid` fixture accounts and explicitly marked those isolated test identities verified in the preview Auth schema. Later, with the user's authorization, a real verification email was sent and the recipient-provided code was successfully verified through Neon Auth. This proves shared-development-sender delivery; custom production SMTP remains unconfigured. Synthetic SQL verification must never be used against real identities.

Preview credentials and test-account passwords are stored only in ignored `.local/` files and were not committed. The synthetic administrator password was rotated after the browser diagnostic described below; diagnostic fixture sessions were revoked. `.env.local` remains the synthetic demo configuration; `.neon` points to the isolated preview branch.

## Restart and recheck

For the local synthetic demo:

```powershell
npm run solver:dev
# In another terminal:
npm run dev
```

Open [localhost:3000](http://localhost:3000), then **Daily Change Desk**. Demo state resets after a process restart.

For the existing authenticated preview configuration, stop other Next.js processes before building:

```powershell
node scripts/with-env.mjs .local/neon-preview.env node_modules/next/dist/bin/next build
node scripts/with-env.mjs .local/neon-preview.env node_modules/next/dist/bin/next start --hostname 127.0.0.1 --port 3001
```

The ignored preview environment sets the local Workflow callback URL to port 3001. The Python solver still needs to be running. The authenticated integration check is available through `scripts/verify-auth-preview.mjs`; it intentionally refuses non-local URLs or a database other than `facultyflow_preview`. Its synthetic absence must be reset or another fixture prepared before repeating a successful application.

Benchmarks:

```powershell
solver/.venv/Scripts/python solver/repair_benchmark.py
npx tsx scripts/verify-repair-benchmark.ts
```

## Release gates still open

### Budget constraint

The user requires **zero paid services**. Keep Neon on its Free plan and do not enable a paid plan, usage-based upgrade, paid email provider, or domain purchase. Managed Neon Auth is already integrated and included in the Free plan. The current pilot uses Neon's shared development email sender, and real OTP delivery has passed. A production SMTP sender does not inherently require a paid service: an existing eligible Gmail account with an app password is a possible no-subscription option, subject to Gmail sending limits and account settings. Enter mail credentials directly in Neon; never paste them into chat or commit them. Production still requires sender verification and the remaining deployment checks. Free-tier capacity is bounded; quota exhaustion must be handled without an automatic paid upgrade.

References: [Neon pricing](https://neon.com/pricing), [Neon Auth production checklist](https://neon.com/docs/auth/production-checklist), [Google app passwords](https://support.google.com/accounts/answer/185833).

### Vercel progress — 31 October 2026

- CLI login verified as `pranavpatidar28` in `pranav-patidars-projects`.
- Protected Python solver Preview is ready at `https://facultyflow-solver-nqvdjwc8e-pranav-patidars-projects.vercel.app` (project `prj_sibXdabsM0WxjO59sib4Lhn6heNp`).
- Real hosted requests passed room-only repair, two-teacher chain repair, and recurring timetable generation, all `OPTIMAL` for small fixtures. Missing service credentials returned HTTP 401. Evidence: ignored `.local/cloud-solver-verification.json`.
- Vercel automatically assigned the solver's first deployment to Production; that credential-free deployment was removed. The explicitly targeted Preview remains.
- The web project's Preview environment now contains only isolated preview database/Auth credentials and the hosted solver URL. Local Workflow callback overrides were not uploaded.
- Web code now forwards short-lived Vercel OIDC identity tokens for protected solver calls. Type checking, lint, production build, and all 47 TypeScript tests passed after this change.
- User approved the initial protected, credential-free placeholder. It is deployed at `https://facultyflow-eight.vercel.app`; no real application was released to Production.
- The actual web **Preview** is ready at `https://facultyflow-c44vxza03-pranav-patidars-projects.vercel.app` (`dpl_8pACbuHRgRt1CPyGMKFiZkbUqqj6`). The hosted build passed with 21 steps and 3 workflows.
- Registered that exact HTTPS Preview hostname as a Neon Auth trusted domain only on the isolated preview branch after the first hosted login returned `Invalid origin`.
- Hosted API sign-in returned HTTP 200 with an authenticated user and session cookies after the hostname registration.
- Browser testing found a pre-hydration native form submission could put synthetic login credentials in the URL. The login form now uses POST and disables submission until hydration. The synthetic administrator password was immediately rotated and other sessions revoked. The replacement Preview is `https://facultyflow-kbk0ylrgr-pranav-patidars-projects.vercel.app`; its exact origin is also registered on the isolated Auth branch.
- The replacement hosted Preview passed authenticated health checks, anonymous access rejection, a no-JavaScript form submission guard, real browser sign-in, invited admin Neon access, Daily Change Desk navigation/mobile rendering, mobile navigation sign-out, and post-sign-out HTTP 401. Evidence: ignored `.local/hosted-smoke-verification.json` and `.local/hosted-change-desk-mobile.png`.
- User approved the precise Trusted Sources rule. The solver now trusts only web project `prj_Q2047u3BWMHHqd6ELHPywdkNLcWT` **Preview → solver Preview**; deployment protection remains enabled. No Production or Development cross-project pair was added.
- Hosted generation completed through Vercel Workflow and the protected solver, returning `FEASIBLE` and persisting a valid draft without changing the published timetable.
- Hosted room-only repair returned `OPTIMAL`, required no faculty consent, and applied atomically with matching normalized occupancy.
- Hosted partial-day absence repair returned `OPTIMAL`. Application before consent was rejected; faculty administration was rejected; acceptance preserved bookings until explicit application; two simultaneous apply requests succeeded idempotently. Dated occurrences and occupancy agree afterward.
- Evidence: ignored `.local/hosted-workflow-verification.json`. One transient connection reset interrupted the test runner's polling; it resumed the persisted generation instead of duplicating it.
- Hosted substitution checks passed: decline returned the class to the uncovered queue; Vercel Workflow expired a short-lived offer with no application reads/browser activity; faculty acceptance confirmed dated cover with matching occupancy and original-teacher history. Evidence: ignored `.local/hosted-offer-verification.json`. A connection reset during the final check was resolved by inspecting the persisted pending offer and resuming it without creating another offer.
- User-authorized real inbox delivery and recipient-provided one-time email verification passed using Neon's shared development SMTP. No SQL verification was used for this identity. Evidence: ignored `.local/real-email-verification-status.json` (the consumed code is not stored there).
- The signup UI now explicitly requests verification codes and provides a resend action with delivery-failure feedback. Inputs and buttons are disabled until hydration, preventing both native credential-bearing GET submissions and loss of pre-hydration typed values. A new Chromium test covers signup delivery failure and resend; it passed against the production build. The initial dev-server run was unstable with repeated reloads, so the test was rerun against `next start`.
- Latest protected Preview with the onboarding fixes: `https://facultyflow-9p84ko7pg-pranav-patidars-projects.vercel.app` (`dpl_5keDQ5pSqbYswWK5HyTL85i8QZXN`). It shares the same isolated Neon branch and narrow solver trust rule. Type checking, lint and local/cloud production builds pass.
- Latest-build browser smoke verification passed: no-JavaScript credential guard, actual managed Auth sign-in, invited admin access, Daily Change Desk navigation with an uncovered-count badge, mobile rendering/navigation, sign-out, and subsequent HTTP 401. `.local/hosted-smoke-verification.json` records this latest URL.
- Hosted web/Auth, generation/repair Workflow, substitution and real-email checks pass. Production app release is not enabled.

1. Configure and verify a custom production SMTP sender before production invitations. Shared development delivery has passed; the application explicitly requests signup verification codes and supports resend.
2. Prepare the intended college/admin setup and production database environment. Existing production data has not been migrated or modified. At the user's subsequent request, their verified email was granted administrator membership on the isolated preview only.
3. Stage and verify a production build with production-only credentials before promotion. Keep `DAILY_CHANGES_ENABLED=false` there until these remaining release gates pass. The isolated authenticated preview explicitly enables it for testing.

One term per workspace, no cross-date moves, no shared teaching, no automatic assignment/application, and in-app-only notifications remain intentional boundaries.

The user requested that the PC be shut down after the work. Local servers will be stopped after verification; restart them with the commands above when returning.

## Owner login setup

At the user's explicit request, `pranavpatidar28@gmail.com` now has application-owned administrator membership on `facultyflow_preview`; its Neon identity was already verified by the recipient-provided email code. No production membership or Auth provider-wide admin role was granted.

The current Preview is `https://facultyflow-o7mvwomnv-pranav-patidars-projects.vercel.app` (`dpl_C9NWDpi4MFUepFszw2zHeJhDmHfJ`). Its login page includes **Set or reset password**. The user enters their email, requests a reset code, and supplies that code and their chosen password directly in the app. Passwords need not be shared in chat. Expired/invalid codes display an error; new codes can be requested. No paid mail provider or upgrade was enabled.

Password confirmation, expired-code handling, successful reset UI, and signup-code resend pass two Chromium tests against the production build. The hosted Neon reset endpoint correctly rejects invalid codes with `INVALID_OTP`. Type checking, lint, local production build and Vercel build pass. End-to-end reset with the owner's chosen password remains a user action; no credential bypass or direct password database update was performed.

Hosted browser checks on this exact deployment also pass recovery-screen navigation, synthetic administrator sign-in, authorized Neon access, Daily Change Desk/mobile navigation, sign-out and subsequent HTTP 401. The owner membership and verified identity were independently confirmed in the isolated database.
