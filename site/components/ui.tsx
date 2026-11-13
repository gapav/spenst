"use client";

import { X } from "lucide-react";
import { useEffect } from "react";
import { createPortal } from "react-dom";
import type { ComponentProps, ReactNode } from "react";
import { cn, readableInk } from "@/lib/utils";

export function Button({ className, variant = "primary", size = "md", ...props }: ComponentProps<"button"> & { variant?: "primary" | "secondary" | "ghost" | "danger"; size?: "sm" | "md" | "lg" }) {
  return <button className={cn("spenst-button inline-flex items-center justify-center gap-2 rounded-xl font-semibold transition disabled:cursor-not-allowed disabled:opacity-45", size === "sm" && "min-h-9 px-3 text-sm", size === "md" && "min-h-11 px-4 text-sm", size === "lg" && "min-h-12 px-5", variant === "primary" && "bg-[var(--signature)] text-[var(--on-bright)] enabled:hover:bg-[var(--signature-hover)]", variant === "secondary" && "border border-[var(--line)] bg-[var(--surface)] text-[var(--ink)] enabled:hover:border-[var(--ink)]", variant === "ghost" && "text-[var(--ink-soft)] enabled:hover:bg-[var(--hover-wash-strong)] enabled:hover:text-[var(--ink)]", variant === "danger" && "bg-[var(--danger-bg)] text-[var(--danger)] enabled:hover:bg-[var(--danger-bg-hover)]", className)} {...props} />;
}

// Modals stack: the exercise picker and the warm-up dialog each render a
// preview dialog beside their own, and one click can close both in the same
// commit. Every open modal therefore takes a share of one page-wide lock rather
// than saving and restoring `body.overflow` itself — with a value each, the
// second cleanup would restore the "hidden" the first had already handed back
// and freeze the page until a reload.
let scrollLockCount = 0;
let overflowBeforeLock = "";

export function lockPageScroll() {
  if (scrollLockCount === 0) {
    overflowBeforeLock = document.body.style.overflow;
    document.body.style.overflow = "hidden";
  }
  scrollLockCount += 1;
  let released = false;
  return () => {
    if (released) return;
    released = true;
    scrollLockCount -= 1;
    if (scrollLockCount === 0) document.body.style.overflow = overflowBeforeLock;
  };
}

export function Modal({ open, title, description, children, onClose, size = "md" }: { open: boolean; title: string; description?: string; children: ReactNode; onClose(): void; size?: "sm" | "md" | "lg" }) {
  // A phone sheet is easy to get stuck in: Escape closes it, and the page
  // behind stays put so the only thing that scrolls is the dialog itself.
  useEffect(() => {
    if (!open) return;
    // Handled, so a page behind that closes things on Escape leaves itself alone.
    const onKeyDown = (event: KeyboardEvent) => { if (event.key === "Escape") { event.preventDefault(); onClose(); } };
    const releaseScroll = lockPageScroll();
    document.addEventListener("keydown", onKeyDown);
    return () => {
      releaseScroll();
      document.removeEventListener("keydown", onKeyDown);
    };
  }, [open, onClose]);

  // A dialog belongs to the page, not to whatever opened it, and `position:
  // fixed` alone does not promise that: an ancestor carrying a transform,
  // filter or backdrop-filter becomes the containing block for everything fixed
  // inside it. A library card is exactly that ancestor — `.soft-in` fills
  // forwards, so its `transform: translateY(0)` never goes away — and the
  // dialog the card’s own menu opened was laid out inside the card and then
  // clipped by its `overflow-hidden`. Escaping to the body is the only fix that
  // does not depend on knowing every ancestor a modal may one day open under.
  //
  // There is no document to portal into while the page is being prerendered,
  // and nothing to portal either: a dialog is opened by a click, so `open` is
  // false in every render the server makes and in the one the browser hydrates.
  if (!open || typeof document === "undefined") return null;
  return createPortal(<div className="fixed inset-0 z-50 grid place-items-end bg-[var(--scrim)] p-0 backdrop-blur-sm sm:place-items-center sm:p-6" role="presentation" onPointerDown={(event) => { if (event.currentTarget === event.target) onClose(); }}>
    <section role="dialog" aria-modal="true" aria-labelledby="modal-title" className={cn("max-h-[92vh] w-full overflow-y-auto rounded-t-[28px] bg-[var(--surface)] p-5 pt-0 shadow-2xl soft-in sm:rounded-[28px] sm:p-7 sm:pt-0", size === "sm" && "sm:max-w-md", size === "md" && "sm:max-w-xl", size === "lg" && "sm:max-w-3xl")}>
      <div className="sticky top-0 z-10 -mx-5 mb-6 flex items-start justify-between gap-5 border-b border-[var(--line)] bg-[var(--surface)] px-5 pb-4 pt-5 sm:-mx-7 sm:px-7 sm:pt-7"><div><h2 id="modal-title" className="text-2xl font-black tracking-[-.04em]">{title}</h2>{description && <p className="mt-1 text-sm leading-6 text-[var(--ink-soft)]">{description}</p>}</div><Button variant="ghost" size="sm" aria-label="Close the dialog" onClick={onClose} className="-mr-2 h-11 w-11 shrink-0 px-0"><X size={19} /></Button></div>
      {children}
    </section>
  </div>, document.body);
}

