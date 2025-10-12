-- CreateTable
CREATE TABLE "EventCategory" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    "pairId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "color" TEXT NOT NULL,
    CONSTRAINT "EventCategory_pairId_fkey" FOREIGN KEY ("pairId") REFERENCES "Pair" ("id") ON DELETE RESTRICT ON UPDATE CASCADE
);

-- RedefineTables
PRAGMA defer_foreign_keys=ON;
PRAGMA foreign_keys=OFF;
CREATE TABLE "new_Event" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    "title" TEXT NOT NULL,
    "pairId" TEXT NOT NULL,
    "startAt" DATETIME NOT NULL,
    "endAt" DATETIME NOT NULL,
    "location" TEXT,
    "allDay" BOOLEAN NOT NULL DEFAULT false,
    "assignee" TEXT NOT NULL DEFAULT 'WE',
    "categoryId" TEXT,
    CONSTRAINT "Event_pairId_fkey" FOREIGN KEY ("pairId") REFERENCES "Pair" ("id") ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT "Event_categoryId_fkey" FOREIGN KEY ("categoryId") REFERENCES "EventCategory" ("id") ON DELETE SET NULL ON UPDATE CASCADE
);
INSERT INTO "new_Event" ("allDay", "assignee", "createdAt", "endAt", "id", "location", "pairId", "startAt", "title", "updatedAt") SELECT "allDay", "assignee", "createdAt", "endAt", "id", "location", "pairId", "startAt", "title", "updatedAt" FROM "Event";
DROP TABLE "Event";
ALTER TABLE "new_Event" RENAME TO "Event";
PRAGMA foreign_keys=ON;
PRAGMA defer_foreign_keys=OFF;

-- CreateIndex
CREATE INDEX "EventCategory_pairId_idx" ON "EventCategory"("pairId");

-- CreateIndex
CREATE UNIQUE INDEX "EventCategory_pairId_name_key" ON "EventCategory"("pairId", "name");
