import { PrismaClient } from "@/generated/prisma";
import fs from "fs";
import path from "path";

declare global {
  var prisma: PrismaClient | undefined;
}

// Ensure DATABASE_URL resolves to an existing SQLite file (avoid accidental split DBs)
// Strategy:
// - If DATABASE_URL is missing OR points to a non-existent file (for file: URLs),
//   fall back to an existing candidate, preferring web/prisma/dev.db.
(() => {
  const current = (process.env.DATABASE_URL || "").trim();

  function resolveFileUrlToAbsolute(fileUrl: string): string | null {
    if (!fileUrl.startsWith("file:")) return null;
    const rawPath = fileUrl.slice("file:".length);
    // Support absolute and relative paths
    const abs = path.isAbsolute(rawPath) ? rawPath : path.resolve(process.cwd(), rawPath);
    return abs;
  }

  function pickFallbackPath(): string {
    const candidateWeb = path.resolve(process.cwd(), "web/prisma/dev.db");
    const candidateRoot = path.resolve(process.cwd(), "prisma/dev.db");
    if (fs.existsSync(candidateWeb)) return candidateWeb;
    if (fs.existsSync(candidateRoot)) return candidateRoot;
    // Default to web path even if not present yet (will be created by prisma migrate)
    return candidateWeb;
  }

  let needsFallback = false;
  if (!current) {
    needsFallback = true;
  } else if (current.startsWith("file:")) {
    const abs = resolveFileUrlToAbsolute(current)!;
    if (!fs.existsSync(abs)) {
      needsFallback = true;
    }
  }

  if (needsFallback) {
    const fallbackAbs = pickFallbackPath();
    process.env.DATABASE_URL = `file:${fallbackAbs}`;
    if (process.env.NODE_ENV !== "production") {
      // Helpful for local debugging to see which DB is used
      console.warn("[prisma] Using fallback DATABASE_URL:", process.env.DATABASE_URL);
    }
  }
})();

export const prisma = global.prisma ?? new PrismaClient();
if (process.env.NODE_ENV !== "production") global.prisma = prisma;


