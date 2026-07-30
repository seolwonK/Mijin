# Lane B — Technician and Admin live verification

Date: 2026-07-30
Target: deployed Cloudtype application
Browser coverage: Chromium desktop 1440×900 and mobile 390×844
Safety: no SMS/paid API invoked; no production DB read/write; no account creation; only marked invalid-login data used.

## Verdict

**BLOCKED / NOT RELEASE-READY for Lane B.** No critical/high product defect was proven in the safely reachable scope, but the authenticated acceptance criteria are unverified. Rotated dedicated admin and technician credentials were not available to this worker, and prior/static credential values were not requested, echoed, or reused. The production technician signup identity-verification action was not invoked because it can send paid SMS.

## Verified behavior

### Chromium desktop

1. Protected UI routes redirect unauthenticated users to the role login page and preserve `returnTo`:
   - Admin: `/admin`, `/admin/requests/live-test-marker`, `/admin/technicians`, `/admin/commissions`, `/admin/settings`, `/admin/settlements`, `/admin/analytics/dashboard`, `/admin/analytics/map` → `/admin/login?returnTo=...`.
   - Technician: `/tech`, `/tech/contract`, `/tech/jobs/live-test-marker` → `/tech/login?returnTo=...`.
   - Expected: unauthenticated access is denied without exposing protected content.
   - Actual: each route rendered the correct role login heading and preserved the original path.

2. Protected read APIs returned `401 {"error":"권한이 없습니다"}` without disclosing data:
   - Admin: `/api/admin/requests`, `/api/admin/technicians`, `/api/admin/settings`, `/api/admin/commissions`, `/api/admin/settlements`, `/api/admin/analytics/summary`, `/api/admin/analytics/dashboard?period=week`, `/api/admin/analytics/map/regions`.
   - Technician: `/api/tech/jobs`, `/api/tech/commissions`, `/api/tech/referrals`, `/api/tech/reviews`, `/api/tech/stats`, `/api/tech/contract`.

3. One marked nonexistent credential attempt per role returned HTTP 401 and the generic visible error `아이디 또는 비밀번호가 올바르지 않습니다` for both admin and technician. No account enumeration signal was observed.

4. Admin login keyboard order exposed the username and password fields in the expected sequence. Both fields had accessible names, and autocomplete was `username` / `current-password`.

### Chromium mobile

1. `/admin/login`, `/tech/login`, and `/tech/signup` rendered at 390×844 with `scrollWidth === innerWidth` (390 px), so no horizontal overflow was detected.
2. Protected admin analytics/map/settings/settlements and technician dashboard/contract routes redirected to the correct role login and preserved `returnTo` at the mobile viewport.
3. The technician signup page rendered all account, employment, identity, address, service-region, referral, consent, and submit controls. The `본인인증` action was deliberately not invoked.

## Blockers and severity

### LB-BLOCK-01 — High evidence gap (release gate, not a proven product defect)

- Scope blocked: authenticated technician lifecycle, employment contract, job acceptance/dispatch/completion, earnings; admin assignment, personnel, commissions, settings, analytics, map, and settlements.
- Reproduction: inspect the worker runtime for dedicated test account variables, then attempt the live review without reusing prior/static credentials.
- Expected: rotated, clearly marked dedicated admin and technician accounts are available to the verification lane.
- Actual: no dedicated admin/technician credential variables were available. Only a database connection variable name was present; it was not read or used.
- Impact: the core Lane B acceptance criteria cannot be asserted. Release approval would be a false green.
- Required evidence to clear: authenticated desktop/mobile captures and request evidence for each listed functional area using rotated dedicated accounts.

### LB-BLOCK-02 — High evidence gap (safety constraint, not a proven product defect)

- Scope blocked: technician signup identity verification and resulting auto-login/contract flow.
- Expected: a deployment-safe non-billable verification channel or preverified dedicated technician account.
- Actual: the live signup exposes a `본인인증` action; invoking it could use the production SMS provider. It was not clicked.
- Required evidence to clear: documented non-billable provider configuration for the test identity or a preverified dedicated technician account.

## Existing-test review

- The repository Playwright configuration targets `http://localhost:3000`, forces `SMS_PROVIDER=console`, and defines only Desktop Chromium. It is intentionally unsafe to repoint unchanged at production because production SMS behavior differs.
- The technician journey creates an account through identity verification, writes DB fixtures, signs a contract, and mutates job lifecycle state; it is unsuitable for live use without dedicated data and a non-billable SMS channel.
- Admin suites depend on local DB fixtures and local credentials/session helpers. They provide route/expectation maps but not deploy-safe authenticated sessions.

## Artifacts

- `desktop-home.png`
- `desktop-admin-login.png`
- `desktop-admin-invalid.png`
- `desktop-tech-invalid.png`
- `mobile-admin-login.png`
- `mobile-tech-login.png`
- `mobile-tech-signup.png`

## Release recommendation

Do not mark Lane B passed. Preserve the successful unauthenticated guard evidence, then repeat only the authenticated scenarios after dedicated rotated accounts or a deploy-safe session handoff exists. No paid SMS or direct production DB workaround should be used.
