"use client";

type ModalProps = {
  open: boolean;
  title: string;
  description?: string;
  onClose: () => void;
  children: React.ReactNode;
};

export default function Modal({
  open,
  title,
  description,
  onClose,
  children,
}: ModalProps) {
  if (!open) {
    return null;
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center px-6 py-10">
      <button
        className="absolute inset-0 bg-black/50 backdrop-blur-sm"
        onClick={onClose}
        aria-label="Закрыть модальное окно"
      />
      <div className="relative w-full max-w-md rounded-2xl border border-(--border) bg-(--panel) p-6 shadow-(--shadow-2)">
        <div className="mb-6">
          <h3 className="font-(--font-display) text-xl">{title}</h3>
          {description && (
            <p className="mt-2 text-sm text-(--muted)">{description}</p>
          )}
        </div>
        {children}
      </div>
    </div>
  );
}
