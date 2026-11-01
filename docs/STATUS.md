# Status

Building the claims pilot, phase by phase (see `docs/PLAN.md`).

Built so far:

- Phase 1 and 2: `backend/` seeds a SQLite database from `data/` and serves the claims queue, claim, policy, customer, plan, handlers, company and policy wording. Claims move through waiting, in progress, awaiting sign-off and decided, and the payment rule blocks payment over $1,000 until a handler signs off.
- Still the skeleton: `agent/` (one health-check tool), `dashboard/` (one page showing whether the backend is up), and `e2e/` (one test of that page).

Run the backend with `npm run dev:backend`. The database is `undercover.db` in the repo root, created on first start; delete it to reseed.
