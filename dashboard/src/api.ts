export type ClaimState =
  "waiting" | "in_progress" | "awaiting_signoff" | "decided";

export type Decision = "approve" | "decline" | "refer";

export interface Item {
  description: string;
  category: string;
  amount: number;
}

export interface Document {
  name: string;
  type: string;
  content: string;
}

export interface Claim {
  claim_id: string;
  policy_id: string;
  customer_id: string;
  claim_type: string;
  submitted_on: string;
  incident_date: string;
  incident_location: string;
  summary: string;
  story: string;
  items: Item[];
  documents: Document[];
  amount_claimed: number;
  state: ClaimState;
  decision: Decision | null;
  payout: number | null;
  reason: string | null;
  policy_section: string | null;
  paid_amount: number | null;
  signed_off_by: string | null;
  last_step: string | null;
}

export interface Policy {
  policy_id: string;
  customer_id: string;
  plan: string;
  add_ons: string[];
  purchased_on: string;
  trip: {
    destination: string;
    departs_on: string;
    returns_on: string;
    trip_cost: number;
  };
  travelers: string[];
}

export interface PreviousClaim {
  claim_id: string;
  filed_on: string;
  incident_date: string;
  claim_type: string;
  summary: string;
  outcome: string;
  amount_paid: number;
}

export interface Customer {
  customer_id: string;
  name: string;
  email: string;
  phone: string;
  customer_since: string;
  previous_claims: PreviousClaim[];
}

export interface Plan {
  plan: string;
  name: string;
  deductible: number;
  trip_cancellation_max: number;
  emergency_medical_max: number;
}

export interface AgentEvent {
  actor: string;
  kind: string;
  text: string;
}

export interface Handler {
  handler_id: string;
  name: string;
  role: string;
  can_approve_over_limit: boolean;
}

async function send<T>(
  method: string,
  path: string,
  body?: unknown,
): Promise<T> {
  const response = await fetch(path, {
    method,
    headers: { "Content-Type": "application/json" },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  const data: unknown = await response.json();
  if (!response.ok) {
    const detail = (data as { detail?: unknown }).detail;
    throw new Error(
      typeof detail === "string" ? detail : `Error ${String(response.status)}`,
    );
  }
  return data as T;
}

function getJson<T>(path: string): Promise<T> {
  return send<T>("GET", path);
}

export const api = {
  health: () => getJson<{ status: string }>("/api/health"),
  claims: () => getJson<Claim[]>("/api/claims"),
  claim: (claimId: string) => getJson<Claim>(`/api/claims/${claimId}`),
  events: (claimId: string) =>
    getJson<AgentEvent[]>(`/api/claims/${claimId}/events`),
  policy: (policyId: string) => getJson<Policy>(`/api/policies/${policyId}`),
  customer: (customerId: string) =>
    getJson<Customer>(`/api/customers/${customerId}`),
  plan: (plan: string) => getJson<Plan>(`/api/plans/${plan}`),
  handlers: () => getJson<Handler[]>("/api/handlers"),
  instructions: () => getJson<{ text: string }>("/api/instructions"),
  runAgent: (claimId: string) =>
    send<Claim>("POST", `/api/claims/${claimId}/run`),
  runWaiting: () =>
    send<{ claim_ids: string[] }>("POST", "/api/claims/run-waiting"),
  signOff: (claimId: string, handlerId: string) =>
    send<Claim>("POST", `/api/claims/${claimId}/sign-off`, {
      handler_id: handlerId,
    }),
  pay: (claimId: string, amount: number) =>
    send<Claim>("POST", `/api/claims/${claimId}/payment`, { amount }),
};
