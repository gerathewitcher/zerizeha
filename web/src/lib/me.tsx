"use client";

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
} from "react";

import { getMe } from "@/lib/api/generated/zerizeha-components";
import { getHttpStatus } from "@/lib/api/errors";
import type { User } from "@/lib/api/generated/zerizeha-schemas";

type MeState =
  | { status: "loading" }
  | { status: "ready"; me: User }
  | { status: "error"; httpStatus?: number };

type MeContextValue = {
  state: MeState;
  refresh: () => void;
};

const MeContext = createContext<MeContextValue | null>(null);

export function MeProvider({ children }: { children: React.ReactNode }) {
  const [state, setState] = useState<MeState>({ status: "loading" });

  const load = useCallback(() => {
    const controller = new AbortController();
    setState({ status: "loading" });

    getMe({}, controller.signal)
      .then((me) => setState({ status: "ready", me }))
      .catch((err) => {
        const httpStatus = getHttpStatus(err);
        setState({ status: "error", httpStatus });
      });

    return () => controller.abort();
  }, []);

  useEffect(() => load(), [load]);

  const value = useMemo<MeContextValue>(
    () => ({
      state,
      refresh: () => {
        load();
      },
    }),
    [load, state],
  );

  return <MeContext.Provider value={value}>{children}</MeContext.Provider>;
}

export function useMe() {
  const ctx = useContext(MeContext);
  if (!ctx) {
    throw new Error("useMe must be used within MeProvider");
  }
  return ctx;
}

