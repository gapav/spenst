"use client";

import { useCallback, useLayoutEffect, useSyncExternalStore } from "react";
import { applyTheme, readThemePreference, saveThemePreference, THEME_EVENT, THEME_KEY, type ThemePreference } from "@/lib/theme";

function subscribe(onChange: () => void) {
  const onStorage = (event: StorageEvent) => { if (event.key === THEME_KEY || event.key === null) onChange(); };
  window.addEventListener(THEME_EVENT, onChange);
  window.addEventListener("storage", onStorage);
  return () => { window.removeEventListener(THEME_EVENT, onChange); window.removeEventListener("storage", onStorage); };
}

// The server cannot know, and "system" is also what an empty store means, so a
// control rendered on the server agrees with the first client render.
const serverPreference = (): ThemePreference => "system";

/** The coach's theme choice on this device, and the way to change it. */
export function useThemePreference() {
  const preference = useSyncExternalStore(subscribe, readThemePreference, serverPreference);
  const setPreference = useCallback((next: ThemePreference) => saveThemePreference(next), []);
  return [preference, setPreference] as const;
}

/**
 * The inline script in the root layout has already set `data-theme` before the
 * first paint; this only puts it back when React takes it away. In development
 * Strict Mode remounts the root and resets `<html>` to the attributes React
 * rendered, which does not include one a script added. A no-op in production.
 */
export function useThemeAttribute() {
  useLayoutEffect(() => { applyTheme(); }, []);
}
