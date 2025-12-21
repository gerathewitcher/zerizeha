"use client";

type ErrorStateProps = {
  title?: string;
  message?: string;
  actionLabel?: string;
  onAction?: () => void;
};

export default function ErrorState({
  title = "Что-то пошло не так",
  message = "Попробуйте обновить страницу или повторить попытку позже.",
  actionLabel = "Повторить",
  onAction,
}: ErrorStateProps) {
  return (
    <div className="flex min-h-[60vh] items-center justify-center px-6">
      <div className="w-full max-w-lg rounded-2xl border border-(--border) bg-(--panel) p-6 shadow-(--shadow-2)">
        <h2 className="font-(--font-display) text-xl">{title}</h2>
        <p className="mt-2 text-sm text-(--muted)">{message}</p>
        {onAction ? (
          <div className="mt-6">
            <button
              type="button"
              onClick={onAction}
              className="rounded-xl border border-(--border) px-4 py-2 text-sm text-(--muted) transition hover:text-(--accent)"
            >
              {actionLabel}
            </button>
          </div>
        ) : null}
      </div>
    </div>
  );
}

