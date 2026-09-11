-- GiveawayOverhaul: Add GiveawayEntry table, status field, host tracking, winner tracking
-- SQLite does not support RENAME COLUMN, so we add status, migrate data, drop ended

-- 1. Add new columns to Giveaway
ALTER TABLE "Giveaway" ADD COLUMN "hostId" TEXT;
ALTER TABLE "Giveaway" ADD COLUMN "hostTag" TEXT;
ALTER TABLE "Giveaway" ADD COLUMN "status" TEXT NOT NULL DEFAULT 'ACTIVE';
ALTER TABLE "Giveaway" ADD COLUMN "winnerIds" TEXT NOT NULL DEFAULT '[]';
ALTER TABLE "Giveaway" ADD COLUMN "entryCount" INTEGER NOT NULL DEFAULT 0;

-- 2. Migrate existing data: ended=1 -> status='ENDED'
UPDATE "Giveaway" SET "status" = 'ENDED' WHERE "ended" = 1;

-- 3. Drop old ended column
ALTER TABLE "Giveaway" DROP COLUMN "ended";

-- 4. Create GiveawayEntry table
CREATE TABLE "GiveawayEntry" (
    "id" TEXT NOT NULL PRIMARY KEY DEFAULT (hex(randomblob(16))),
    "guildId" TEXT NOT NULL,
    "giveawayId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "enteredAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
);

-- 5. Create indexes on GiveawayEntry
CREATE UNIQUE INDEX "GiveawayEntry_giveawayId_userId_key" ON "GiveawayEntry"("giveawayId", "userId");
CREATE INDEX "GiveawayEntry_guildId_idx" ON "GiveawayEntry"("guildId");
CREATE INDEX "GiveawayEntry_giveawayId_idx" ON "GiveawayEntry"("giveawayId");

-- 6. Create index on Giveaway for tick queries
CREATE INDEX "Giveaway_guildId_status_idx" ON "Giveaway"("guildId", "status");
