import { expect, it } from "vitest";
import type { Claim } from "./api";
import { anyRunning, isRunning } from "./progress";

const waiting: Claim = {
  claim_id: "CLM-1001",
  policy_id: "POL-2001",
  customer_id: "CUS-3001",
  claim_type: "trip_delay",
  submitted_on: "2026-06-24",
  incident_date: "2026-06-18",
  incident_location: "Rome, Italy",
  summary: "Flight home canceled",
  story: "My flight was canceled.",
  items: [],
  documents: [],
  amount_claimed: 420,
  state: "waiting",
  decision: null,
  payout: null,
  reason: null,
  policy_section: null,
  paid_amount: null,
  signed_off_by: null,
  last_step: null,
};

it("keeps polling while the agent works on a claim", () => {
  expect(isRunning("in_progress", null, false)).toBe(true);
  expect(isRunning("decided", "tool_result", false)).toBe(true);
});

it("polls from a run request until the claim leaves waiting", () => {
  expect(isRunning("waiting", null, true)).toBe(true);
  expect(isRunning("waiting", null, false)).toBe(false);
});

it("stops polling once the agent has replied or failed", () => {
  expect(isRunning("decided", "reply", false)).toBe(false);
  expect(isRunning("in_progress", "error", false)).toBe(false);
});

it("sees a queue as running while a queued claim is still waiting", () => {
  expect(anyRunning([waiting], ["CLM-1001"])).toBe(true);
  expect(anyRunning([waiting], [])).toBe(false);
  expect(
    anyRunning(
      [{ ...waiting, state: "decided", last_step: "reply" }],
      ["CLM-1001"],
    ),
  ).toBe(false);
});
