"use client";
import { useEffect, useEffectEvent, useId, type ReactNode } from "react";
import { CalendarDays, X } from "lucide-react";
import type { Action } from "@/lib/validation";
import { Button } from "./button";
export type RunAction = (
  action: Action,
) => Promise<Record<string, string> | null>;
export const initials = (name: string) =>
  name
    .replace(/^Dr\. /, "")
    .split(" ")
    .map((n) => n[0])
    .slice(0, 2)
    .join("");
export function Avatar({
  faculty,
  size = "",
  color = "violet",
}: {
  faculty: { name: string };
  size?: string;
  color?: string;
}) {
  return (
    <span className={`avatar ${size} tone-${color}`}>
      {initials(faculty.name)}
    </span>
  );
}
export function Badge({
  children,
  tone = "neutral",
}: {
  children: ReactNode;
  tone?: string;
}) {
  return <span className={`badge tone-${tone}`}>{children}</span>;
}
export function Empty({
  title,
  body,
  action,
}: {
  title: string;
  body: string;
  action?: ReactNode;
}) {
  return (
    <div className="empty-state">
      <CalendarDays size={28} />
      <h3>{title}</h3>
      {body && <p>{body}</p>}
      {action}
    </div>
  );
}
export function Modal({
  title,
  description,
  children,
  onClose,
  wide = false,
}: {
  title: string;
  description?: string;
  children: ReactNode;
  onClose: () => void;
  wide?: boolean;
}) {
  const titleId = useId();
  const descriptionId = useId();
  const close = useEffectEvent(onClose);
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (e.key === "Escape") close();
    };
    document.addEventListener("keydown", handler);
    const active = document.activeElement as HTMLElement | null;
    const dialog = document.querySelector<HTMLDialogElement>("dialog");
    dialog?.showModal();
    const focus = (e: KeyboardEvent) => {
      if (e.key !== "Tab" || !dialog) return;
      const nodes = [
        ...dialog.querySelectorAll<HTMLElement>(
          "button:not(:disabled), input, select, textarea, a[href]",
        ),
      ];
      const first = nodes[0],
        last = nodes.at(-1);
      if (e.shiftKey && document.activeElement === first) {
        e.preventDefault();
        last?.focus();
      } else if (!e.shiftKey && document.activeElement === last) {
        e.preventDefault();
        first?.focus();
      }
    };
    dialog?.addEventListener("keydown", focus);
    return () => {
      document.removeEventListener("keydown", handler);
      dialog?.removeEventListener("keydown", focus);
      active?.focus();
    };
  }, []);
  return (
    <dialog
      aria-labelledby={titleId}
      aria-describedby={description ? descriptionId : undefined}
      className={`modal ${wide ? "modal-wide" : ""}`}
      onCancel={(e) => {
        e.preventDefault();
        onClose();
      }}
    >
      <header>
        <div>
          <h2 id={titleId}>{title}</h2>
          {description && (
            <p id={descriptionId} className="muted">
              {description}
            </p>
          )}
        </div>
        <Button
          variant="ghost"
          size="icon"
          aria-label="Close dialog"
          onClick={onClose}
        >
          <X size={18} />
        </Button>
      </header>
      {children}
    </dialog>
  );
}
