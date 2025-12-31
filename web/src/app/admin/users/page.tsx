"use client";

import { useCallback, useEffect } from "react";
import { useRouter } from "next/navigation";
import { useMe } from "@/lib/me";
import AdminUsersPanel from "@/components/admin/AdminUsersPanel";

export default function AdminUsersPage() {
  const router = useRouter();
  const meState = useMe();

  const redirectToLogin = useCallback(() => {
    router.replace("/login");
  }, [router]);

  const redirectToSpaces = useCallback(() => {
    router.replace("/spaces");
  }, [router]);

  useEffect(() => {
    if (meState.state.status === "loading") return;
    if (meState.state.status === "error") {
      if (meState.state.httpStatus === 401) {
        redirectToLogin();
        return;
      }
    }
    if (meState.state.status === "ready" && !meState.state.me.is_admin) {
      redirectToSpaces();
    }
  }, [meState.state, redirectToLogin, redirectToSpaces]);

  if (meState.state.status !== "ready") {
    return (
      <div className="min-h-screen bg-(--bg) text-(--text)">
        <main className="mx-auto flex min-h-screen max-w-5xl items-center justify-center px-6">
          <p className="text-sm text-(--muted)">Загрузка…</p>
        </main>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-(--bg) text-(--text)">
      <header className="border-b border-(--border) bg-(--panel)">
        <div className="mx-auto flex max-w-5xl items-center justify-between gap-4 px-6 py-5">
          <div>
            <p className="text-xs uppercase tracking-[0.2em] text-(--subtle)">
              Admin
            </p>
            <h1 className="mt-2 font-(--font-display) text-2xl">
              Пользователи
            </h1>
          </div>
          <button
            className="rounded-xl border border-(--border) px-4 py-2 text-sm text-(--muted) transition hover:text-(--accent)"
            onClick={() => router.push("/spaces")}
          >
            В приложение
          </button>
        </div>
      </header>

      <main className="mx-auto max-w-5xl px-6 py-8">
        <AdminUsersPanel
          onUnauthenticated={redirectToLogin}
          onUnauthorized={redirectToSpaces}
        />
      </main>
    </div>
  );
}
