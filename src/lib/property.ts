const STORAGE_KEY = "mart-property-code";

function clean(value: string): string {
  return value.trim().toLowerCase().replace(/[^a-z0-9-]/g, "");
}

function aliasFromHostname(hostname: string): string {
  const host = (hostname || "").trim().toLowerCase();
  if (!host || host === "localhost" || host === "127.0.0.1") return "";
  if (/^\d+\.\d+\.\d+\.\d+$/.test(host)) return "";
  const first = host.split(".")[0] || "";
  if (!first || ["www", "app", "api", "mart", "localhost"].includes(first)) return "";
  return clean(first);
}

/** Property code from `?property=` (Electron) or the subdomain (web). */
export function getPropertyCode(): string {
  if (typeof window === "undefined") return "";
  const params = new URLSearchParams(window.location.search);
  const fromQuery = clean(params.get("property") || params.get("branch") || "");
  const fromHost = aliasFromHostname(window.location.hostname);
  const fromTab = clean(sessionStorage.getItem(STORAGE_KEY) || "");
  const code = fromQuery || fromHost || fromTab;
  if (code) sessionStorage.setItem(STORAGE_KEY, code);
  return code;
}

/** Keep `?property=` on in-app routes when Electron opened the till on localhost. */
export function propertyPath(path: string): string {
  if (typeof window === "undefined") return path;
  const params = new URLSearchParams(window.location.search);
  const property = clean(params.get("property") || params.get("branch") || "");
  if (!property) return path;
  return `${path}?property=${encodeURIComponent(property)}`;
}
