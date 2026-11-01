import type { AgentEvent, ClaimState } from "./api";

export function AgentPanel({
  state,
  events,
  running,
  error,
  onRun,
}: {
  readonly state: ClaimState;
  readonly events: readonly AgentEvent[];
  readonly running: boolean;
  readonly error: string | undefined;
  readonly onRun: () => void;
}) {
  return (
    <section className="panel">
      <div className="panel-head">
        <h3>Agent steps</h3>
        {state === "waiting" && (
          <button type="button" onClick={onRun}>
            Run agent
          </button>
        )}
      </div>
      {running && <p className="muted">The agent is working on this claim…</p>}
      {error && <p className="alert">{error}</p>}
      {events.length === 0 ? (
        <p>No steps yet.</p>
      ) : (
        <ol className="steps">
          {events.map((event, index) => (
            <li key={index}>
              <span className="mono muted">{event.kind}</span> {event.text}
            </li>
          ))}
        </ol>
      )}
    </section>
  );
}
