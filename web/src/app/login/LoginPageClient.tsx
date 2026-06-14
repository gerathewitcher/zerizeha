"use client";

import type { FormEvent } from "react";
import { useCallback, useEffect, useState } from "react";

import {
  confirmRegistration,
  confirmPasswordSetup,
  loginWithPassword,
  loginWithYandex,
  registerWithPassword,
  requestPasswordSetup,
} from "@/lib/api/auth";
import { health } from "@/lib/api/generated/zerizeha-components";
import DesktopDownloadButton from "@/components/ui/DesktopDownloadButton";
import ErrorState from "@/components/ui/ErrorState";

export default function LoginPageClient() {
  const [status, setStatus] = useState<"ok" | "error" | "loading">("loading");
  const [setupToken, setSetupToken] = useState("");
  const [confirmToken, setConfirmToken] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [showConfirmPassword, setShowConfirmPassword] = useState(false);
  const [authMode, setAuthMode] = useState<"login" | "register" | "reset">(
    "login",
  );
  const [formStatus, setFormStatus] = useState<"idle" | "submitting" | "sent">(
    "idle",
  );
  const [formError, setFormError] = useState("");

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

  useEffect(() => {
    if (typeof window === "undefined") return;
    const params = new URLSearchParams(window.location.search);
    setSetupToken(params.get("setup_token") ?? "");
    setConfirmToken(params.get("confirm_token") ?? "");
  }, []);

  const goToSpaces = () => {
    window.location.assign("/spaces");
  };

  useEffect(() => {
    if (!confirmToken) return;

    setFormError("");
    setFormStatus("submitting");
    confirmRegistration(confirmToken)
      .then(goToSpaces)
      .catch((err) => {
        console.error("Registration confirmation failed", err);
        setFormError("Ссылка подтверждения недействительна или устарела.");
        setFormStatus("idle");
      });
  }, [confirmToken]);

  const handlePasswordLogin = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setFormError("");
    setFormStatus("submitting");
    try {
      await loginWithPassword(email, password);
      goToSpaces();
    } catch (err) {
      console.error("Password login failed", err);
      setFormError("Не удалось войти. Проверь email и пароль.");
      setFormStatus("idle");
    }
  };

  const handlePasswordRegister = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setFormError("");
    if (password !== confirmPassword) {
      setFormError("Пароли не совпадают.");
      return;
    }
    setFormStatus("submitting");
    try {
      await registerWithPassword(email, password);
      setFormStatus("sent");
    } catch (err) {
      console.error("Password registration failed", err);
      setFormError("Не удалось зарегистрироваться. Возможно, этот email уже используется.");
      setFormStatus("idle");
    }
  };

  const handlePasswordSetupRequest = async (
    event?: FormEvent<HTMLFormElement>,
  ) => {
    event?.preventDefault();
    const normalizedEmail = email.trim();
    if (!normalizedEmail) {
      setFormError("Укажи email аккаунта.");
      return;
    }
    setFormError("");
    setFormStatus("submitting");
    try {
      await requestPasswordSetup(normalizedEmail);
      setFormStatus("sent");
    } catch (err) {
      console.error("Password setup request failed", err);
      setFormError("Не удалось отправить письмо. Попробуй позже.");
      setFormStatus("idle");
    }
  };

  const handlePasswordSetupConfirm = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setFormError("");
    if (password !== confirmPassword) {
      setFormError("Пароли не совпадают.");
      return;
    }
    setFormStatus("submitting");
    try {
      await confirmPasswordSetup(setupToken, password);
      goToSpaces();
    } catch (err) {
      console.error("Password setup failed", err);
      setFormError("Ссылка недействительна или пароль слишком короткий.");
      setFormStatus("idle");
    }
  };

  const switchAuthMode = (mode: "login" | "register" | "reset") => {
    setAuthMode(mode);
    setFormError("");
    setFormStatus("idle");
    setPassword("");
    setConfirmPassword("");
    setShowPassword(false);
    setShowConfirmPassword(false);
  };

  const passwordInput = ({
    label,
    value,
    onChange,
    visible,
    onToggle,
  }: {
    label: string;
    value: string;
    onChange: (value: string) => void;
    visible: boolean;
    onToggle: () => void;
  }) => (
    <label className="flex flex-col gap-2 text-sm">
      <span className="font-medium">{label}</span>
      <span className="relative">
        <input
          type={visible ? "text" : "password"}
          minLength={8}
          value={value}
          onChange={(event) => onChange(event.target.value)}
          className="w-full rounded-xl border border-(--border) bg-(--panel-2) px-4 py-3 pr-12 text-(--text) outline-none transition focus:border-(--accent)"
          required
        />
        <button
          type="button"
          onClick={onToggle}
          aria-label={visible ? "Скрыть пароль" : "Показать пароль"}
          title={visible ? "Скрыть пароль" : "Показать пароль"}
          className="absolute right-3 top-1/2 flex h-7 w-7 -translate-y-1/2 items-center justify-center rounded-md text-(--muted) transition hover:text-(--accent)"
        >
          {visible ? (
            <svg
              aria-hidden="true"
              className="h-4 w-4"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2"
              strokeLinecap="round"
              strokeLinejoin="round"
            >
              <path d="M3 3l18 18" />
              <path d="M10.6 10.6a2 2 0 0 0 2.8 2.8" />
              <path d="M9.9 4.2A10.4 10.4 0 0 1 12 4c5 0 9 4.5 10 8a11.8 11.8 0 0 1-2.1 3.5" />
              <path d="M6.6 6.6C4.4 8.1 2.8 10.3 2 12c1 3.5 5 8 10 8a10.8 10.8 0 0 0 4.1-.8" />
            </svg>
          ) : (
            <svg
              aria-hidden="true"
              className="h-4 w-4"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2"
              strokeLinecap="round"
              strokeLinejoin="round"
            >
              <path d="M2 12s4-8 10-8 10 8 10 8-4 8-10 8S2 12 2 12z" />
              <circle cx="12" cy="12" r="3" />
            </svg>
          )}
        </button>
      </span>
    </label>
  );

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
            <DesktopDownloadButton
              menuPlacement="right"
              wrapperClassName="relative mt-10 w-fit"
              className="flex w-fit items-center gap-3 rounded-xl border border-(--border) bg-(--panel) px-4 py-3 text-left text-sm font-medium text-(--text) shadow-(--shadow-1) transition hover:border-(--accent) hover:text-(--accent)"
            />
          </section>

          <section className="mt-10 flex items-center lg:mt-0">
            <div className="w-full rounded-2xl border border-(--border) bg-(--panel) p-8 shadow-(--shadow-2)">
              <div className="mb-8">
                <h2 className="font-(--font-display) text-2xl">
                  {setupToken
                    ? "Установка пароля"
                    : confirmToken
                      ? "Подтверждение регистрации"
                    : authMode === "reset"
                      ? "Восстановление пароля"
                    : authMode === "login"
                      ? "Вход в Zerizeha"
                      : "Регистрация в Zerizeha"}
                </h2>
                <p className="mt-2 text-sm text-(--muted)">
                  {setupToken
                    ? "Придумай новый пароль для своего аккаунта."
                    : confirmToken
                      ? "Проверяем ссылку из письма."
                    : authMode === "reset"
                      ? "Укажи email аккаунта, и мы отправим ссылку для установки нового пароля."
                    : authMode === "login"
                      ? "Войди по email и паролю или подключи пароль к существующему аккаунту."
                      : "Создай аккаунт по email и подтверди его письмом."}
                </p>
              </div>

              {confirmToken ? (
                <div className="flex flex-col gap-3">
                  {formError ? (
                    <p className="text-sm text-red-300">{formError}</p>
                  ) : (
                    <p className="text-sm text-(--muted)">
                      {formStatus === "submitting"
                        ? "Подтверждаем email..."
                        : "Email подтвержден."}
                    </p>
                  )}
                </div>
              ) : setupToken ? (
                <form className="flex flex-col gap-3" onSubmit={handlePasswordSetupConfirm}>
                  {passwordInput({
                    label: "Новый пароль",
                    value: password,
                    onChange: setPassword,
                    visible: showPassword,
                    onToggle: () => setShowPassword((value) => !value),
                  })}
                  {passwordInput({
                    label: "Повтори пароль",
                    value: confirmPassword,
                    onChange: setConfirmPassword,
                    visible: showConfirmPassword,
                    onToggle: () => setShowConfirmPassword((value) => !value),
                  })}
                  {formError && <p className="text-sm text-red-300">{formError}</p>}
                  <button
                    type="submit"
                    disabled={formStatus === "submitting"}
                    className="rounded-xl border border-(--accent) bg-(--accent) px-4 py-3 text-sm font-semibold text-black transition disabled:cursor-not-allowed disabled:opacity-60"
                  >
                    {formStatus === "submitting" ? "Сохраняем..." : "Установить пароль"}
                  </button>
                </form>
              ) : authMode === "reset" ? (
                <form
                  className="flex flex-col gap-3"
                  onSubmit={handlePasswordSetupRequest}
                >
                  <label className="flex flex-col gap-2 text-sm">
                    <span className="font-medium">Email</span>
                    <input
                      type="email"
                      value={email}
                      onChange={(event) => setEmail(event.target.value)}
                      className="rounded-xl border border-(--border) bg-(--panel-2) px-4 py-3 text-(--text) outline-none transition focus:border-(--accent)"
                      required
                    />
                  </label>
                  {formError && <p className="text-sm text-red-300">{formError}</p>}
                  {formStatus === "sent" && (
                    <p className="text-sm text-(--muted)">
                      Если аккаунт с таким email существует, письмо для установки пароля отправлено.
                    </p>
                  )}
                  <button
                    type="submit"
                    disabled={formStatus === "submitting"}
                    className="rounded-xl border border-(--accent) bg-(--accent) px-4 py-3 text-sm font-semibold text-black transition disabled:cursor-not-allowed disabled:opacity-60"
                  >
                    {formStatus === "submitting" ? "Отправляем..." : "Отправить письмо"}
                  </button>
                  <button
                    type="button"
                    onClick={() => switchAuthMode("login")}
                    className="w-fit self-start text-xs text-(--muted) transition hover:text-(--accent)"
                  >
                    Вернуться ко входу
                  </button>
                </form>
              ) : (
                <form
                  className="flex flex-col gap-3"
                  onSubmit={
                    authMode === "login"
                      ? handlePasswordLogin
                      : handlePasswordRegister
                  }
                >
                  <div className="grid grid-cols-2 rounded-xl border border-(--border) bg-(--panel-2) p-1 text-sm">
                    <button
                      type="button"
                      onClick={() => switchAuthMode("login")}
                      className={`rounded-lg px-3 py-2 font-medium transition ${
                        authMode === "login"
                          ? "bg-(--accent) text-black"
                          : "text-(--muted) hover:text-(--text)"
                      }`}
                    >
                      Вход
                    </button>
                    <button
                      type="button"
                      onClick={() => switchAuthMode("register")}
                      className={`rounded-lg px-3 py-2 font-medium transition ${
                        authMode === "register"
                          ? "bg-(--accent) text-black"
                          : "text-(--muted) hover:text-(--text)"
                      }`}
                    >
                      Регистрация
                    </button>
                  </div>
                  <label className="flex flex-col gap-2 text-sm">
                    <span className="font-medium">Email</span>
                    <input
                      type="email"
                      value={email}
                      onChange={(event) => setEmail(event.target.value)}
                      className="rounded-xl border border-(--border) bg-(--panel-2) px-4 py-3 text-(--text) outline-none transition focus:border-(--accent)"
                      required
                    />
                  </label>
                  {passwordInput({
                    label: "Пароль",
                    value: password,
                    onChange: setPassword,
                    visible: showPassword,
                    onToggle: () => setShowPassword((value) => !value),
                  })}
                  {authMode === "register" &&
                    passwordInput({
                      label: "Повтори пароль",
                      value: confirmPassword,
                      onChange: setConfirmPassword,
                      visible: showConfirmPassword,
                      onToggle: () => setShowConfirmPassword((value) => !value),
                    })}
                  {formError && <p className="text-sm text-red-300">{formError}</p>}
                  {formStatus === "sent" && (
                    <p className="text-sm text-(--muted)">
                      Мы отправили письмо для подтверждения регистрации.
                    </p>
                  )}
                  <button
                    type="submit"
                    disabled={formStatus === "submitting"}
                    className="rounded-xl border border-(--accent) bg-(--accent) px-4 py-3 text-sm font-semibold text-black transition disabled:cursor-not-allowed disabled:opacity-60"
                  >
                    {formStatus === "submitting"
                      ? authMode === "login"
                        ? "Входим..."
                        : "Создаем..."
                      : authMode === "login"
                        ? "Войти"
                        : "Зарегистрироваться"}
                  </button>
                  {authMode === "login" && (
                    <button
                      type="button"
                      onClick={() => switchAuthMode("reset")}
                      disabled={formStatus === "submitting"}
                      className="w-fit self-start text-xs text-(--muted) transition hover:text-(--accent) disabled:cursor-not-allowed disabled:opacity-60"
                    >
                      Забыли пароль?
                    </button>
                  )}
                </form>
              )}

              <div className="mt-6 flex flex-col gap-3 border-t border-(--border) pt-6">
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
