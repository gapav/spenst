"use client";

import { Send, Zap } from "lucide-react";
import { useEffect, useRef, useState, type ComponentProps, type CSSProperties, type FocusEvent, type MouseEvent, type PointerEvent } from "react";
import { cn } from "@/lib/utils";
import { Button } from "./ui";

/**
 * A “win” on the few buttons that mark a milestone: a new test day, an
 * import, a season, a published session, a new battery. Kept to those on
 * purpose — rare actions; an animation on every button wears thin.
 *
 * Two beats, so the win comes with the action and not before it:
 *
 * - **Ready** — hover with a mouse, keyboard focus, or a finger pressing
 *   down: the label gives way to a preview of what is about to happen, with
 *   its real figures (“Ready?”, “12 results”, “18 athletes”).
 * - **Win** — the click: the payoff plays (Set, Go; the lights come on; the
 *   weeks fill), *then* the button's action runs. Each of these actions
 *   leaves the view when it succeeds, so a payoff played after it would
 *   never be seen. The click is held for `PAYOFF_MS` and replayed, which
 *   works for `onClick` and form submits alike; a form that fails its own
 *   validation is not held. With reduced motion there is no hold.
 *
 * The label and the animation share one grid cell, so the button is as wide
 * as the wider of the two. The motion is CSS (`.spenst-win` in `globals.css`).
 */
export type WinKind = "gun" | "lights" | "weeks" | "send" | "charge";

const PAYOFF_MS = 850;

type Beat = "ready" | "win" | undefined;

export function WinButton({ kind, text, heads = 0, plain, className, children, onClick, ...props }: ComponentProps<typeof Button> & {
  kind: WinKind;
  /** What the preview names and the payoff lands on: “12 results”, “7 tests”. */
  text?: string;
  /** `send`: how many athletes will see it. */
  heads?: number;
  /** A plain `<button>`, for the `spenst-action` buttons. */
  plain?: boolean;
}) {
  const [beat, setBeat] = useState<Beat>(undefined);
  const released = useRef(false);
  const timers = useRef<ReturnType<typeof setTimeout>[]>([]);
  useEffect(() => () => timers.current.forEach(clearTimeout), []);
  const later = (ms: number, run: () => void) => { timers.current.push(setTimeout(run, ms)); };

  const ready = () => setBeat((current) => current ?? "ready");
  const rest = () => setBeat((current) => current === "win" ? current : undefined);

  function click(event: MouseEvent<HTMLButtonElement>) {
    if (released.current) { released.current = false; onClick?.(event); return; }
    if (beat === "win") { event.preventDefault(); return; }
    const button = event.currentTarget;
    const still = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    if (still || (button.form && !button.form.checkValidity())) { onClick?.(event); return; }
    event.preventDefault();
    setBeat("win");
    later(PAYOFF_MS, () => { released.current = true; button.click(); });
    // Back to rest in case the view stays (an error, a busy label).
    later(PAYOFF_MS + 500, () => setBeat(undefined));
  }

  const shared = {
    ...props,
    className: cn(className, "spenst-win", `spenst-win-${kind}`),
    "data-win": beat,
    onClick: click,
    onPointerEnter: (event: PointerEvent<HTMLButtonElement>) => { if (event.pointerType === "mouse" && !event.currentTarget.disabled) ready(); },
    onPointerDown: (event: PointerEvent<HTMLButtonElement>) => { if (event.pointerType !== "mouse" && !event.currentTarget.disabled) ready(); },
    // A finger lifting also “leaves”, just before its click: only a mouse leaving ends the preview.
    onPointerLeave: (event: PointerEvent<HTMLButtonElement>) => { if (event.pointerType === "mouse") rest(); },
    onPointerCancel: rest,
    onFocus: (event: FocusEvent<HTMLButtonElement>) => { if (event.currentTarget.matches(":focus-visible")) ready(); },
    onBlur: rest,
  };
  const content = <span className="spenst-win-stack">
    <span className="spenst-win-label">{children}</span>
    <span className="spenst-win-fx" aria-hidden="true">{fx(kind, text, heads)}</span>
  </span>;
  return plain ? <button {...shared}>{content}</button> : <Button {...shared}>{content}</Button>;
}

function fx(kind: WinKind, text: string | undefined, heads: number) {
  const words = text ? <b className="win-text">{text}</b> : null;
  switch (kind) {
    case "gun":
      return <><i className="win-streak" /><i className="win-streak" /><i className="win-streak" /><span className="win-words"><b>Ready?</b><b>Set</b><b>Go</b></span></>;
    case "lights":
      return <><span className="win-lights"><i /><i /><i /></span>{words}</>;
    case "weeks":
      return <span className="win-weeks">{Array.from({ length: 52 }, (_, week) => <i key={week} style={vars({ "--i": (week % 26) * 2 + Math.floor(week / 26), "--o": week < 10 ? 0.55 : week < 44 ? 1 : 0.35 })} />)}</span>;
    case "send":
      return <><Send className="win-plane" size={17} /><span className="win-heads">{Array.from({ length: Math.min(heads, 5) }, (_, index) => <i key={index} style={vars({ "--i": index })} />)}</span>{words}</>;
    case "charge":
      return <><span className="win-cell">{[0, 1, 2, 3, 4].map((index) => <i key={index} style={vars({ "--i": index })} />)}</span><Zap className="win-bolt" size={16} fill="currentColor" />{words}</>;
  }
}

const vars = (values: Record<string, number>) => values as CSSProperties;
