import {
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor,
} from "@testing-library/react";
import { afterEach, expect, it, vi } from "vitest";
import { App } from "./App";
import type { AgentEvent, Claim, Customer, Plan, Policy } from "./api";

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
  last_step: null,
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

const awaiting: Claim = {
  ...claim,
  claim_id: "CLM-1003",
  claim_type: "emergency_medical",
  amount_claimed: 3800,
  state: "awaiting_signoff",
  decision: "approve",
  payout: 3000,
  policy_section: "7. Emergency Medical",
  reason: "The treatment is covered.",
};

const signedOff: Claim = {
  ...awaiting,
  state: "decided",
  signed_off_by: "HND-01",
};

const paid: Claim = { ...signedOff, paid_amount: 3000 };

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

const steps: AgentEvent[] = [
  {
    actor: "UnderCover Agent",
    kind: "tool_call",
    text: "get_claim {'claim_id': 'CLM-1001'}",
  },
  { actor: "UnderCover Agent", kind: "reply", text: "Approved for $420." },
];

function stubApi(routes: Record<string, unknown>) {
  const fetchMock = vi.fn((path: string, init?: RequestInit) => {
    const method = init?.method ?? "GET";
    const key = method === "GET" ? path : `${method} ${path}`;
    if (!(key in routes)) {
      return Promise.resolve(new Response("{}", { status: 404 }));
    }
    const body = routes[key];
    return Promise.resolve(
      body instanceof Response ? body : new Response(JSON.stringify(body)),
    );
  });
  vi.stubGlobal("fetch", fetchMock);
  return fetchMock;
}

function allRoutes(
  current: Claim,
  events: AgentEvent[] = [],
): Record<string, unknown> {
  return {
    "/api/health": { status: "ok" },
    "/api/claims": [current],
    [`/api/claims/${current.claim_id}`]: current,
    [`/api/claims/${current.claim_id}/events`]: events,
    "/api/policies/POL-2001": policy,
    "/api/customers/CUS-3001": customer,
    "/api/plans/premium": plan,
    "/api/handlers": [
      {
        handler_id: "HND-01",
        name: "Dana Whitfield",
        role: "Senior Claims Handler",
        can_approve_over_limit: true,
      },
    ],
    "/api/instructions": { text: instructions },
  };
}

async function signOffButton() {
  await screen.findByRole("option", { name: "Dana Whitfield" });
  return screen.findByRole("button", { name: "Sign off and pay $3,000.00" });
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
  expect(screen.getByText("No steps yet.")).toBeDefined();
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

it("runs the agent on a waiting claim and says it is working", async () => {
  window.location.hash = "#/claims/CLM-1001";
  const fetchMock = stubApi({
    ...allRoutes(claim),
    "POST /api/claims/CLM-1001/run": claim,
  });
  render(<App />);
  fireEvent.click(await screen.findByRole("button", { name: "Run agent" }));
  expect(
    await screen.findByText("The agent is working on this claim…"),
  ).toBeDefined();
  expect(fetchMock).toHaveBeenCalledWith(
    "/api/claims/CLM-1001/run",
    expect.objectContaining({ method: "POST" }),
  );
});

it("lists the agent's steps in the order they happened", async () => {
  window.location.hash = "#/claims/CLM-1001";
  stubApi(allRoutes(decided, steps));
  render(<App />);
  const items = await screen.findAllByRole("listitem");
  expect(items.map((item) => item.textContent)).toEqual([
    "tool_call get_claim {'claim_id': 'CLM-1001'}",
    "reply Approved for $420.",
  ]);
});

it("offers to run only a waiting claim", async () => {
  window.location.hash = "#/claims/CLM-1001";
  stubApi(allRoutes(decided));
  render(<App />);
  expect(await screen.findByText("Approved")).toBeDefined();
  expect(screen.queryByRole("button", { name: "Run agent" })).toBeNull();
});

it("offers sign-off only for a claim waiting for it", async () => {
  window.location.hash = "#/claims/CLM-1003";
  stubApi(allRoutes(awaiting));
  render(<App />);
  expect(
    await screen.findByRole("button", { name: "Sign off and pay $3,000.00" }),
  ).toBeDefined();
  expect(screen.getByText("Waiting for sign-off")).toBeDefined();
});

it("does not offer sign-off once a claim is decided", async () => {
  window.location.hash = "#/claims/CLM-1001";
  stubApi(allRoutes(decided));
  render(<App />);
  expect(await screen.findByText("Approved")).toBeDefined();
  expect(screen.queryByRole("button", { name: /Sign off/ })).toBeNull();
});

it("signing off pays the claim", async () => {
  window.location.hash = "#/claims/CLM-1003";
  stubApi({
    ...allRoutes(awaiting),
    "POST /api/claims/CLM-1003/sign-off": signedOff,
    "POST /api/claims/CLM-1003/payment": paid,
  });
  render(<App />);
  fireEvent.click(await signOffButton());
  await waitFor(() => {
    expect(screen.queryByRole("button", { name: /Sign off/ })).toBeNull();
  });
  expect(screen.getAllByText("$3,000.00", { selector: "dd" })).toHaveLength(2);
});

it("shows the reason when a handler cannot sign off, and pays nothing", async () => {
  window.location.hash = "#/claims/CLM-1003";
  const fetchMock = stubApi({
    ...allRoutes(awaiting),
    "POST /api/claims/CLM-1003/sign-off": new Response(
      JSON.stringify({ detail: "Dana cannot approve over the limit" }),
      { status: 403 },
    ),
  });
  render(<App />);
  fireEvent.click(await signOffButton());
  expect(
    await screen.findByText("Dana cannot approve over the limit"),
  ).toBeDefined();
  expect(fetchMock).not.toHaveBeenCalledWith(
    "/api/claims/CLM-1003/payment",
    expect.anything(),
  );
});

it("runs the agent on every waiting claim from the queue", async () => {
  const fetchMock = stubApi({
    ...allRoutes(claim),
    "POST /api/claims/run-waiting": { claim_ids: ["CLM-1001"] },
  });
  render(<App />);
  fireEvent.click(
    await screen.findByRole("button", {
      name: "Run agent on all waiting claims (1)",
    }),
  );
  expect(
    await screen.findByText(/The agent is working through the queue/),
  ).toBeDefined();
  expect(fetchMock).toHaveBeenCalledWith(
    "/api/claims/run-waiting",
    expect.objectContaining({ method: "POST" }),
  );
});

it("does not offer to run the queue when no claim is waiting", async () => {
  stubApi(allRoutes({ ...claim, state: "decided", last_step: "reply" }));
  render(<App />);
  const button = await screen.findByRole("button", {
    name: "Run agent on all waiting claims (0)",
  });
  expect(button.hasAttribute("disabled")).toBe(true);
});
