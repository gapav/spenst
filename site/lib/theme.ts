/**
 * Light, dark, or whatever the device says. The choice belongs to the device,
 * not the account: it is kept in localStorage beside the selected team, and a
 * coach who wants dark on the phone and light on the club's laptop gets both.
 *
 * `<html data-theme>` always carries the *resolved* theme — never "system" — so
 * `globals.css` needs exactly one dark block. It is set twice: by
 * `themeScript` while the HTML is still parsing, so the first paint is already
 * right, and by `applyTheme` whenever the coach changes it afterwards.
 */
export type ThemePreference = "system" | "light" | "dark";
export type Theme = "light" | "dark";

export const THEME_KEY = "spenst-theme";
export const THEME_PREFERENCES: readonly ThemePreference[] = ["system", "light", "dark"];
const DARK_QUERY = "(prefers-color-scheme: dark)";
/** Fired on `window` when this tab changes the preference; `storage` covers the others. */
export const THEME_EVENT = "spenst-theme-change";

export function parseThemePreference(value: unknown): ThemePreference {
  return value === "light" || value === "dark" ? value : "system";
}

export function resolveTheme(preference: ThemePreference, systemPrefersDark: boolean): Theme {
  return preference === "dark" || (preference === "system" && systemPrefersDark) ? "dark" : "light";
}

export function readThemePreference(): ThemePreference {
  try { return parseThemePreference(window.localStorage.getItem(THEME_KEY)); } catch { return "system"; }
}

function systemPrefersDark() {
  return typeof window.matchMedia === "function" && window.matchMedia(DARK_QUERY).matches;
}

/** Puts the resolved theme on `<html>`. Safe to call as often as you like. */
export function applyTheme(preference: ThemePreference = readThemePreference()) {
  document.documentElement.dataset.theme = resolveTheme(preference, systemPrefersDark());
}

export function saveThemePreference(preference: ThemePreference) {
  try {
    if (preference === "system") window.localStorage.removeItem(THEME_KEY);
    else window.localStorage.setItem(THEME_KEY, preference);
  } catch { /* the choice just will not survive this reload */ }
  applyTheme(preference);
  window.dispatchEvent(new Event(THEME_EVENT));
}

/**
 * The same resolution as `applyTheme`, as a string for an inline `<head>`
 * script — it runs before React exists, so it cannot import anything. It also
 * stays subscribed for the life of the page: a phone that turns dark at sunset
 * takes the app with it when the coach follows the system, and a choice made
 * in another tab arrives through `storage`.
 */
export const themeScript = `(function(){
var k=${JSON.stringify(THEME_KEY)},m=window.matchMedia?window.matchMedia(${JSON.stringify(DARK_QUERY)}):null;
function a(){var p=null;try{p=localStorage.getItem(k)}catch(e){}
var d=p==="dark"||(p!=="light"&&!!(m&&m.matches));document.documentElement.dataset.theme=d?"dark":"light"}
a();if(m&&m.addEventListener)m.addEventListener("change",a);window.addEventListener("storage",function(e){if(e.key===k||e.key===null)a()});
})();`;
