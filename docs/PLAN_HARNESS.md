# Plan: the agent's harness

## Context

From the head of claims operations and our IT team (`docs/HARNESS.md`). The pilot agent works one claim at a time, and our code does the organizing: it feeds the agent one claim, hands it the whole wording every time, and leaves a claim stuck in progress when it fails. This build makes the agent organize its own work:

- A **queue agent** (the lead) works a run of claims. It keeps a to-do list, hands each claim to a helper, checks it has not missed a waiting claim within the run's cap, and finishes with a summary for the handlers.
- A **claim agent** (the helper) is created fresh for each claim, works that one claim, and reports back in one line. It looks up the claims manual and the policy wording a section at a time.
- The **backend** keeps the rules that must hold whatever the agents do: a claim is moved only by its own transitions, a claim that cannot be finished is referred, and the payment rule stays where it is.

Everything is built on LangChain's `create_agent`, as `docs/TECH_STACK.md` asks. No agent framework is added.

Current state to note before building:

- `backend/db.py` has an uncommitted change that seeds 10 random claims from the 25 in `data/claims.json`. This is kept. The queue therefore has 10 claims after each seed, and which 10 varies. Tests and the end-to-end server must pin the choice (see Approach).

## Approach and key choices

- **Queue size**: each seed loads 10 random claims. Tests pin the choice to the first ten (`CLM-1001` to `CLM-1010`) so they can name claims. The end-to-end server does the same through a small wrapper, so `e2e/` does not depend on which claims were drawn.
- **Cap**: a run takes the first N waiting claims in queue order, so a trial is repeatable. The lead chooses the order among them. The cap is stored in the backend, and the lead cannot work a claim outside it.
- **Three decisions only**: approve, decline and refer. A claim that cannot be finished after two attempts is recorded as **refer**: state `decided`, decision `refer`, payout 0, and a reason that says the agent could not finish it and gives the last error. No new claim state is added, so the states stay `waiting`, `in_progress`, `awaiting_signoff` and `decided`.
- **Attempts**: a claim has two attempts. A failed first attempt sends it back to `waiting`; a failed second attempt makes it a refer. Attempts are counted in a new `attempts` column.
- **Failures are detected from state, not from the model's words.** After a claim agent finishes, the code checks the claim. If it has no decision, that is a failed attempt, whatever the model said. The one-line report to the lead is built from the claim's state too.
- **Retries in the same run**: the lead checks the queue before it finishes. After the lead finishes, the code works any claim in the cap that is still waiting, the same way. Each claim has two attempts, so this always ends.
- **Individual claims**: any waiting claim can be run on its own, from the claim page's Run agent button, from `uv run -m agent.main CLM-1001`, or from `POST /api/claims/{id}/run`. It uses the same claim agent and the same two-attempt rule. A single run creates no run record and has no to-do list. It can happen while a queue run is going: the queue skips a claim that is no longer waiting.
- **Claim-scoped tools**: the claim agent's tools take no claim id. They act on the claim it was given, so it cannot decide or pay another claim.
- **No double decisions or payments under concurrency**: start, decide, sign-off and pay become single conditional `UPDATE`s (for example `WHERE state = 'waiting'`). Today each one reads the state and then writes it, so two requests could both pass the check.
- **Stale state after a restart**: when the backend starts, any claim left `in_progress` counts as a failed attempt, and any run still marked running is finished as interrupted. Otherwise a restart (for example `npm run dev` reloading) would block new runs.
- **Recursion limit**: LangGraph's default is 25 steps, and a 25-claim run needs far more. The lead's run sets its own limit.
- **Timeouts**: each model request has a 120-second timeout and 2 retries (`ChatOpenAI`'s `timeout` and `max_retries`).
- **Manual lookup at section level**: the manual and the wording are split on their `## N. Title` headings. Section 7 of the manual holds several rules under bold lead-ins, so section level is the right grain. The agent gets a table of contents, a keyword search, and one section at a time.
- **Sections read are shown**: each section read is recorded as a `read` step, and the claim page lists them.
- **Long steps**: step text on the page is cut to 300 characters. The full text stays in the database.
- **Model**: `deepseek/deepseek-v4.1-flash` with low reasoning effort is the default. `MODEL_NAME` overrides it, and as today no reasoning effort is sent when it is set.
- **Schema change**: the tables change, so `undercover.db` must be deleted and reseeded after Phase 2. `docs/STATUS.md` says so.
- **No cap control on the dashboard.** The run button runs every waiting claim. Capped runs use `--limit` on the command line or the API.

## Phase 1: The manual and the wording as sections

Build: the backend reads `data/claims_manual.md` and `data/policy_wording.md` and splits each on its `## N. Title` headings. New operations: `list_sections(document)` (table of contents), `read_section(document, number)` and `find_sections(words)` (keyword search across both documents, returning document, number and title). `document` is `manual` or `wording`. `/api/policy-wording` stays for now. The manual is read from the file and not put in the database, as the wording is. Test fixtures pin the seeded queue to the first ten claims.

- [ ] `uv run pytest -q backend` passes with coverage over 80%
- [ ] `GET /api/claims` returns 10 waiting claims under the pinned seed, `CLM-1001` to `CLM-1010`
- [ ] `GET /api/documents/manual/sections` returns 14 sections, numbered 1 to 14, from "Purpose and scope" to "Records"; `GET /api/documents/wording/sections` returns 12
- [ ] `GET /api/documents/manual/sections/7` returns the title "Interpretation notes" and text that includes "Wild animals"
- [ ] `GET /api/documents/manual/sections/99` returns 404, and `GET /api/documents/other/sections` returns 404
- [ ] `GET /api/sections/search?words=wild animals` includes manual section 7 and returns no section text from `data/evals/` or `data/security/`
- [ ] The new operations pass the existing test that every operation has an `operation_id`, a one-line docstring and no optional inputs

## Phase 2: Claim lifecycle and runs in the backend

Build: the `attempts` column. `fail_claim(claim_id, reason)` moves an in-progress claim back to `waiting` on its first failure. On its second failure it records the refer: state `decided`, decision `refer`, payout 0, a reason saying the agent could not finish the claim and giving the last error, and a policy section of "Not applicable". Either way it records one `error` step saying what happened. Start, decide, sign-off and pay become conditional updates. A `runs` table holds each run's id, its claim ids (the cap), its status, its to-do list and its summary. Operations: `save_todos(run_id, todos)` (replaces the list), `finish_run(run_id, summary)`, `get_latest_run()` (returns null when there is no run), and `list_run_claims(run_id)` (the claims in the run, with their states). Startup recovery: in-progress claims count as failed attempts and running runs are marked interrupted. Delete `undercover.db` to reseed.

- [ ] Failing an in-progress claim once: state `waiting`, `attempts` 1, one `error` step saying "Attempt 1 of 2 failed" and that it is back in the queue
- [ ] Failing it again: state `decided`, decision `refer`, payout 0, `attempts` 2, the reason says the agent could not finish the claim, and one `error` step says it was referred
- [ ] A referred claim cannot be paid (409)
- [ ] Failing a waiting claim returns 409, and so does starting a claim twice, deciding a claim twice or paying it twice
- [ ] Each transition is one `UPDATE ... WHERE state = ...`: a test checks the second start, decide or pay on a claim returns 409 and changes nothing
- [ ] Startup recovery test: a database holding an in-progress claim and a running run, opened with `create_app()`, leaves the claim `waiting` with one attempt and the run finished with the text "The run was interrupted."
- [ ] `PUT /api/runs/{id}/todos` stores the list; `GET /api/runs/latest` returns it; with no run it returns null
- [ ] `GET /api/runs/{id}/claims` returns only the claims listed in that run
- [ ] `uv run pytest -q backend` passes with coverage over 80%, and ruff and pyright pass

## Phase 3: The claim agent, run one claim at a time

Build: the claim agent's tools take no claim id. They are `get_claim()`, `decide_claim(decision, payout, reason, policy_section)` and `pay_claim(amount)`, plus the reads `get_policy`, `get_customer`, `get_plan`, `get_company` and the three section tools. Each section read is recorded as a `read` step. `get_policy_wording` leaves the agent's tools. The claim's run starts the claim, creates a fresh agent with a new thread and the claim instructions, and at the end either finds a decision or calls `fail_claim`. It returns one line built from the claim's state: "CLM-1001 approved for $420.00, paid", "CLM-1001 declined", "CLM-1001 referred", "CLM-1001 failed (attempt 1 of 2), back in the queue", or "CLM-1001 referred after two failed attempts". `run` stops recording its own error step, since `fail_claim` records it. Individual runs use this path from the claim page button (`POST /api/claims/{id}/run`) and from `uv run -m agent.main CLM-1001`. `backend/instructions.md` is rewritten for the claim agent: read the claim, look up the manual and wording sections it needs by table of contents, search or section, and reply in one line. The model default and the timeouts change here.

- [ ] Stub-model test: the claim agent reads manual sections 4 and 7 and decides CLM-1001; the claim is decided, and its steps include a `read` step for each section
- [ ] Stub-model test: a model that raises leaves the claim `waiting` with one attempt; the error step carries the message, and no exception reaches the caller
- [ ] Stub-model test: a model that replies without deciding leaves the claim `waiting` with one attempt, not in progress
- [ ] Stub-model test: a single run on a claim whose two attempts both fail leaves it referred, and no run record is created
- [ ] Test: no claim-agent tool has a `claim_id` argument, and the tool list has no `get_policy_wording`
- [ ] Test: `model()` uses `deepseek/deepseek-v4.1-flash` with low reasoning effort by default, `MODEL_NAME` overrides it, and the timeout and retries are set
- [ ] Manual, with `OPENROUTER_API_KEY` in `.env`: `uv run -m agent.main CLM-1001` on a live backend decides the claim and shows its `read` steps
- [ ] `uv run pytest -q backend agent` passes with coverage over 80%, and ruff and pyright pass

## Phase 4: The queue agent

Build: `agent/queue.py`. `run_queue(run_id, claim_ids)` creates the lead agent with the queue instructions and three tools: `list_run_claims()`, `write_todos(todos)` (each item has text and a status of `to_do`, `in_progress`, `done` or `refer`) and `work_claim(claim_id)`. `work_claim` refuses any id outside the cap and otherwise runs the claim agent and returns its one line. It never raises, and a claim that is not waiting when it is reached is reported, not failed. After the lead's reply, the code works any claim in the cap that is still waiting, then saves the reply as the summary with `finish_run`. The lead's run sets a recursion limit high enough for 25 claims with retries. `POST /api/runs` with body `{"limit": N}` (N at least 1) takes the first N waiting claims, returns 409 if none are waiting or a run is going, and starts `run_queue` in the background. `uv run -m agent.main --limit N` starts a run through that endpoint, polls until it finishes and prints the to-do list and summary. `uv run -m agent.main` with no arguments runs every waiting claim the same way. The old `run-waiting` endpoint and `run_all` are removed. `backend/queue_instructions.md` covers running the queue. `GET /api/instructions` now returns `{"queue": ..., "claim": ...}`. In the stand-in, the lead's role is recognised by the tools it is given, so end-to-end tests run the whole flow.

- [ ] Stub-model test: a run capped at 2 of 3 waiting claims works the first two; the third stays waiting, and the to-do list is stored and returned by `GET /api/runs/latest`
- [ ] Stub-model test: a lead that finishes without working its claims has them worked by the code, and the run ends finished with the summary
- [ ] Stub-model test: a claim whose first attempt fails is tried again in the same run and ends decided
- [ ] Stub-model test: a claim that fails twice is referred, and the run still finishes
- [ ] Test: `work_claim` on a claim outside the cap returns "not in this run" and changes nothing
- [ ] Test: a single-claim run on a waiting claim while a queue run is going works that claim, and the queue reports the claim as not waiting when it reaches it
- [ ] Test: `POST /api/runs` with `{"limit": 5}` on the seeded database returns the first five claim ids; with `{"limit": 0}` it returns 422; a second run while one is going returns 409
- [ ] Test: `GET /api/instructions` returns both texts, and neither mentions `evals`
- [ ] Manual: `UNDERCOVER_STAND_IN=1` with the backend on port 8000 and `uv run -m agent.main --limit 2` works two claims and prints the summary
- [ ] `uv run pytest -q backend agent` passes with coverage over 80%, and ruff and pyright pass

## Phase 5: The dashboard

Build: the queue page gets an "Agent run" panel for the latest run: its status, the number of claims in it, the to-do list with each status shown as a label ("To do", "In progress", "Done", "Refer"), and the summary once it has finished. It polls every 2 seconds while the run is going. The run button posts `{limit: N}` for all waiting claims. The claim page keeps its Run agent button for a single waiting claim and gets a "Sections read" panel built from the `read` steps. A referred claim shows the existing "Refer" decision label. The instructions page shows two read-only parts, "Running the queue" and "Working a claim". `api.ts` gets the new types, with no `any`. Step text in the steps list is cut to 300 characters.

- [ ] vitest: the to-do list renders its items in order with their labels
- [ ] vitest: the run panel polls only while the run is going
- [ ] vitest: a referred claim shows "Refer" in its decision; the claim page lists the sections read
- [ ] vitest: the instructions page shows both parts, with no text box or button
- [ ] `npm run check:ts` passes, with coverage over 80%
- [ ] Playwright MCP, with a stub run on the test server: the queue shows the run panel, the to-do list fills in and is ticked off, the summary appears
- [ ] Playwright MCP: a single claim run from the claim page works that claim alone and shows its steps, with no run panel change
- [ ] Playwright MCP: a claim page after a run lists the sections read
- [ ] Playwright MCP: light and dark mode both keep the brand colours and fonts

## Phase 6: End to end, docs and a live trial

Build: the Playwright tests, with the e2e server pinned to the first ten claims. The existing queue run test now checks the to-do list, and a test checks the sections read on a claim page. The over-limit test uses a claim from the pinned ten (CLM-1013 is not among them). `docs/SPEC.md`: the manual is no longer "Not for now", and the spec describes the to-do list, the run cap, individual claim runs, and the refer after two failed attempts. `docs/TECH_STACK.md`: the model default, the two agents, the section tools and the timeouts. `docs/STATUS.md`: what is built, how to run a capped run and a single claim, and the reseed note. Then a live trial: reseed (this deletes `undercover.db`), start `npm run dev`, and run `uv run -m agent.main --limit 5` with the real model.

- [ ] e2e: a queue run on the stand-in finishes, and each to-do item is done or refer
- [ ] e2e: a claim page after a run lists the sections read
- [ ] `docs/SPEC.md`, `docs/TECH_STACK.md` and `docs/STATUS.md` describe the product as built
- [ ] Live trial, after reseeding and with the real model: five of the ten claims are worked and decided or referred, the other five stay waiting, the dashboard's to-do list fills in and is ticked off, and each claim shows the sections it read (screenshots from Playwright MCP)
- [ ] `npm run check` passes in full (ruff, pyright, pytest with 80%, prettier, eslint, tsc, vitest with 80%, Playwright), and the output is reported
- [ ] Each phase is committed with the pre-commit hook passing (never `--no-verify`), and nothing is pushed

## Files

- Backend: `backend/db.py` (runs table, attempts, sections), `backend/workflow.py` (`fail_claim`, conditional transitions), `backend/routes.py` (sections, runs, to-dos), `backend/models.py` (run and to-do bodies), `backend/main.py` (startup recovery), `backend/instructions.md` (claim agent), `backend/queue_instructions.md` (queue agent), `backend/tests/`
- Agent: `agent/main.py` (model default, claim tools, `run`, command line), `agent/queue.py` (queue agent, `work_claim`, safety net), `agent/stub.py` (stand-in for both roles), `agent/tests/`
- Dashboard: `dashboard/src/QueuePage.tsx` (run panel), `ClaimPage.tsx` (sections read), `AgentPanel.tsx` (step length), `InstructionsPage.tsx`, `StateBadge.tsx`, `format.ts`, `api.ts`, `progress.ts` (run polling), and their tests
- Tests and docs: `e2e/pilot.spec.ts`, `e2e/serve.py` (pins the queue for the e2e server), `docs/SPEC.md`, `docs/TECH_STACK.md`, `docs/STATUS.md`, `docs/PLAN_HARNESS.md`

## Not in this build

- The manual's rule that a decision record holds the manual version, and who or what made the decision (manual section 14)
- Messages to customers (manual section 12, and SPEC's "No messages to customers")
- A separate queue for Special Investigations. A third claim in 12 months is referred like any other referral
- Sign-in
- A cap control on the dashboard

## Decided

- A payment that fails after the decision is recorded leaves the claim `decided` and unpaid, with an error step. The code does not retry the payment.
- Individual claims run from the claim page, the command line and the API. There is no Run button on each waiting row of the queue.

## Choices I made for you (tell me to change any)

- Refer after two failed attempts is `decided` with decision `refer`, not a new state, as you asked.
- The to-do status for a claim the agent could not finish is `refer`, labelled "Refer", to match the decision.
- Cap: the first N waiting claims in queue order.
- Two attempts per claim before it is referred.
- The lead's to-do list is replaced in full on each `write_todos` call.
- The claim agent's tools have no claim id argument.
- Section lookup is by section, not by sub-clause.
- The command line waits for a capped run and prints its summary. It runs through the backend, not in its own process.
- Individual claim runs create no run record and no to-do list.
- The uncommitted seeding change in `backend/db.py` goes into the Phase 1 commit with the rest of the work.
