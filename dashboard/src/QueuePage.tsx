import { useEffect, useState } from "react";
import { api, type Claim } from "./api";
import { claimTypeLabel, formatUsd } from "./format";
import { StateBadge } from "./StateBadge";

export function QueuePage() {
  const [claims, setClaims] = useState<Claim[]>();
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    api.claims().then(setClaims, () => {
      setFailed(true);
    });
  }, []);

  if (failed) return <p className="alert">Could not load the claims queue.</p>;
  if (!claims) return <p>Loading the claims queue…</p>;

  return (
    <section>
      <h2>Claims queue</h2>
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
