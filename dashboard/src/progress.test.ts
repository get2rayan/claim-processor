import { expect, it } from "vitest";
import type { AgentEvent } from "./api";
import { isRunning } from "./progress";

const step: AgentEvent = {
  actor: "UnderCover Agent",
  kind: "tool_call",
  text: "get_claim",
};
const reply: AgentEvent = {
  actor: "UnderCover Agent",
  kind: "reply",
  text: "Done.",
};

it("keeps polling while the agent works on a claim", () => {
  expect(isRunning("in_progress", [], false)).toBe(true);
  expect(isRunning("decided", [step], false)).toBe(true);
});

it("polls from a run request until the claim leaves waiting", () => {
  expect(isRunning("waiting", [], true)).toBe(true);
  expect(isRunning("waiting", [], false)).toBe(false);
});

it("stops polling once the agent has replied", () => {
  expect(isRunning("decided", [step, reply], false)).toBe(false);
  expect(isRunning("awaiting_signoff", [step, reply], false)).toBe(false);
});
