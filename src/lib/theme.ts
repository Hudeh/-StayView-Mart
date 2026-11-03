const NIGHT_KEY = "mart-night";

export function nightModeEnabled(): boolean {
  if (typeof window === "undefined") return false;
  return document.documentElement.dataset.theme === "night" || localStorage.getItem(NIGHT_KEY) === "1";
}

export function applyNightMode(enabled: boolean) {
  document.documentElement.dataset.theme = enabled ? "night" : "day";
  localStorage.setItem(NIGHT_KEY, enabled ? "1" : "0");
}
