import { SignJWT, jwtVerify } from "jose";
import { cookies } from "next/headers";

const AUTH_COOKIE = "trackz_token";

function getSecret() {
  const secret = process.env.AUTH_SECRET || "dev-secret";
  return new TextEncoder().encode(secret);
}

export type AuthToken = { userId: string };

export async function setAuthCookie(payload: AuthToken) {
  const token = await new SignJWT(payload)
    .setProtectedHeader({ alg: "HS256" })
    .setIssuedAt()
    .setExpirationTime("30d")
    .sign(getSecret());
  (await cookies()).set(AUTH_COOKIE, token, {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    path: "/",
    maxAge: 60 * 60 * 24 * 30,
  });
}

export async function getAuth(): Promise<AuthToken | null> {
  const cookieStore = await cookies();
  const token = cookieStore.get(AUTH_COOKIE)?.value;
  if (!token) return null;
  try {
    const { payload } = await jwtVerify<AuthToken>(token, getSecret());
    return { userId: payload.userId };
  } catch {
    return null;
  }
}

export async function clearAuth() {
  (await cookies()).delete(AUTH_COOKIE);
}


