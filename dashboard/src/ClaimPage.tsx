import { useEffect, useState, type ReactNode } from "react";
import {
  api,
  type AgentEvent,
  type Claim,
  type Customer,
  type Plan,
  type Policy,
} from "./api";
import { AgentPanel } from "./AgentPanel";
import {
  claimTypeLabel,
  decisionLabels,
  errorMessage,
  formatUsd,
} from "./format";
import { isRunning } from "./progress";
import { SignOffPanel } from "./SignOffPanel";
import { StateBadge } from "./StateBadge";

interface ClaimView {
  claim: Claim;
  policy: Policy;
  customer: Customer;
  plan: Plan;
  events: AgentEvent[];
}

async function loadClaimView(claimId: string): Promise<ClaimView> {
  const claim = await api.claim(claimId);
  const [policy, customer, events] = await Promise.all([
    api.policy(claim.policy_id),
    api.customer(claim.customer_id),
    api.events(claimId),
  ]);
  const plan = await api.plan(policy.plan);
  return { claim, policy, customer, plan, events };
}

async function loadProgress(
  claimId: string,
): Promise<Pick<ClaimView, "claim" | "events">> {
  const [claim, events] = await Promise.all([
    api.claim(claimId),
    api.events(claimId),
  ]);
  return { claim, events };
}

export function ClaimPage({ claimId }: { readonly claimId: string }) {
  const [view, setView] = useState<ClaimView>();
  const [failed, setFailed] = useState(false);
  const [runRequested, setRunRequested] = useState(false);
  const [error, setError] = useState<string>();

  useEffect(() => {
    loadClaimView(claimId).then(setView, () => {
      setFailed(true);
    });
  }, [claimId]);

  const running =
    view !== undefined &&
    isRunning(view.claim.state, view.claim.last_step, runRequested);

  useEffect(() => {
    if (!running) return;
    const timer = window.setInterval(() => {
      loadProgress(claimId).then(
        (progress) => {
          setView((current) => current && { ...current, ...progress });
          if (progress.claim.state !== "waiting") setRunRequested(false);
        },
        () => {
          setError("Lost contact with the backend.");
        },
      );
    }, 1000);
    return () => {
      window.clearInterval(timer);
    };
  }, [claimId, running]);

  async function runAgent() {
    setError(undefined);
    setRunRequested(true);
    try {
      await api.runAgent(claimId);
    } catch (failure) {
      setRunRequested(false);
      setError(errorMessage(failure));
    }
  }

  if (failed) return <p className="alert">Could not load claim {claimId}.</p>;
  if (!view) return <p>Loading claim {claimId}…</p>;

  const { claim, policy, customer, plan, events } = view;
  return (
    <article>
      <p>
        <a href="#/">Back to the queue</a>
      </p>
      <header className="claim-heading">
        <h2 className="mono">{claim.claim_id}</h2>
        <StateBadge state={claim.state} />
      </header>
      <p className="summary">{claim.summary}</p>

      <div className="grid">
        <Panel title="Decision">
          <DecisionFacts claim={claim} />
          {claim.state === "awaiting_signoff" && claim.payout !== null && (
            <SignOffPanel
              claimId={claim.claim_id}
              payout={claim.payout}
              onChanged={(changed) => {
                setView((current) => current && { ...current, claim: changed });
              }}
            />
          )}
        </Panel>
        <Panel title="Claim">
          <dl className="facts">
            <Fact label="Type">{claimTypeLabel(claim.claim_type)}</Fact>
            <Fact label="Incident">
              {claim.incident_date}, {claim.incident_location}
            </Fact>
            <Fact label="Submitted">{claim.submitted_on}</Fact>
            <Fact label="Amount claimed">
              {formatUsd(claim.amount_claimed)}
            </Fact>
          </dl>
        </Panel>
        <Panel title="Policy">
          <dl className="facts">
            <Fact label="Policy">{policy.policy_id}</Fact>
            <Fact label="Plan">
              {plan.name}, deductible {formatUsd(plan.deductible)}
            </Fact>
            <Fact label="Trip">
              {policy.trip.destination}, {policy.trip.departs_on} to{" "}
              {policy.trip.returns_on}
            </Fact>
            <Fact label="Travelers">{policy.travelers.join(", ")}</Fact>
            <Fact label="Add-ons">
              {policy.add_ons.length > 0 ? policy.add_ons.join(", ") : "None"}
            </Fact>
          </dl>
        </Panel>
        <Panel title="Customer">
          <dl className="facts">
            <Fact label="Name">{customer.name}</Fact>
            <Fact label="Email">{customer.email}</Fact>
            <Fact label="Customer since">{customer.customer_since}</Fact>
          </dl>
          <h4>Claim history</h4>
          {customer.previous_claims.length === 0 ? (
            <p>No earlier claims.</p>
          ) : (
            <ul className="history">
              {customer.previous_claims.map((earlier) => (
                <li key={earlier.claim_id}>
                  <span className="mono">{earlier.claim_id}</span>{" "}
                  {earlier.summary}, {earlier.outcome},{" "}
                  {formatUsd(earlier.amount_paid)}
                </li>
              ))}
            </ul>
          )}
        </Panel>
      </div>

      <Panel title="Story">
        <p>{claim.story}</p>
      </Panel>

      <AgentPanel
        state={claim.state}
        events={events}
        running={running}
        error={error}
        onRun={() => void runAgent()}
      />

      <Panel title="Items">
        <div className="table-wrap">
          <table>
            <thead>
              <tr>
                <th scope="col">Description</th>
                <th scope="col">Category</th>
                <th scope="col" className="num">
                  Amount
                </th>
              </tr>
            </thead>
            <tbody>
              {claim.items.map((item) => (
                <tr key={item.description}>
                  <td>{item.description}</td>
                  <td>{item.category}</td>
                  <td className="num">{formatUsd(item.amount)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </Panel>

      <Panel title="Documents">
        {claim.documents.map((document) => (
          <details key={document.name} className="document">
            <summary>
              {document.name} <span className="muted">({document.type})</span>
            </summary>
            <p>{document.content}</p>
          </details>
        ))}
      </Panel>
    </article>
  );
}

function DecisionFacts({ claim }: { readonly claim: Claim }) {
  if (claim.decision === null) return <p>No decision yet.</p>;
  return (
    <dl className="facts">
      <Fact label="Decision">{decisionLabels[claim.decision]}</Fact>
      <Fact label="Payout">{formatUsd(claim.payout)}</Fact>
      <Fact label="Paid">
        {claim.paid_amount === null ? "Not paid" : formatUsd(claim.paid_amount)}
      </Fact>
      <Fact label="Policy section">{claim.policy_section}</Fact>
      <Fact label="Reason">{claim.reason}</Fact>
    </dl>
  );
}

function Panel({
  title,
  children,
}: {
  readonly title: string;
  readonly children: ReactNode;
}) {
  return (
    <section className="panel">
      <h3>{title}</h3>
      {children}
    </section>
  );
}

function Fact({
  label,
  children,
}: {
  readonly label: string;
  readonly children: ReactNode;
}) {
  return (
    <>
      <dt>{label}</dt>
      <dd>{children}</dd>
    </>
  );
}
