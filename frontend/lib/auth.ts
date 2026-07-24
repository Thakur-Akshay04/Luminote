// Deprecated — Auth is now fully handled by Clerk (@clerk/nextjs)
// These stubs exist only for backward compatibility with any remaining imports.

export interface StoredUser {
  user_id: string;
  email: string;
  name?: string;
  avatar_url?: string | null;
  display_name?: string | null;
}

/** @deprecated Use Clerk middleware instead — this always returns false. */
export function isAuthenticated(): boolean {
  return false;
}

/** @deprecated Auth tokens are now managed by Clerk. */
export function getToken(): string | null {
  return null;
}

/** @deprecated Use useUser() from @clerk/nextjs instead. */
export function getUser(): StoredUser | null {
  return null;
}

export function setAuth(): void {
  // No-op: Auth is managed by Clerk
}
export function clearAuth(): void {
  // No-op: Auth is managed by Clerk
}
