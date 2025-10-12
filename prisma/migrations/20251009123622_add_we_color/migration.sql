-- RedefineTables
PRAGMA defer_foreign_keys=ON;
PRAGMA foreign_keys=OFF;
CREATE TABLE "new_Pair" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    "code" TEXT NOT NULL,
    "weColorHex" TEXT NOT NULL DEFAULT '#ff8f70'
);
INSERT INTO "new_Pair" ("code", "createdAt", "id", "updatedAt") SELECT "code", "createdAt", "id", "updatedAt" FROM "Pair";
DROP TABLE "Pair";
ALTER TABLE "new_Pair" RENAME TO "Pair";
CREATE UNIQUE INDEX "Pair_code_key" ON "Pair"("code");
PRAGMA foreign_keys=ON;
PRAGMA defer_foreign_keys=OFF;
