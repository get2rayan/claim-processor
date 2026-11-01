import type { ClaimState } from "./api";
import { stateLabels } from "./format";

export function StateBadge({ state }: { readonly state: ClaimState }) {
  return <span className={`badge badge-${state}`}>{stateLabels[state]}</span>;
}
