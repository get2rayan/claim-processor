import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, expect, it, vi } from "vitest";
import { App } from "./App";
import type { Claim, Customer, Plan, Policy } from "./api";

const claim: Claim = {
  claim_id: "CLM-1001",
  policy_id: "POL-2001",
  customer_id: "CUS-3001",
  claim_type: "trip_delay",
  submitted_on: "2026-06-24",
  incident_date: "2026-06-18",
  incident_location: "Rome, Italy",
  summary: "Flight home canceled by the airline",
  story: "My flight home from Rome was canceled.",
  items: [
    { description: "Airport hotel", category: "accommodation", amount: 245 },
  ],
  documents: [
    {
      name: "Cancellation notice",
      type: "carrier_report",
      content: "Canceled.",
    },
  ],
  amount_claimed: 420,
  state: "waiting",
  decision: null,
  payout: null,
  reason: null,
  policy_section: null,
  paid_amount: null,
  signed_off_by: null,
};

const decided: Claim = {
  ...claim,
  state: "decided",
  decision: "approve",
  payout: 420,
  paid_amount: 420,
  policy_section: "3. Trip Delay",
  reason: "The delay and receipts are covered.",
};

const policy: Policy = {
  policy_id: "POL-2001",
  customer_id: "CUS-3001",
  plan: "premium",
  add_ons: [],
  purchased_on: "2026-04-22",
  trip: {
    destination: "Rome, Italy",
    departs_on: "2026-06-10",
    returns_on: "2026-06-18",
    trip_cost: 3100,
  },
  travelers: ["Maya Patel"],
};

const customer: Customer = {
  customer_id: "CUS-3001",
  name: "Maya Patel",
  email: "maya.patel@example.com",
  phone: "+1 201 555 0143",
  customer_since: "2023-04-11",
  previous_claims: [],
};

const plan: Plan = {
  plan: "premium",
  name: "UnderCover Premium",
  deductible: 50,
  trip_cancellation_max: 5000,
  emergency_medical_max: 100000,
};

const instructions = "# The UnderCover Agent\n\nDecide each claim.";

function stubApi(routes: Record<string, unknown>) {
  vi.stubGlobal(
    "fetch",
    vi.fn((path: string) =>
      Promise.resolve(
        path in routes
          ? new Response(JSON.stringify(routes[path]))
          : new Response("{}", { status: 404 }),
      ),
    ),
  );
}

function allRoutes(current: Claim): Record<string, unknown> {
  return {
    "/api/health": { status: "ok" },
    "/api/claims": [current],
    [`/api/claims/${current.claim_id}`]: current,
    "/api/policies/POL-2001": policy,
    "/api/customers/CUS-3001": customer,
    "/api/plans/premium": plan,
    "/api/instructions": { text: instructions },
  };
}

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
  window.location.hash = "";
});

it("shows that the backend is up", async () => {
  stubApi(allRoutes(claim));
  render(<App />);
  expect(await screen.findByText("Backend: up")).toBeDefined();
});

it("shows that the backend is down", async () => {
  vi.stubGlobal("fetch", vi.fn().mockRejectedValue(new Error("offline")));
  render(<App />);
  expect(await screen.findByText("Backend: down")).toBeDefined();
});

it("lists the claims queue with each claim's state and amount", async () => {
  stubApi(allRoutes(claim));
  render(<App />);
  const link = await screen.findByRole("link", { name: "CLM-1001" });
  expect(link.getAttribute("href")).toBe("#/claims/CLM-1001");
  expect(screen.getByText("Waiting")).toBeDefined();
  expect(screen.getByText("$420.00")).toBeDefined();
});

it("says when the queue cannot be loaded", async () => {
  stubApi({});
  render(<App />);
  expect(
    await screen.findByText("Could not load the claims queue."),
  ).toBeDefined();
});

it("shows a claim in full, with no decision yet", async () => {
  window.location.hash = "#/claims/CLM-1001";
  stubApi(allRoutes(claim));
  render(<App />);
  expect(await screen.findByText("No decision yet.")).toBeDefined();
  expect(screen.getAllByText("Maya Patel")).toHaveLength(2);
  expect(
    screen.getByText("UnderCover Premium, deductible $50.00"),
  ).toBeDefined();
  expect(screen.getByText("Cancellation notice")).toBeDefined();
});

it("shows the decision and payment once a claim is decided", async () => {
  window.location.hash = "#/claims/CLM-1001";
  stubApi(allRoutes(decided));
  render(<App />);
  expect(await screen.findByText("Approved")).toBeDefined();
  expect(screen.getByText("3. Trip Delay")).toBeDefined();
  expect(screen.getAllByText("$420.00")).toHaveLength(3);
});

it("says when a claim cannot be found", async () => {
  window.location.hash = "#/claims/CLM-9999";
  stubApi(allRoutes(claim));
  render(<App />);
  expect(
    await screen.findByText("Could not load claim CLM-9999."),
  ).toBeDefined();
});

it("shows the agent's instructions read only", async () => {
  window.location.hash = "#/instructions";
  stubApi(allRoutes(claim));
  render(<App />);
  expect(await screen.findByText(/Decide each claim/)).toBeDefined();
  expect(screen.queryByRole("textbox")).toBeNull();
  expect(screen.queryByRole("button")).toBeNull();
});
