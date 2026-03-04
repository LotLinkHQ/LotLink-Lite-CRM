-- E6: AI Matching Engine enhancements

-- Add new match status values
ALTER TYPE "match_status" ADD VALUE IF NOT EXISTS 'new';
ALTER TYPE "match_status" ADD VALUE IF NOT EXISTS 'appointment';

-- Add dismiss reason and last matched price to matches
ALTER TABLE "matches" ADD COLUMN IF NOT EXISTS "dismiss_reason" varchar(255);
ALTER TABLE "matches" ADD COLUMN IF NOT EXISTS "last_matched_price" numeric(10, 2);

-- Add match threshold to dealership preferences
ALTER TABLE "dealership_preferences" ADD COLUMN IF NOT EXISTS "match_threshold" integer DEFAULT 60 NOT NULL;

-- Migrate existing 'pending' matches to 'new' status
UPDATE "matches" SET "status" = 'new' WHERE "status" = 'pending';
