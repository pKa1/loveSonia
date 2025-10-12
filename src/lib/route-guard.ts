export function decideRedirect(pathname: string, isAuthenticated: boolean, onboarded: boolean): string | null {
  // Normalize pathname: ensure it starts with '/'
  const path = pathname || "/";

  if (isAuthenticated) {
    if (path.startsWith("/welcome") || path.startsWith("/auth")) {
      return "/";
    }
    return null;
  }

  // Unauthenticated
  if (path === "/") {
    return "/welcome?next=/";
  }
  return onboarded ? `/auth?next=${path}` : `/welcome?next=${path}`;
}


