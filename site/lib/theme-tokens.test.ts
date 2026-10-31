import { readdirSync, readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

/**
 * The dark theme works because components never name a colour — they name a
 * token, and `globals.css` decides what it is in each theme. These tests keep
 * it that way: a literal colour in a component, a token only one theme
 * defines, or a palette tweak that drops a text pair below AA fails here
 * rather than on a coach's phone at 22:00. Copied from Grep, plus Spenst's
 * own tokens.
 */
const root = path.resolve(import.meta.dirname, "..");
const css = readFileSync(path.join(root, "app/globals.css"), "utf8");

function block(source: string, selector: string) {
  const start = source.indexOf(selector);
  if (start < 0) throw new Error(`${selector} not found in globals.css`);
  const open = source.indexOf("{", start);
  let depth = 0;
  for (let index = open; index < source.length; index += 1) {
    if (source[index] === "{") depth += 1;
    if (source[index] === "}" && --depth === 0) return source.slice(open + 1, index);
  }
  throw new Error(`${selector} is not closed`);
}

function tokens(body: string) {
  return new Map([...body.replace(/\/\*[\s\S]*?\*\//g, "").matchAll(/(--[\w-]+)\s*:\s*([^;]+);/g)].map(([, name, value]) => [name, value.trim()]));
}

const light = tokens(block(css, ":root {"));
const darkOnly = tokens(block(css, ':root[data-theme="dark"]'));
const dark = new Map([...light, ...darkOnly]);

function hex(theme: Map<string, string>, name: string, seen = new Set<string>()): string {
  const value = theme.get(name);
  if (!value) throw new Error(`${name} is not defined`);
  const alias = /^var\((--[\w-]+)\)$/.exec(value);
  if (alias) {
    if (seen.has(alias[1])) throw new Error(`${name} aliases itself`);
    return hex(theme, alias[1], seen.add(alias[1]));
  }
  if (!/^#[0-9a-f]{6}$/i.test(value)) throw new Error(`${name} is ${value}, not an opaque hex`);
  return value;
}

function contrast(a: string, b: string) {
  const luminance = (color: string) => {
    const [r, g, bl] = [1, 3, 5].map((offset) => parseInt(color.slice(offset, offset + 2), 16) / 255)
      .map((channel) => (channel <= 0.03928 ? channel / 12.92 : ((channel + 0.055) / 1.055) ** 2.4));
    return 0.2126 * r + 0.7152 * g + 0.0722 * bl;
  };
  const [high, low] = [luminance(a), luminance(b)].sort((x, y) => y - x);
  return (high + 0.05) / (low + 0.05);
}

describe("theme tokens", () => {
  it("defines every dark value on the light :root too", () => {
    const missing = [...darkOnly.keys()].filter((name) => !light.has(name));
    expect(missing).toEqual([]);
  });

  it("keeps the dark block away from print", () => {
    const screen = block(css, "@media screen {");
    expect(screen).toContain(':root[data-theme="dark"]');
  });

  // [text, ground, minimum ratio]. 4.5 is AA for body text; 3 is for icons
  // and large type; the tags promise 5 because they are 12px bold labels.
  const pairs: [string, string, number][] = [
    ["--ink", "--paper", 4.5],
    ["--ink", "--surface", 4.5],
    ["--ink", "--surface-raised", 4.5],
    ["--ink", "--paper-deep", 4.5],
    ["--ink-mid", "--surface", 4.5],
    ["--ink-soft", "--paper", 4.5],
    ["--ink-soft", "--surface-raised", 4.5],
    ["--ink-faint", "--surface", 3],
    ["--accent", "--surface", 4.5],
    ["--on-accent", "--accent-fill", 4.5],
    ["--on-bright", "--grep-apricot", 4.5],
    ["--on-bright", "--lime", 4.5],
    ["--ink", "--grep-lilac", 4.5],
    ["--lilac-ink", "--grep-lilac", 4.5],
    ["--on-chrome", "--chrome", 4.5],
    ["--warn-ink", "--warn-bg", 4.5],
    ["--ink", "--warn-bg", 4.5],
    ["--success-ink", "--success-bg", 4.5],
    ["--on-accent", "--success-fill", 3],
    ["--danger", "--danger-bg", 4.5],
    ["--danger", "--surface", 4.5],
    ["--danger-ink", "--danger-bg", 4.5],
    ["--green", "--surface", 4.5],
    ["--ink", "--mint", 4.5],
    ...["sky", "apricot", "rose", "teal", "sage", "gold", "band-1", "band-2", "band-3"]
      .map((tag): [string, string, number] => [`--tag-${tag}-ink`, `--tag-${tag}`, 5]),
    ...[1, 2, 3].map((band): [string, string, number] => ["--on-accent", `--tag-band-${band}-fill`, 4.5]),
    ...["apricot", "lilac", "sage", "blue", "rose", "honey"]
      .map((team): [string, string, number] => ["--ink", `--team-${team}-tint`, 4.5]),
    // Spenst's own: the signature under its label, the five tier chips, and the
    // chart marks against the card they are drawn on.
    ["--on-bright", "--signature", 4.5],
    ["--on-bright", "--signature-hover", 4.5],
    ...[1, 2, 3, 4, 5].map((tier): [string, string, number] => [`--tier-${tier}-ink`, `--tier-${tier}`, 4.5]),
    ...[1, 2, 3, 4, 5].map((tier): [string, string, number] => [`--tier-${tier}-mark`, "--surface", 2]),
    ["--chart-series", "--surface", 3],
    ["--chart-reference", "--surface", 3],
  ];

  for (const [themeName, theme] of [["light", light], ["dark", dark]] as const) {
    it.each(pairs)(`${themeName}: %s on %s clears %s:1`, (text, ground, minimum) => {
      expect(contrast(hex(theme, text), hex(theme, ground))).toBeGreaterThanOrEqual(minimum);
    });
  }
});

describe("colour literals in components", () => {
  function sources(directory: string): string[] {
    return readdirSync(path.join(root, directory), { withFileTypes: true }).flatMap((entry) => {
      const relative = path.join(directory, entry.name);
      if (entry.isDirectory()) return sources(relative);
      return /\.tsx$/.test(entry.name) && !/\.test\.tsx$/.test(entry.name) ? [relative] : [];
    });
  }

  // A hex in a class, or a palette colour Tailwind ships (bg-white, text-red-50…).
  // White and black with an opacity (`bg-white/10`, `from-black/20`) are allowed:
  // they are overlays on photos and on the always-dark chrome, where the ground
  // under them is the same in both themes.
  const literal = /\[#[0-9a-f]{3,8}\]|\b(?:bg|text|border|ring|fill|stroke|from|via|to|divide|outline|placeholder|decoration|accent|caret|shadow)-(?:white|black|slate|gray|zinc|neutral|stone|red|orange|amber|yellow|lime|green|emerald|teal|cyan|sky|blue|indigo|violet|purple|fuchsia|pink|rose)(?:-\d{2,3})?(?![\w/-])/gi;
  // Letterboxing behind a video player is black whatever the theme.
  const allowed = new Set(["bg-black"]);

  it("names tokens, not colours", () => {
    const offenders = ["components", "app"].flatMap(sources).flatMap((file) =>
      readFileSync(path.join(root, file), "utf8").split("\n").flatMap((line, index) =>
        [...line.matchAll(literal)].map(([match]) => match).filter((match) => !allowed.has(match)).map((match) => `${file}:${index + 1} ${match}`)));
    expect(offenders).toEqual([]);
  });
});
