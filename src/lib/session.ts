const TOKEN_KEY = "mart-accessToken";
const REFRESH_KEY = "mart-refreshToken";
const CASHIER_KEY = "mart-cashier";
const LOCK_KEY = "mart-screen-locked";
const MESSAGE_KEY = "mart-session-message";

export const SESSION_ENDED_MESSAGE = "Your session has expired. Please sign in again.";

export function getToken(): string {
  if (typeof window === "undefined") return "";
  return localStorage.getItem(TOKEN_KEY) || "";
}

export function getRefreshToken(): string {
  if (typeof window === "undefined") return "";
  return localStorage.getItem(REFRESH_KEY) || "";
}

/** Decode JWT `exp` without verifying the signature. */
export function isAccessTokenExpired(token: string | null | undefined, skewMs = 5000): boolean {
  if (!token) return true;
  const parts = token.split(".");
  if (parts.length < 2) return true;
  try {
    const padded = parts[1].replace(/-/g, "+").replace(/_/g, "/");
    const json = atob(padded.padEnd(padded.length + ((4 - (padded.length % 4)) % 4), "="));
    const payload = JSON.parse(json) as { exp?: number };
    if (typeof payload.exp !== "number") return false;
    return payload.exp * 1000 <= Date.now() + skewMs;
  } catch {
    return true;
  }
}

/** Messages that mean the JWT session is gone and the cashier must sign in again. */
export function isUnauthenticatedMessage(message?: string | null): boolean {
  if (!message) return false;
  const text = message.toLowerCase();
  return (
    text.includes("not authenticated") ||
    text.includes("please login") ||
    text.includes("authentication required") ||
    text.includes("credentials were not provided") ||
    text.includes("error decoding signature") ||
    text.includes("signature has expired") ||
    text.includes("token has expired") ||
    text.includes("token is expired") ||
    text.includes("signed in on another device") ||
    text.includes("session ended") ||
    text.includes("failed to refresh token") ||
    text.includes("sign in again") ||
    text.includes("you do not have permission to perform this action")
  );
}

export function isSupersededSessionMessage(message?: string | null): boolean {
  if (!message) return false;
  const text = message.toLowerCase();
  return text.includes("signed in on another device") || text.includes("session ended");
}

export function setSession(token: string, refresh: string, cashier: string) {
  localStorage.setItem(TOKEN_KEY, token);
  localStorage.setItem(REFRESH_KEY, refresh);
  localStorage.setItem(CASHIER_KEY, cashier);
}

export function cashierName(): string {
  if (typeof window === "undefined") return "";
  return localStorage.getItem(CASHIER_KEY) || "Cashier";
}

export function clearSession() {
  localStorage.removeItem(TOKEN_KEY);
  localStorage.removeItem(REFRESH_KEY);
  localStorage.removeItem(CASHIER_KEY);
  sessionStorage.removeItem(LOCK_KEY);
}

export function stashSessionMessage(message: string = SESSION_ENDED_MESSAGE) {
  if (typeof window === "undefined") return;
  sessionStorage.setItem(MESSAGE_KEY, message);
}

export function consumeSessionMessage(): string {
  if (typeof window === "undefined") return "";
  const message = sessionStorage.getItem(MESSAGE_KEY) || "";
  if (message) sessionStorage.removeItem(MESSAGE_KEY);
  return message;
}

/** Clear the till session and return to login. Safe to call more than once. */
export function endSession(message: string = SESSION_ENDED_MESSAGE) {
  if (typeof window === "undefined") return;
  const flag = window as Window & { __martSessionEnding?: boolean };
  if (flag.__martSessionEnding) return;
  flag.__martSessionEnding = true;
  const onLogin = window.location.pathname.includes("/login");
  clearSession();
  if (onLogin) return;
  stashSessionMessage(message);
  const params = new URLSearchParams(window.location.search);
  const property = (params.get("property") || params.get("branch") || "").trim();
  const target = property ? `/login?property=${encodeURIComponent(property)}` : "/login";
  window.location.assign(target);
}
