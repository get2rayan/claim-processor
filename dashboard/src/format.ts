import type { ClaimState, Decision } from "./api";

const dollars = new Intl.NumberFormat("en-US", {
  style: "currency",
  currency: "USD",
});

export function formatUsd(amount: number | null): string {
  return amount === null ? "—" : dollars.format(amount);
}

export const stateLabels: Record<ClaimState, string> = {
  waiting: "Waiting",
  in_progress: "In progress",
  awaiting_signoff: "Waiting for sign-off",
  decided: "Decided",
};

export function claimTypeLabel(claimType: string): string {
  return claimType.replaceAll("_", " ");
}

export const decisionLabels: Record<Decision, string> = {
  approve: "Approved",
  decline: "Declined",
  refer: "Referred",
};

export function errorMessage(failure: unknown): string {
  return failure instanceof Error ? failure.message : "Something went wrong.";
}
