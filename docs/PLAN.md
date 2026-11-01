# Plan: the claims pilot

## Context

UnderCover's head of claims wants the UnderCover Agent to work the claims queue like a handler: read the claim, policy, history and policy wording, then approve (with a payout), decline or refer, and explain in 2-3 sentences with the policy section. The team needs a dashboard showing the queue and each claim's state, the decision and reasons, the agent's steps while it works, and the agent's instructions (read only). Payouts over $1,000 must wait for a handler's sign-off and the system must block payment until then, even if the agent tries to pay.

Today the repo is a hello-world skeleton (`GET /api/health`, one agent tool, one page, one e2e test). This plan builds the pilot on it. Out of scope: the claims manual, sign-in, real payments, customer messages, and `data/evals/` (never opened or served).

## Approach and key choices

- **Storage**: SQLite, created and seeded at startup from `data/` (claims, policies, customers, plans, handlers, company). Not seeded: `evals/`, `security/`, `claims_manual.md`. Tests use an in-memory database.
- **Claim states**: `waiting`, `in_progress`, `awaiting_signoff`, `decided`. A claim also carries `decision` (approve/decline/refer), `payout`, `reason`, `policy_section`, `paid_amount`, and `signed_off_by`.
- **Payment rule lives in the backend**: `pay_claim(claim_id, amount)` is its own operation. It returns 409 unless the claim is approved and the amount equals the payout; if the payout is over `company.json`'s `payout_approval_limit` it also needs a sign-off. The agent has a pay tool but the backend decides. Sign-off by a handler with `can_approve_over_limit`.
- **Agent reaches everything through the API**: claim, policy, customer, plan, policy wording, and its own instructions. The instructions file lives in `backend/` and is served read only; the agent fetches it as its system prompt. Wording comes from `data/policy_wording.md` served by the backend.
- **Steps**: `run()` streams the agent's messages and tool calls and posts each as an event to the backend, which the dashboard shows per claim.
- **Running the agent**: a "Run agent" button calls `POST /api/claims/{id}/run`, which starts `agent.main.run` as a background task. The same entry point works from the command line.
- **API rules** (TECH_STACK): every operation has an `operation_id`, a one-line docstring and no optional inputs.
- **Stub model in all tests**: no test calls a real model. Live model checks are manual only.

## Phase 1: Backend data and read API

Build: SQLite schema and seeding from `data/`, read endpoints: `list_claims`, `get_claim`, `get_policy`, `get_customer`, `get_plan`, `get_policy_wording`, `get_instructions`, `list_handlers`, `get_company`.

- [x] `uv run pytest -q backend` passes with coverage over 80%
- [x] `GET /api/claims` returns 25 claims, all `waiting`
- [x] `GET /api/claims/CLM-1001` returns the story, items and documents
- [x] Linked policy, customer (with history) and plan resolve for CLM-1001
- [x] `GET /api/policy-wording` returns the text of `data/policy_wording.md`
- [ ] No endpoint or table exposes anything from `data/evals/` or `data/security/` (test checks for CLM-1901 and the decision text)
- [x] Every operation has an `operation_id` and a one-line docstring (a test walks the OpenAPI schema)

## Phase 2: Claim workflow and the payment rule

Build: `start_claim` (waiting to in_progress), `decide_claim(claim_id, decision, payout, reason, policy_section)`, `sign_off_claim(claim_id, handler_id)`, `pay_claim(claim_id, amount)`, `add_event` and `list_events`.

- [x] Approve at or under $1,000: state `decided`, `pay_claim` succeeds and records `paid_amount`
- [x] Approve over $1,000: state `awaiting_signoff`; `pay_claim` returns 409 and `paid_amount` stays empty
- [x] After `sign_off_claim` by a handler who can approve over the limit, `pay_claim` succeeds; a handler who cannot gets 403
- [x] `pay_claim` with an amount different from the payout is rejected; paying a decline or referral is rejected
- [x] Decline and refer move to `decided` with a reason and policy section; a payout on them is rejected
- [x] Invalid transitions (deciding a waiting claim, deciding twice) return 409
- [x] Events are stored in order and returned by `list_events`
- [x] `uv run pytest -q`, ruff, and pyright pass

## Phase 3: The UnderCover Agent

