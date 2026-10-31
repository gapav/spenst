/** Keeps a `?next=` same-origin: anything but a local path falls back. */
export function internalPath(value: string | null | undefined, fallback = "/"): string {
  return value && value.startsWith("/") && !value.startsWith("//") ? value : fallback;
}
