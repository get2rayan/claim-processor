import { useEffect, useState } from "react";
import { api, type Claim, type Handler } from "./api";
import { errorMessage, formatUsd } from "./format";

export function SignOffPanel({
  claimId,
  payout,
  onChanged,
}: {
  readonly claimId: string;
  readonly payout: number;
  readonly onChanged: (claim: Claim) => void;
}) {
  const [handlers, setHandlers] = useState<Handler[]>([]);
  const [handlerId, setHandlerId] = useState("");
  const [error, setError] = useState<string>();

  useEffect(() => {
    api.handlers().then(
      (list) => {
        setHandlers(list);
        setHandlerId(list.at(0)?.handler_id ?? "");
      },
      () => {
        setError("Could not load the handlers.");
      },
    );
  }, []);

  async function signOffAndPay() {
    setError(undefined);
    try {
      await api.signOff(claimId, handlerId);
      onChanged(await api.pay(claimId, payout));
    } catch (failure) {
      setError(errorMessage(failure));
    }
  }

  return (
    <div className="signoff">
      <p>
        This payout is over the approval limit, so payment waits for a
        handler&rsquo;s sign-off.
      </p>
      <label>
        Handler{" "}
        <select
          value={handlerId}
          onChange={(event) => {
            setHandlerId(event.target.value);
          }}
        >
          {handlers.map((handler) => (
            <option key={handler.handler_id} value={handler.handler_id}>
              {handler.name}
            </option>
          ))}
        </select>
      </label>
      <button
        type="button"
        disabled={handlerId === ""}
        onClick={() => void signOffAndPay()}
      >
        Sign off and pay {formatUsd(payout)}
      </button>
      {error && <p className="alert">{error}</p>}
    </div>
  );
}
