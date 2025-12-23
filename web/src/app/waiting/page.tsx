"use client";

import { useCallback, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import ErrorState from "@/components/ui/ErrorState";
import { useMe } from "@/lib/me";

type ViewState =
  | { status: "loading" }
  | { status: "error"; message: string; serverError: boolean }
  | { status: "waiting" };

export default function WaitingPage() {
  const router = useRouter();
  const [state, setState] = useState<ViewState>({ status: "loading" });
  const meState = useMe();

  const checkStatus = useCallback(() => {
    setState({ status: "loading" });
    meState.refresh();
  }, [meState]);

  useEffect(() => {
    if (meState.state.status === "loading") {
      setState({ status: "loading" });
      return;
    }

    if (meState.state.status === "error") {
      if (meState.state.httpStatus === 401) {
        router.replace("/login");
        return;
      }
      setState({
        status: "error",
        serverError:
          typeof meState.state.httpStatus === "number" &&
          meState.state.httpStatus >= 500,
        message:
          typeof meState.state.httpStatus === "number" &&
          meState.state.httpStatus >= 500
            ? "Сервер временно недоступен. Попробуйте повторить позже."
            : "Не удалось проверить статус. Попробуйте ещё раз.",
      });
      return;
    }

    if (meState.state.status === "ready") {
      if (meState.state.me.confirmed) {
        router.replace("/spaces");
        return;
      }
      setState({ status: "waiting" });
    }
  }, [meState.state, router]);

  if (state.status === "error") {
    return (
      <ErrorState
        title={state.serverError ? "Сервис недоступен" : "Ошибка"}
        message={state.message}
        onAction={checkStatus}
      />
    );
  }

  return (
    <div className="min-h-screen bg-(--bg) text-(--text)">
      <main className="mx-auto flex min-h-screen max-w-xl flex-col justify-center px-6 py-16 text-center">
        <div className="rounded-3xl border border-(--border) bg-(--panel) p-10 shadow-(--shadow-2)">
          <p className="text-xs uppercase tracking-[0.2em] text-(--subtle)">
            invite-only
          </p>
          <h1 className="mt-4 font-(--font-display) text-3xl tracking-tight">
            Ожидает подтверждения
          </h1>
          <p className="mt-4 text-sm leading-relaxed text-(--muted)">
            Твой аккаунт создан, но доступ к Zerizeha пока не включён. Попроси
            администратора подтвердить доступ и нажми «Проверить ещё раз».
          </p>
          <div className="mt-8 flex flex-col gap-3 sm:flex-row sm:justify-center">
            <button
              type="button"
              onClick={checkStatus}
              className="rounded-xl bg-(--accent) px-5 py-2 text-sm font-medium text-black transition hover:bg-(--accent-2)"
              disabled={state.status === "loading"}
            >
              {state.status === "loading" ? "Проверяем…" : "Проверить ещё раз"}
            </button>
            <button
              type="button"
              onClick={() => router.replace("/login")}
              className="rounded-xl border border-(--border) px-5 py-2 text-sm text-(--muted) transition hover:text-(--accent)"
            >
              Выйти
            </button>
          </div>
        </div>
      </main>
    </div>
  );
}
