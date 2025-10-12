export function decideRedirect(pathname, isAuthenticated, onboarded) {
  const path = pathname || "/";
  if (isAuthenticated) {
    if (path.startsWith("/welcome") || path.startsWith("/auth")) return "/";
    return null;
  }
  if (path === "/") return "/welcome?next=/";
  return onboarded ? `/auth?next=${path}` : `/welcome?next=${path}`;
}


