import { NextResponse, type NextRequest } from "next/server";
import { jwtVerify } from "jose";
// Import JS version so middleware (Node ESM) can load without TS transpile
import { decideRedirect } from "./src/lib/route-guard.js";

const AUTH_COOKIE = "trackz_token";

async function verify(token: string): Promise<boolean> {
  try {
    const secret = new TextEncoder().encode(process.env.AUTH_SECRET || "dev-secret");
    await jwtVerify(token, secret);
    return true;
  } catch {
    return false;
  }
}

export async function middleware(req: NextRequest) {
  const { pathname } = req.nextUrl;
  // Always allow static assets and service assets
  const isStatic =
    pathname.startsWith("/_next") ||
    pathname.startsWith("/favicon") ||
    pathname.startsWith("/icons") ||
    pathname === "/manifest.json" ||
    pathname === "/sw.js";
  if (isStatic) return NextResponse.next();

  // Only guard page requests; allow API to handle auth itself
  if (pathname.startsWith("/api")) {
    return NextResponse.next();
  }

  const token = req.cookies.get(AUTH_COOKIE)?.value;
  const valid = token ? await verify(token) : false;
  const onboarded = req.cookies.get("onboarded")?.value === "1";
  const target = decideRedirect(pathname, valid, onboarded);
  if (target) {
    const url = req.nextUrl.clone();
    const [p, q] = target.split("?");
    url.pathname = p;
    if (q) {
      const params = new URLSearchParams(q);
      for (const [k, v] of params.entries()) url.searchParams.set(k, v);
    }
    const res = NextResponse.redirect(url);
    res.headers.set("x-guard", `redirect:${target}`);
    return res;
  }

  return NextResponse.next();
}

export const config = {
  matcher: ["/(.*)"],
};


