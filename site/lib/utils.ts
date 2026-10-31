import { clsx, type ClassValue } from "clsx";
import { twMerge } from "tailwind-merge";

export function cn(...inputs: ClassValue[]) { return twMerge(clsx(inputs)); }
export function initials(name: string) { return name.split(/\s+/).filter(Boolean).slice(0, 2).map((part) => part[0]?.toUpperCase()).join(""); }
/**
 * Ink or paper for a label on a solid background, by WCAG relative luminance.
 * Anything but a six-digit hex falls back to white. Copied from Grep.
 */
export function readableInk(background: string) {
  const hex = /^#([0-9a-f]{6})$/i.exec(background.trim());
  if (!hex) return "#ffffff";
  const channel = (offset: number) => {
    const value = parseInt(hex[1].slice(offset, offset + 2), 16) / 255;
    return value <= 0.03928 ? value / 12.92 : ((value + 0.055) / 1.055) ** 2.4;
  };
  const luminance = 0.2126 * channel(0) + 0.7152 * channel(2) + 0.0722 * channel(4);
  return luminance > 0.36 ? "#2e1b3d" : "#ffffff";
}
export function makeUuid() { return crypto.randomUUID(); }
/** `YYYY-MM-DD` in the viewer's own zone — a test day is a calendar day, not an instant. */
export function localDateKey(date: Date) {
  const pad = (value: number) => String(value).padStart(2, "0");
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`;
}
/** “Tue 7 Oct” for a `YYYY-MM-DD`, read as a calendar day so no zone can move it. */
export function formatDay(dateKey: string, options: Intl.DateTimeFormatOptions = { weekday: "short", day: "numeric", month: "short" }) {
  const [year, month, day] = dateKey.split("-").map(Number);
  return new Intl.DateTimeFormat("en-GB", { ...options, timeZone: "UTC" }).format(new Date(Date.UTC(year, month - 1, day)));
}
/** Parses a typed number: “1.23” and “1,23” both work. */
export function parseDecimal(text: string): number | null {
  const cleaned = text.trim().replace(/\s/g, "").replace(",", ".");
  if (!cleaned) return null;
  const value = Number(cleaned);
  return Number.isFinite(value) ? value : null;
}
/** “1 session”, “3 sessions” — the number and the right form of the word. */
export function countLabel(count: number, one: string, many: string) {
  return `${count} ${count === 1 ? one : many}`;
}
