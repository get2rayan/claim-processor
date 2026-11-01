import type { AgentEvent, ClaimState } from "./api";

/**
 * The page keeps reloading a claim while the agent works on it. The claim
 * leaves "in progress" when the decision is recorded, but the agent still pays
 * and replies after that, so the run is over only when its final reply is in.
 */
export function isRunning(
  state: ClaimState,
  events: readonly AgentEvent[],
  runRequested: boolean,
): boolean {
  const last = events.at(-1);
  if (last !== undefined) return last.kind !== "reply";
  return state === "in_progress" || (state === "waiting" && runRequested);
}