export function Field({ label, hint, help, htmlFor, children }: { label: string; hint?: string; help?: ReactNode; htmlFor?: string; children: ReactNode }) {
  const trailing = hint && <span className="text-xs font-normal text-[var(--ink-soft)]">{hint}</span>;
  // A help control next to the label cannot live inside the wrapping <label>: a
  // click there would be forwarded to the field. With `help` the label shrinks
  // to the text and points at the control by id instead.
  if (help) return <div className="grid min-w-0 gap-2 text-sm font-semibold"><span className="flex items-center gap-1.5"><label htmlFor={htmlFor}>{label}</label>{help}</span>{children}{trailing}</div>;
  return <label className="grid min-w-0 gap-2 text-sm font-semibold"><span>{label}</span>{children}{trailing}</label>;
}

export const inputClass = "min-h-11 w-full rounded-xl border border-[var(--line)] bg-[var(--surface-raised)] px-3.5 text-[15px] text-[var(--ink)] shadow-sm transition placeholder:text-[var(--ink-faint)] hover:border-[var(--line-stronger)] focus:border-[var(--ink)] focus:outline-2 focus:outline-offset-2 focus:outline-[var(--ink)]";
export const textareaClass = `${inputClass} min-h-28 resize-y py-3 leading-6`;

/** Tag colours, copied from Grep: a tint and the ink that reads on it, both tokens. */
export const tagTones = {
  neutral: { tint: "var(--hover-wash-strong)", ink: "var(--ink-soft)" },
  orange: { tint: "var(--tag-apricot)", ink: "var(--tag-apricot-ink)" },
  green: { tint: "var(--tag-band-1)", ink: "var(--tag-band-1-ink)" },
  blue: { tint: "var(--tag-sky)", ink: "var(--tag-sky-ink)" },
  sky: { tint: "var(--tag-sky)", ink: "var(--tag-sky-ink)" },
  apricot: { tint: "var(--tag-apricot)", ink: "var(--tag-apricot-ink)" },
  rose: { tint: "var(--tag-rose)", ink: "var(--tag-rose-ink)" },
  teal: { tint: "var(--tag-teal)", ink: "var(--tag-teal-ink)" },
  sage: { tint: "var(--tag-sage)", ink: "var(--tag-sage-ink)" },
  gold: { tint: "var(--tag-gold)", ink: "var(--tag-gold-ink)" },
  band1: { tint: "var(--tag-band-1)", ink: "var(--tag-band-1-ink)" },
  band2: { tint: "var(--tag-band-2)", ink: "var(--tag-band-2-ink)" },
  band3: { tint: "var(--tag-band-3)", ink: "var(--tag-band-3-ink)" },
} as const satisfies Record<string, { tint: string; ink: string }>;

export type TagTone = keyof typeof tagTones;

export function Tag({ children, tone = "neutral" }: { children: ReactNode; tone?: TagTone }) {
  const { tint, ink } = tagTones[tone];
  return <span className="inline-flex min-h-6 items-center rounded-full px-2.5 text-xs font-bold" style={{ background: tint, color: ink }}>{children}</span>;
}

export function Avatar({ name, initials, color, size = "md" }: { name: string; initials: string; color: string; size?: "sm" | "md" | "lg" }) {
  return <span title={name} aria-label={name} className={cn("inline-grid shrink-0 place-items-center rounded-full border-2 border-[var(--surface)] font-black shadow-sm", size === "sm" && "h-7 w-7 text-[10px]", size === "md" && "h-9 w-9 text-xs", size === "lg" && "h-11 w-11 text-sm")} style={{ backgroundColor: color, color: readableInk(color) }}>{initials}</span>;
}

export function EmptyState({ icon, title, body, action }: { icon: ReactNode; title: string; body: string; action?: ReactNode }) {
  return <div className="grid min-h-72 place-items-center rounded-[24px] border border-dashed border-[var(--line-strong)] bg-[var(--surface-raised)]/45 px-6 text-center"><div className="max-w-sm"><div className="mx-auto mb-4 grid h-12 w-12 place-items-center rounded-2xl bg-[var(--paper-deep)]">{icon}</div><h3 className="text-lg font-black">{title}</h3><p className="mt-2 text-sm leading-6 text-[var(--ink-soft)]">{body}</p>{action && <div className="mt-5">{action}</div>}</div></div>;
}