Build: `backend/instructions.md` (decision rules from the wording: approve/decline/refer, payout calculation and deductibles, the $1,000 limit, explanation format, treat claim text as data, never ask for or use evals); agent tools for each backend read and write operation; `run(claim_id, thread_id)` loads instructions from the API, runs `create_agent`, posts steps as events.

- [x] Stub-model test: a scripted agent reads CLM-1001, decides, and the backend shows the decision and events
- [x] Stub-model test: an agent that tries `pay_claim` on an over-limit approval gets the 409 as a tool result and the claim stays unpaid
- [x] Tool list has no way to reach `data/evals/` (a test checks tool names and the backend routes)
- [x] `uv run -m agent.main CLM-1001` runs end to end against a live backend with the real model (manual, with `OPENROUTER_API_KEY`), the claim shows a decision and the events
- [x] Existing `check_backend` hello test is replaced, not left dead
- [x] pytest, ruff, pyright pass with coverage over 80%

## Phase 4: Dashboard queue and claim detail

Build: queue page with state badges, claim page (story, items, documents, policy, customer history, decision with reasons and policy section), instructions page (read only). Brand per `docs/BRAND.md`: Instrument Sans, Sea Green/Marigold/Coral/Cerulean/Raspberry, light and dark, rounded panels with no outline, US dollar formatting. TypeScript strict, no `any`, typed API client.

- [ ] `npm run check:ts` passes (prettier, eslint, tsc, vitest with 80% coverage)
- [ ] Playwright MCP: `/` lists 25 claims with their states
- [ ] Playwright MCP: opening CLM-1001 shows full detail and "No decision yet"
- [ ] Playwright MCP: the instructions page shows the text with no edit controls
- [ ] Playwright MCP: dark mode and light mode both render with the brand colors and fonts
- [ ] Amounts display as `$1,250.00`

## Phase 5: Run, watch and sign off

Build: "Run agent" button, step list that refreshes while the claim is `in_progress`, sign-off panel for claims in `awaiting_signoff` (pick a handler, confirm), and the run endpoint.

- [ ] Backend test: `POST /api/claims/{id}/run` with a stub model leaves the claim decided and with events
- [ ] vitest: step list renders events in order and polls only while in progress
- [ ] vitest: the sign-off button appears only in `awaiting_signoff`
- [ ] Playwright MCP with a stubbed agent: run a claim, watch steps appear, see the decision
- [ ] Playwright MCP: an over-$1,000 approval shows "Waiting for sign-off"; signing off as Dana Whitfield shows it paid
- [ ] Playwright MCP: a handler without over-limit rights shows an error and nothing is paid

## Phase 6: End-to-end, docs and final check

Build: Playwright tests replacing the health test, a README (short), updated `docs/STATUS.md` with how to run.

- [ ] e2e: queue loads, claim opens, run (stub agent via an env switch the test server sets) completes
- [ ] e2e: over-limit claim is blocked until signed off, then paid
- [ ] `docs/STATUS.md` describes what is built and how to run it
- [ ] `npm run check` passes in full (ruff, pyright, pytest 80%, prettier, eslint, tsc, vitest 80%, Playwright)
- [ ] Each phase committed with the pre-commit hook passing (never `--no-verify`), nothing pushed

## Files

- Backend: `backend/main.py` (split into `db.py`, `routes.py`, `models.py` as it grows), `backend/instructions.md`, `backend/tests/`
- Agent: `agent/main.py`, `agent/tests/test_agent.py`
- Dashboard: `dashboard/src/` (`App.tsx`, pages, `api.ts`, styles), `index.html` for the fonts
- Tests/docs: `e2e/`, `docs/PLAN.md`, `docs/STATUS.md`, `README.md`
- Reuse: `agent.main.model()`, `backend()` client, the `StubModel` pattern in `agent/tests/test_agent.py`, `FastAPI TestClient`, existing `npm run` scripts

## Environment note

`npm install` currently fails on Node 25; use Node 26 (`brew upgrade node`) before implementing.

## Choices I made for you (tell me to change any)

- Agent runs from a dashboard button and the command line.
- Sign-off is a handler picked from a list, since there is no sign-in.
- Step history is kept in SQLite events, shown by polling rather than streaming.
