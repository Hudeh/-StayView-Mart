const TOKEN_KEY = "mart-accessToken";
const REFRESH_KEY = "mart-refreshToken";
const CASHIER_KEY = "mart-cashier";

export function getToken(): string {
  if (typeof window === "undefined") return "";
  return localStorage.getItem(TOKEN_KEY) || "";
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
}
