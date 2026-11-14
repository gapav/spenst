"use client";

import { useRouter } from "next/navigation";
import { useEffect, useRef } from "react";
import { SessionBuilder } from "./session-builder";
import { lockPageScroll } from "./ui";

/**
 * The session builder over the season plan, so a coach planning a block never
 * leaves it (decision 24). The URL is the session's own, so back closes the
 * drawer, forward reopens it, and a reload gives the full page. On a phone the
 * drawer covers the screen — a page in all but name.
 */
export function SessionDrawer({ sessionId }: { sessionId: string }) {
  const router = useRouter();
  const panel = useRef<HTMLElement>(null);
  // Closing goes back, so the plan comes back as it was and forward reopens it.
  const close = () => router.back();
  const closeRef = useRef(close);
  useEffect(() => { closeRef.current = close; });

  useEffect(() => {
    const release = lockPageScroll();
    const previous = document.activeElement as HTMLElement | null;
    panel.current?.focus();
    // Escape closes the drawer — unless a dialog opened inside it (the
    // exercise picker) is the one Escape is for.
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key !== "Escape" || event.defaultPrevented) return;
      if (document.querySelector("[role=dialog][aria-modal=true]:not(.session-drawer)")) return;
      event.preventDefault();
      closeRef.current();
    };
    window.addEventListener("keydown", onKeyDown);
    return () => { release(); window.removeEventListener("keydown", onKeyDown); previous?.focus?.(); };
  }, []);

  return <div className="session-drawer-scrim" role="presentation" onPointerDown={(event) => { if (event.target === event.currentTarget) close(); }}>
    <section ref={panel} tabIndex={-1} className="session-drawer" role="dialog" aria-modal="true" aria-label="Session">
      <div className="builder-page session-drawer-body">
        <SessionBuilder sessionId={sessionId} onClose={close} onDeleted={close} />
      </div>
    </section>
  </div>;
}
