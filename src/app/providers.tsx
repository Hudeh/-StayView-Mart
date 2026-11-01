"use client";

import { ApolloProvider } from "@apollo/client";
import { useEffect, useMemo, useState } from "react";
import { apiReadyFor, resolveBranchApi } from "@/lib/api";
import { createMartClient } from "@/lib/apollo";
import { StayViewMartMark } from "@/components/StayViewMark";
import { getPropertyCode } from "@/lib/property";

function BranchApiGate({ children }: { children: React.ReactNode }) {
  const [state, setState] = useState<"pending" | "ready" | "missing" | "error">("pending");
  const [message, setMessage] = useState("");

  useEffect(() => {
    const property = getPropertyCode();
    if (!property) {
      setState("missing");
      return;
    }
    if (apiReadyFor(property)) {
      setState("ready");
      return;
    }
    let cancelled = false;
    resolveBranchApi(property)
      .then(() => {
        if (!cancelled) setState("ready");
      })
      .catch((err: unknown) => {
        if (cancelled) return;
        setMessage(err instanceof Error ? err.message : "Could not find that property.");
        setState("error");
      });
    return () => {
      cancelled = true;
    };
  }, []);

  if (state === "ready") return children;
  return (
    <main className="login">
      <StayViewMartMark />
      {state === "pending" ? <p>Finding this property…</p> : null}
      {state === "missing" ? (
        <p>Open this till from the property address. The property code is part of that address.</p>
      ) : null}
      {state === "error" ? <p className="error">{message}</p> : null}
    </main>
  );
}

export function Providers({ children }: { children: React.ReactNode }) {
  const client = useMemo(() => createMartClient(), []);
  return (
    <ApolloProvider client={client}>
      <BranchApiGate>{children}</BranchApiGate>
    </ApolloProvider>
  );
}
