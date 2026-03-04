-- Add new lead status values to the existing enum
ALTER TYPE "lead_status" ADD VALUE IF NOT EXISTS 'new';
ALTER TYPE "lead_status" ADD VALUE IF NOT EXISTS 'contacted';
ALTER TYPE "lead_status" ADD VALUE IF NOT EXISTS 'working';
ALTER TYPE "lead_status" ADD VALUE IF NOT EXISTS 'lost';
--> statement-breakpoint

-- Migrate existing 'active' leads to 'new' status
UPDATE "leads" SET "status" = 'new' WHERE "status" = 'active';
--> statement-breakpoint

-- Migrate existing 'inactive' leads to 'lost' status
UPDATE "leads" SET "status" = 'lost' WHERE "status" = 'inactive';
