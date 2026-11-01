import { useEffect, useState } from "react";
import { api, type Claim } from "./api";
import { claimTypeLabel, errorMessage, formatUsd } from "./format";
import { anyRunning } from "./progress";
import { StateBadge } from "./StateBadge";

export function QueuePage() {
  const [claims, setClaims] = useState<Claim[]>();
  const [failed, setFailed] = useState(false);
  const [queued, setQueued] = useState<string[]>([]);
  const [error, setError] = useState<string>();

  useEffect(() => {
    api.claims().then(setClaims, () => {
      setFailed(true);
    });
  }, []);

  const running = claims !== undefined && anyRunning(claims, queued);

  useEffect(() => {
    if (!running) return;
    const timer = window.setInterval(() => {
      api.claims().then(setClaims, () => {
        setError("Lost contact with the backend.");
      });
    }, 2000);
    return () => {
      window.clearInterval(timer);
    };
  }, [running]);

  async function runWaiting() {
    setError(undefined);
    try {
      const { claim_ids } = await api.runWaiting();
      setQueued(claim_ids);
    } catch (failure) {
      setError(errorMessage(failure));
    }
  }

  if (failed) return <p className="alert">Could not load the claims queue.</p>;
  if (!claims) return <p>Loading the claims queue…</p>;

  const waiting = claims.filter((claim) => claim.state === "waiting").length;

  return (
    <section>
      <div className="panel-head">
        <h2>Claims queue</h2>
        <button
          type="button"
          disabled={running || waiting === 0}
          onClick={() => void runWaiting()}
        >
          Run agent on all waiting claims ({waiting})
        </button>
      </div>
      {running && (
        <p className="muted">
          The agent is working through the queue. Claims are run one at a time.
        </p>
      )}
      {error && <p className="alert">{error}</p>}
      <div className="table-wrap">
        <table>
          <thead>
            <tr>
              <th scope="col">Claim</th>
              <th scope="col">Type</th>
              <th scope="col">Incident</th>
              <th scope="col" className="num">
                Claimed
              </th>
              <th scope="col">State</th>
            </tr>
          </thead>
          <tbody>
            {claims.map((claim) => (
              <tr key={claim.claim_id}>
                <td>
                  <a className="mono" href={`#/claims/${claim.claim_id}`}>
                    {claim.claim_id}
                  </a>
                </td>
                <td>{claimTypeLabel(claim.claim_type)}</td>
                <td>{claim.incident_location}</td>
                <td className="num">{formatUsd(claim.amount_claimed)}</td>
                <td>
                  <StateBadge state={claim.state} />
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </section>
  );
}
