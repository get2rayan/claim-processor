# Status

The claims pilot is built (see `docs/PLAN.md`).

What is built:

- `backend/`: seeds a SQLite database from `data/` on first start, then serves the claims queue, each claim, its policy, customer, plan, handlers, company settings and policy wording. Claims move through waiting, in progress, awaiting sign-off and decided. A payout over the $1,000 limit can't be paid until a handler signs off.
- `agent/`: the UnderCover Agent. It works a claim through the backend's API, following `backend/instructions.md`, and records each step.
- `dashboard/`: the claims queue, each claim in full with its decision and steps, the agent's instructions (read only), a Run agent button for a waiting claim, a button on the queue that runs the agent on every waiting claim, and sign-off for a payout over the limit.
- `e2e/`: Playwright tests of the queue, a run, and sign-off.

Run it:

- `npm run dev` starts the backend on port 8000 and the dashboard on http://localhost:5173. The backend keeps its database in `undercover.db` in the repo root, created on first start. Delete that file to reseed.
- The agent needs `OPENROUTER_API_KEY` in `.env`. With the backend up, run it on the queue from the dashboard, or from the command line: `uv run -m agent.main` runs every waiting claim, one after another, and `uv run -m agent.main CLM-1001` runs one claim. Each claim's steps show on its page as it works.
- `npm run check` runs every check, including the end-to-end tests. The end-to-end tests start their own backend on port 8100 and dashboard on port 5174, with a fresh temporary database and a stand-in model (set by `UNDERCOVER_STAND_IN`) in place of a real one, so they never call a model or touch `undercover.db`.
