"use client";

import { CircleHelp } from "lucide-react";
import { useEffect, useId, useRef, useState, type ReactNode } from "react";
import { cn } from "@/lib/utils";

/**
 * How-to text never sits on the page: it waits behind a question mark next to
 * the controls it explains. Hovering or focusing shows it; a click (or a tap)
 * pins it open until a click elsewhere or Escape.
 */
export function HelpTip({ children, label = "Help", align = "start", className }: { children: ReactNode; label?: string; align?: "start" | "end"; className?: string }) {
  const id = useId();
  const root = useRef<HTMLSpanElement>(null);
  const [pinned, setPinned] = useState(false);
  const [hovered, setHovered] = useState(false);
  const [focused, setFocused] = useState(false);
  const open = pinned || hovered || focused;

  useEffect(() => {
    if (!pinned) return;
    const away = (event: PointerEvent) => { if (!root.current?.contains(event.target as Node)) setPinned(false); };
    const escape = (event: KeyboardEvent) => { if (event.key === "Escape") setPinned(false); };
    document.addEventListener("pointerdown", away);
    document.addEventListener("keydown", escape);
    return () => { document.removeEventListener("pointerdown", away); document.removeEventListener("keydown", escape); };
  }, [pinned]);

  return <span ref={root} className={cn("help-tip", className)}
    onPointerEnter={(event) => { if (event.pointerType === "mouse") setHovered(true); }}
    onPointerLeave={(event) => { if (event.pointerType === "mouse") setHovered(false); }}>
    <button type="button" className="help-tip-button" aria-label={label} aria-expanded={open} aria-describedby={open ? id : undefined}
      onClick={() => setPinned((value) => !value)} onFocus={() => setFocused(true)} onBlur={() => setFocused(false)}
      onKeyDown={(event) => { if (event.key === "Escape") { setPinned(false); setFocused(false); } }}>
      <CircleHelp size={18} aria-hidden="true" />
    </button>
    {open && <span id={id} role="tooltip" className={cn("help-tip-bubble", align === "end" && "is-end")}>{children}</span>}
  </span>;
}
