"use client";

import type { ReactNode } from "react";
import { createPortal } from "react-dom";
import { useEffect, useLayoutEffect, useRef, useState } from "react";

type TooltipProps = {
  label: string;
  side?: "top" | "bottom" | "left" | "right";
  children: ReactNode;
};

export default function Tooltip({ label, side = "top", children }: TooltipProps) {
  const triggerRef = useRef<HTMLSpanElement | null>(null);
  const [open, setOpen] = useState(false);
  const [render, setRender] = useState(false);
  const [visible, setVisible] = useState(false);
  const [coords, setCoords] = useState({ x: 0, y: 0 });
  const arrowPosition =
    side === "bottom"
      ? "after:top-0 after:-translate-y-full before:top-0 before:-translate-y-full"
      : side === "top"
        ? "after:bottom-0 after:translate-y-full before:bottom-0 before:translate-y-full"
        : side === "left"
          ? "after:right-0 after:translate-x-full before:right-0 before:translate-x-full"
          : "after:left-0 after:-translate-x-full before:left-0 before:-translate-x-full";
  const arrowBorder =
    side === "bottom"
      ? "after:border-x-[6px] after:border-b-[6px] after:border-x-transparent after:border-b-(--border)"
      : side === "top"
        ? "after:border-x-[6px] after:border-t-[6px] after:border-x-transparent after:border-t-(--border)"
        : side === "left"
          ? "after:border-y-[6px] after:border-l-[6px] after:border-y-transparent after:border-l-(--border)"
          : "after:border-y-[6px] after:border-r-[6px] after:border-y-transparent after:border-r-(--border)";
  const arrowFillPosition =
    side === "bottom"
      ? "before:translate-y-[1px]"
      : side === "top"
        ? "before:-translate-y-[1px]"
        : side === "left"
          ? "before:-translate-x-[1px]"
          : "before:translate-x-[1px]";
  const arrowFill =
    side === "bottom"
      ? "before:border-x-[5px] before:border-b-[5px] before:border-x-transparent before:border-b-(--panel)"
      : side === "top"
        ? "before:border-x-[5px] before:border-t-[5px] before:border-x-transparent before:border-t-(--panel)"
        : side === "left"
          ? "before:border-y-[5px] before:border-l-[5px] before:border-y-transparent before:border-l-(--panel)"
          : "before:border-y-[5px] before:border-r-[5px] before:border-y-transparent before:border-r-(--panel)";

  useEffect(() => {
    if (open) {
      setRender(true);
      const frame = requestAnimationFrame(() => setVisible(true));
      return () => cancelAnimationFrame(frame);
    }
    setVisible(false);
    const timer = window.setTimeout(() => setRender(false), 120);
    return () => window.clearTimeout(timer);
  }, [open]);

  const updatePosition = () => {
    const element = triggerRef.current;
    if (!element) return;
    const rect = element.getBoundingClientRect();
    if (side === "left") {
      setCoords({ x: rect.left, y: rect.top + rect.height / 2 });
      return;
    }
    if (side === "right") {
      setCoords({ x: rect.right, y: rect.top + rect.height / 2 });
      return;
    }
    setCoords({
      x: rect.left + rect.width / 2,
      y: side === "bottom" ? rect.bottom : rect.top,
    });
  };

  useLayoutEffect(() => {
    if (!render) return;
    updatePosition();
  }, [render, side]);

  useEffect(() => {
    if (!render) return;
    const handler = () => updatePosition();
    window.addEventListener("scroll", handler, true);
    window.addEventListener("resize", handler);
    return () => {
      window.removeEventListener("scroll", handler, true);
      window.removeEventListener("resize", handler);
    };
  }, [render, side]);

  const tooltip = render ? (
    <span
      className={`pointer-events-none fixed z-[9999] whitespace-nowrap rounded-lg bg-(--panel) px-2 py-1 text-[11px] text-(--text) shadow-[0_0_0_1px_var(--border),var(--shadow-2)] transition-opacity duration-150 before:content-[''] after:content-[''] before:absolute after:absolute before:h-0 before:w-0 after:h-0 after:w-0 ${
        side === "left" || side === "right"
          ? "before:top-1/2 after:top-1/2 before:-translate-y-1/2 after:-translate-y-1/2"
          : "before:left-1/2 after:left-1/2 before:-translate-x-1/2 after:-translate-x-1/2"
      } ${arrowBorder} ${arrowFillPosition} ${arrowFill} ${arrowPosition} ${
        visible ? "opacity-100" : "opacity-0"
      }`}
      style={{
        left: coords.x,
        top:
          side === "left" || side === "right"
            ? coords.y
            : side === "bottom"
              ? coords.y + 8
              : coords.y - 8,
        transform:
          side === "left"
            ? "translate(-100%, -50%)"
            : side === "right"
              ? "translate(0, -50%)"
              : side === "bottom"
                ? "translate(-50%, 0)"
                : "translate(-50%, -100%)",
      }}
      role="tooltip"
    >
      {label}
    </span>
  ) : null;

  return (
    <span
      ref={triggerRef}
      className="inline-flex"
      onMouseEnter={() => setOpen(true)}
      onMouseLeave={() => setOpen(false)}
      onFocus={() => setOpen(true)}
      onBlur={() => setOpen(false)}
    >
      {children}
      {tooltip && typeof document !== "undefined"
        ? createPortal(tooltip, document.body)
        : null}
    </span>
  );
}
