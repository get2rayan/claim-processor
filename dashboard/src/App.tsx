import { useEffect, useState } from "react";
import { api } from "./api";
import { ClaimPage } from "./ClaimPage";
import { InstructionsPage } from "./InstructionsPage";
import { QueuePage } from "./QueuePage";

function useHash(): string {
  const [hash, setHash] = useState(window.location.hash);

  useEffect(() => {
    const onChange = () => {
      setHash(window.location.hash);
    };
    window.addEventListener("hashchange", onChange);
    return () => {
      window.removeEventListener("hashchange", onChange);
    };
  }, []);

  return hash;
}

function BackendStatus() {
  const [status, setStatus] = useState("checking");

  useEffect(() => {
    api.health().then(
      () => {
        setStatus("up");
      },
      () => {
        setStatus("down");
      },
    );
  }, []);

  return <p className="status">Backend: {status}</p>;
}

function Page({ hash }: { readonly hash: string }) {
  const claim = /^#\/claims\/([^/]+)$/.exec(hash);
  if (claim?.[1]) return <ClaimPage claimId={decodeURIComponent(claim[1])} />;
  if (hash === "#/instructions") return <InstructionsPage />;
  return <QueuePage />;
}

export function App() {
  const hash = useHash();
  return (
    <>
      <header className="site-header">
        <h1>UnderCover</h1>
        <nav>
          <a href="#/">Claims queue</a>
          <a href="#/instructions">Agent instructions</a>
        </nav>
        <BackendStatus />
      </header>
      <main>
        <Page hash={hash} />
      </main>
    </>
  );
}
