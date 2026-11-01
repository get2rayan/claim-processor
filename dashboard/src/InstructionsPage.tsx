import { useEffect, useState } from "react";
import { api } from "./api";

export function InstructionsPage() {
  const [text, setText] = useState<string>();
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    api.instructions().then(
      (instructions) => {
        setText(instructions.text);
      },
      () => {
        setFailed(true);
      },
    );
  }, []);

  if (failed) return <p className="alert">Could not load the instructions.</p>;
  if (text === undefined) return <p>Loading the instructions…</p>;

  return (
    <section>
      <h2>The UnderCover Agent&rsquo;s instructions</h2>
      <p className="muted">
        Read only. The agent follows these on every claim.
      </p>
      <pre className="panel instructions">{text}</pre>
    </section>
  );
}
