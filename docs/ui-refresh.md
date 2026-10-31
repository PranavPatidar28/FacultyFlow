# UI refresh verification

Validated locally on 31 October 2026 using the production Next.js build, Chromium, synthetic demo data, and the local Python solver. No database migrations, authentication changes, or deployment changes were made.

## Changes

- Shared violet palette with stronger text contrast, 16px body and form text, 14px supporting text, and 20px section headings.
- Removed promotional dashboard sections, repeated subtitles, sidebar tips, and redundant copy. Compact dashboard metrics leave more space for classes and outstanding decisions.
- Responsive controls, scroll-contained tables, mobile timetable agenda, visible focus, a skip link, and mobile navigation with Escape, focus containment, and focus restoration.
- Shared workspace mounted in the root layout preserves state across navigation. Screen modules load on demand and preload on navigation hover/focus. Only component code is cached; user data stays in the mounted workspace.
- Extracted shared UI and CSV helpers remove circular screen imports. Generation dialog loads separately.
- Refresh requests are deduplicated; mutation refreshes abort older requests, and responses cannot roll back the workspace revision. Initial and screen-load failures have retry states.
- Dialog effects retain focus through background refreshes. Faculty search responds to URL query changes without requiring a workspace remount.

## Checks

- ESLint: clean.
- TypeScript and optimized production build: passed.
- Unit tests: 47 passed.
- Browser suite: 18 passed; the seven UI tests also passed again after the final mobile selector sizing adjustment. Coverage includes responsive navigation, qualifications-based cover and acceptance, stale/concurrent actions, real solver generation and publication, invalid CSV preview, faculty absence and approval, authentication recovery and verification errors, room repairs, partial absence consent, atomic application, preserved navigation, retry/deduplication, same-page search, mobile keyboard navigation, and draft editing/locking.
- Layout audit: 36 route/viewport combinations across 1440px, 820px, 390px, and 720px widths. No page-level horizontal overflow, visible audited main-content text below 14px, or uncaught browser errors. The 720 CSS-pixel check covers the reflow width of a 1440px display at 200% zoom; actual browser zoom and assistive technology were not manually audited.
- Linked faculty availability was additionally reviewed at desktop, mobile, and 720px widths. Wide data and availability tables intentionally scroll within their panels.
- Development server smoke test: dashboard and state API load successfully without refresh loops.

## Performance sample

Measured against the original source on the same machine, Chromium viewport (1440 x 1000), local production server, demo setup, and reload/navigation sequence. These are local samples, not field Core Web Vitals or a statistically significant timing benchmark.

| Measure | Before | After |
| --- | ---: | ---: |
| Dashboard JavaScript encoded body bytes | 214,278 | 162,365 |
| Dashboard ready sample | 81.3ms | 57.5ms |
| First timetable navigation sample | 70ms | 56ms |
| Revisited timetable navigation | Not measured | 67ms |
| Workspace shell retained on navigation | No | Yes |
| Additional workspace fetches on page switches | Yes | None |

Initial dashboard JavaScript decreased by 51,913 bytes (24.2%). The screen loader uses ordinary asynchronous component installation to avoid a measured delay from creating a fresh Suspense boundary on each first visit. The generation dialog still uses Next.js dynamic loading.

Screenshots and machine-readable audit/performance results are in the ignored `.local/ui-refresh/` directory. Browser traces and test artifacts are in `test-results/`. Verification uses isolated in-memory demo sessions; live Neon persistence, real email delivery, hosted latency, and deployment behavior were not reverified for this presentation change.

## Follow-up: calendar graphic restored

Restored the lavender banner and CSS calendar illustration at the user's request, with only a functional heading and timetable link. Replaced remaining slogans in login, help, demo notification seed, and timetable prompts. The performance samples above describe the initial refresh before this follow-up.

Validation: production build and lint passed; nine UI/authentication browser tests passed. Banner reviewed at 1440px, 820px, and 390px without page overflow. Updated previews are `.local/ui-refresh/banner-*.png`; the banner crop is `.local/ui-refresh/restored-banner.png`.
