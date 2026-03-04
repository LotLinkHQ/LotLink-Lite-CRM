ALTER TYPE "inventory_status" ADD VALUE IF NOT EXISTS 'hold';
ALTER TYPE "inventory_status" ADD VALUE IF NOT EXISTS 'removed';
--> statement-breakpoint

ALTER TABLE "inventory" ADD COLUMN IF NOT EXISTS "hold_by_user_id" integer;
ALTER TABLE "inventory" ADD COLUMN IF NOT EXISTS "hold_customer_name" varchar(255);
ALTER TABLE "inventory" ADD COLUMN IF NOT EXISTS "hold_expires_at" timestamp;
