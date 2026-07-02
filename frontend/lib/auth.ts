import Cookies from "js-cookie";

const TOKEN_KEY = "luminote_token";
const USER_KEY = "luminote_user";

export interface StoredUser {
  user_id: string;
  email: string;
}

export function setAuth(token: string, user: StoredUser): void {
  Cookies.set(TOKEN_KEY, token, { expires: 7, sameSite: "lax" });
  Cookies.set(USER_KEY, JSON.stringify(user), { expires: 7, sameSite: "lax" });
}

export function getToken(): string | null {
  return Cookies.get(TOKEN_KEY) ?? null;
}

export function getUser(): StoredUser | null {
  const raw = Cookies.get(USER_KEY);
  if (!raw) return null;
  try {
    return JSON.parse(raw) as StoredUser;
  } catch {
    return null;
  }
}

export function clearAuth(): void {
  Cookies.remove(TOKEN_KEY);
  Cookies.remove(USER_KEY);
}

export function isAuthenticated(): boolean {
  return !!getToken();
}
