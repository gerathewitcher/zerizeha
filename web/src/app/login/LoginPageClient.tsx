"use client";

import { useCallback, useEffect, useState } from "react";

import {
  loginWithGithub,
  loginWithGoogle,
  loginWithYandex,
} from "@/lib/api/auth";
import { health } from "@/lib/api/generated/zerizeha-components";
import ErrorState from "@/components/ui/ErrorState";

export default function LoginPageClient() {
  const [status, setStatus] = useState<"ok" | "error" | "loading">("loading");

  const checkHealth = useCallback(() => {
    const controller = new AbortController();

    setStatus("loading");
    health({}, controller.signal)
      .then(() => setStatus("ok"))
      .catch((err) => {
        console.error("Health check failed", err);
        setStatus("error");
      });

    return () => controller.abort();
  }, []);

  useEffect(() => checkHealth(), [checkHealth]);

  if (status === "error") {
    return (
      <ErrorState
        title="Сервис недоступен"
        message="Не удалось подключиться к API. Попробуйте повторить через пару секунд."
        onAction={checkHealth}
      />
    );
  }

  return (
    <div className="min-h-screen bg-(--bg) text-(--text)">
      <div className="relative min-h-screen overflow-hidden">
        <div className="pointer-events-none absolute -left-48 -top-48 h-130 w-130 rounded-full bg-[radial-gradient(circle_at_center,#2a3a2b,transparent_70%)] opacity-70 blur-3xl" />
        <div className="pointer-events-none absolute -right-50 top-1/3 h-150 w-150 rounded-full bg-[radial-gradient(circle_at_center,#3a2f1c,transparent_70%)] opacity-60 blur-3xl" />
        <div className="pointer-events-none absolute inset-0 bg-[linear-gradient(160deg,rgba(255,255,255,0.04),rgba(0,0,0,0))]" />

        <main className="relative mx-auto flex min-h-screen max-w-6xl flex-col justify-center px-6 py-16 lg:grid lg:grid-cols-[1.1fr_0.9fr] lg:gap-16 lg:py-24">
          <section className="flex flex-col justify-center">
            <div className="mb-6 inline-flex w-fit items-center gap-2 rounded-full border border-(--border) bg-(--panel) px-3 py-1 text-xs uppercase tracking-[0.2em] text-(--muted)">
              invite-only
              <span className="h-1.5 w-1.5 rounded-full bg-(--accent)" />
            </div>
            <h1 className="font-(--font-display) text-4xl leading-tight tracking-tight sm:text-5xl">
              Пространства для общения, где слышен каждый.
            </h1>
            <p className="mt-5 max-w-xl text-lg leading-relaxed text-(--muted)">
              Создавай приватные пространства, собирай голосовые и текстовые
              каналы, общайся без шумного интерфейса.
            </p>
            <div className="mt-8 flex flex-wrap gap-3 text-sm text-(--subtle)">
              <span className="rounded-full border border-(--border) px-3 py-1">
                Приглашения по ссылке
              </span>
              <span className="rounded-full border border-(--border) px-3 py-1">
                Минималистичный чат
              </span>
              <span className="rounded-full border border-(--border) px-3 py-1">
                Голосовые комнаты
              </span>
            </div>
            <div className="mt-10 text-sm text-(--muted)">
              Нет доступа?
              <button className="ml-2 text-(--accent) transition hover:text-(--accent-2)">
                Попросить инвайт
              </button>
            </div>
          </section>

          <section className="mt-10 flex items-center lg:mt-0">
            <div className="w-full rounded-2xl border border-(--border) bg-(--panel) p-8 shadow-(--shadow-2)">
              <div className="mb-8">
                <h2 className="font-(--font-display) text-2xl">
                  Вход в Zerizeha
                </h2>
                <p className="mt-2 text-sm text-(--muted)">
                  Используй Google, GitHub или Yandex, чтобы продолжить.
                </p>
              </div>

              <div className="flex flex-col gap-3">
                <button
                  type="button"
                  onClick={loginWithGoogle}
                  className="flex w-full items-center justify-between rounded-xl border border-(--border) bg-(--panel-2) px-4 py-3 text-left text-sm font-medium transition hover:border-(--accent) hover:text-(--accent)"
                >
                  <span className="flex items-center gap-3">
                    <span className="flex h-9 w-9 items-center justify-center rounded-full bg-(--bg-2)">
                      <svg
                        width="18"
                        height="18"
                        viewBox="0 0 24 24"
                        fill="none"
                        xmlns="http://www.w3.org/2000/svg"
                      >
                        <path
                          d="M21.6 12.227c0-.73-.06-1.435-.18-2.113H12v4h5.39a4.6 4.6 0 0 1-2 3.028v2.5h3.24c1.89-1.74 2.97-4.3 2.97-7.415Z"
                          fill="#C9FF4F"
                        />
                        <path
                          d="M12 22c2.7 0 4.97-.9 6.62-2.43l-3.24-2.5c-.9.6-2.05.97-3.38.97-2.6 0-4.8-1.76-5.58-4.13H3.06v2.6A10 10 0 0 0 12 22Z"
                          fill="#A1A6AE"
                        />
                        <path
                          d="M6.42 13.91a6 6 0 0 1 0-3.82V7.5H3.06a10 10 0 0 0 0 9l3.36-2.6Z"
                          fill="#7C828B"
                        />
                        <path
                          d="M12 6.07c1.47 0 2.8.5 3.85 1.5l2.88-2.87C16.96 3.18 14.69 2 12 2A10 10 0 0 0 3.06 7.5l3.36 2.6C7.2 7.83 9.4 6.07 12 6.07Z"
                          fill="#FFB84D"
                        />
                      </svg>
                    </span>
                    Войти через Google
                  </span>
                  <span className="text-xs text-(--subtle)">OAuth</span>
                </button>

                <button
                  type="button"
                  onClick={loginWithGithub}
                  className="flex w-full items-center justify-between rounded-xl border border-(--border) bg-(--panel-2) px-4 py-3 text-left text-sm font-medium transition hover:border-(--accent) hover:text-(--accent)"
                >
                  <span className="flex items-center gap-3">
                    <span className="flex h-9 w-9 items-center justify-center rounded-full bg-(--bg-2)">
                      <svg
                        width="18"
                        height="18"
                        viewBox="0 0 24 24"
                        fill="none"
                        xmlns="http://www.w3.org/2000/svg"
                      >
                        <path
                          d="M12 2c-5.52 0-10 4.48-10 10 0 4.42 2.87 8.17 6.84 9.49.5.1.68-.22.68-.48v-1.68c-2.78.6-3.37-1.19-3.37-1.19-.46-1.17-1.13-1.48-1.13-1.48-.92-.63.07-.62.07-.62 1.02.07 1.56 1.06 1.56 1.06.9 1.56 2.36 1.11 2.94.85.09-.66.35-1.11.63-1.37-2.22-.25-4.56-1.11-4.56-4.94 0-1.09.39-1.98 1.03-2.68-.1-.25-.45-1.27.1-2.65 0 0 .84-.27 2.75 1.02a9.43 9.43 0 0 1 5 0c1.9-1.29 2.74-1.02 2.74-1.02.55 1.38.2 2.4.1 2.65.64.7 1.03 1.59 1.03 2.68 0 3.84-2.34 4.68-4.58 4.93.36.32.68.94.68 1.9v2.82c0 .26.18.59.69.48A10 10 0 0 0 22 12c0-5.52-4.48-10-10-10Z"
                          fill="#EAECEF"
                        />
                      </svg>
                    </span>
                    Войти через GitHub
                  </span>
                  <span className="text-xs text-(--subtle)">OAuth</span>
                </button>

                <button
                  type="button"
                  onClick={loginWithYandex}
                  className="flex w-full items-center justify-between rounded-xl border border-(--border) bg-(--panel-2) px-4 py-3 text-left text-sm font-medium transition hover:border-(--accent) hover:text-(--accent)"
                >
                  <span className="flex items-center gap-3">
                    <span className="flex h-9 w-9 items-center justify-center rounded-full bg-(--bg-2)">
                      <span className="text-sm font-semibold text-(--text)">Я</span>
                    </span>
                    Войти через Yandex
                  </span>
                  <span className="text-xs text-(--subtle)">OAuth</span>
                </button>
              </div>

              <div className="mt-6 border-t border-(--border) pt-4 text-xs text-(--subtle)">
                Продолжая, ты соглашаешься с правилами сервиса и политикой
                конфиденциальности.
              </div>
            </div>
          </section>
        </main>
      </div>
    </div>
  );
}
