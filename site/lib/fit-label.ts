/**
 * Fits a bar's title into the room it has, for the year timeline. The first
 * form that fits wins:
 *
 * 1. one line;
 * 2. wrapped onto up to three lines;
 * 3. set vertically, over as many lines as the bar is wide enough for, so it
 *    is as short as it can be (“Qualification” over “window”);
 * 4. the first word, with an ellipsis if words were dropped — across, then
 *    vertically;
 * 5. initials, then the first initial.
 *
 * It depends on the bar's width only, never its height: a vertical title sets
 * the lane's height (up to `maxHeight`), so measuring against the height it
 * caused would let it grow without end. The full title stays in the bar's
 * tooltip and accessible name.
 *
 * Pure: the caller passes `measure` for the bar's font (canvas `measureText`
 * in the browser). The paddings below mirror the `.year-bar-label[data-fit]`
 * rules in `app/globals.css`; change them together.
 */

export type LabelFit =
  | { mode: "line" | "wrap"; text: string }
  /** `length`: how far the text runs along the bar, padding excluded. */
  | { mode: "vertical"; text: string; length: number }
  | { mode: "short"; text: string };

export type LabelBox = {
  /** The bar's width inside its border, padding included. */
  width: number;
  lineHeight: number;
  /** The tallest a vertical title may make the bar, padding included. */
  maxHeight: number;
};

/** Horizontal padding on each side for one line or wrapped lines. */
export const LABEL_PAD_INLINE = 9;
/** Padding at each end of a vertical title. */
export const LABEL_PAD_VERTICAL = 6;
/** Padding on each side of a vertical or shortened title. */
export const LABEL_PAD_TIGHT = 2;
/** Most lines for a title wrapped across the bar. */
export const LABEL_MAX_WRAPPED_LINES = 3;

const DASH = /^[–—-]$/;
/** A browser may break a line after a hyphen inside a word, as in “Pre-|season”. */
const AFTER_HYPHEN = /(?<=[\p{L}\p{N}]-)(?=[\p{L}\p{N}])/u;

type Piece = { text: string; space: boolean };

/** The pieces a line may break between: words, and the parts of a hyphenated word. A lone dash stays with the word before it. */
export function labelPieces(title: string): Piece[] {
  const pieces: Piece[] = [];
  for (const token of title.trim().split(/\s+/).filter(Boolean)) {
    if (DASH.test(token) && pieces.length) { pieces[pieces.length - 1].text += ` ${token}`; continue; }
    token.split(AFTER_HYPHEN).forEach((part, index) => pieces.push({ text: part, space: index === 0 && pieces.length > 0 }));
  }
  return pieces;
}

/** The lines `title` breaks into at `width`, or null if a piece alone is too wide. */
export function wrapLabel(title: string, width: number, measure: (text: string) => number): string[] | null {
  const lines: string[] = [];
  let line = "";
  for (const piece of labelPieces(title)) {
    if (measure(piece.text) > width) return null;
    const next = line ? `${line}${piece.space ? " " : ""}${piece.text}` : piece.text;
    if (measure(next) <= width) line = next;
    else { lines.push(line); line = piece.text; }
  }
  if (line) lines.push(line);
  return lines;
}

/** The shortest line length that wraps `title` onto at most `lines` lines. */
export function shortestWrap(title: string, lines: number, measure: (text: string) => number): number {
  const pieces = labelPieces(title);
  const candidates = new Set<number>();
  for (let from = 0; from < pieces.length; from++) {
    let line = "";
    for (let to = from; to < pieces.length; to++) {
      line = to === from ? pieces[to].text : `${line}${pieces[to].space ? " " : ""}${pieces[to].text}`;
      candidates.add(measure(line));
    }
  }
  const sorted = [...candidates].sort((a, b) => a - b);
  return sorted.find((width) => (wrapLabel(title, width, measure)?.length ?? Infinity) <= lines) ?? Infinity;
}

export function labelInitials(title: string): string {
  return title.trim().split(/\s+/)
    .map((word) => word.match(/[\p{L}\p{N}]/u)?.[0] ?? "")
    .join("")
    .toUpperCase();
}

export function fitLabel(title: string, box: LabelBox, measure: (text: string) => number): LabelFit {
  const text = title.trim();
  if (!text) return { mode: "line", text };

  const across = box.width - 2 * LABEL_PAD_INLINE;
  if (measure(text) <= across) return { mode: "line", text };

  const lines = wrapLabel(text, across, measure);
  if (lines && lines.length <= LABEL_MAX_WRAPPED_LINES) return { mode: "wrap", text };

  const along = box.maxHeight - 2 * LABEL_PAD_VERTICAL;
  const columns = Math.max(1, Math.floor((box.width - 2 * LABEL_PAD_TIGHT) / box.lineHeight));
  const vertical = (candidate: string): LabelFit | null => {
    const length = shortestWrap(candidate, columns, measure);
    return length <= along ? { mode: "vertical", text: candidate, length: Math.ceil(length) } : null;
  };
  const whole = vertical(text);
  if (whole) return whole;

  const tight = box.width - 2 * LABEL_PAD_TIGHT;
  const words = text.split(/\s+/);
  const firstWord = words.length > 1 ? `${words[0]}…` : words[0];
  if (measure(firstWord) <= tight) return { mode: "short", text: firstWord };
  const firstWordVertical = vertical(firstWord);
  if (firstWordVertical) return firstWordVertical;

  const initials = labelInitials(text);
  if (measure(initials) <= tight) return { mode: "short", text: initials };
  return { mode: "short", text: initials.slice(0, 1) };
}
