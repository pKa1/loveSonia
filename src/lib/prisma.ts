import { PrismaClient } from "@/generated/prisma";
import fs from "fs";
import path from "path";

declare global {
  var prisma: PrismaClient | undefined;
}

// Ensure DATABASE_URL resolves to the correct SQLite file even if process.cwd() is the repo root
if (!process.env.DATABASE_URL || !process.env.DATABASE_URL.trim()) {
  const candidate1 = path.resolve(process.cwd(), "prisma/dev.db");
  const candidate2 = path.resolve(process.cwd(), "web/prisma/dev.db");
  const filePath = fs.existsSync(candidate1) ? candidate1 : candidate2;
  process.env.DATABASE_URL = `file:${filePath}`;
}

export const prisma = global.prisma ?? new PrismaClient();
if (process.env.NODE_ENV !== "production") global.prisma = prisma;


