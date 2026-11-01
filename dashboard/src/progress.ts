import type { Claim, ClaimState } from "./api";

const finishedSteps = ["reply", "error"];

/**
 * The page keeps reloading a claim while the agent works on it. The claim
 * leaves "in progress" when the decision is recorded, but the agent still pays
 * and replies after that, so a run is over only when its last step is its reply
 * or an error.
 */
export function isRunning(
  state: ClaimState,
  lastStep: string | null,
  runRequested: boolean,
): boolean {
  if (lastStep !== null) return !finishedSteps.includes(lastStep);
  return state === "in_progress" || (state === "waiting" && runRequested);
}

/** Whether any claim in the queue is still being worked on. */
export function anyRunning(
  claims: readonly Claim[],
  queued: readonly string[],
): boolean {
  return claims.some((claim) =>
    isRunning(claim.state, claim.last_step, queued.includes(claim.claim_id)),
  );
}
