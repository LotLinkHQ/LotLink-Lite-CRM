ALTER TABLE "dealerships" ADD COLUMN IF NOT EXISTS "website_url" varchar(500);--> statement-breakpoint
ALTER TABLE "dealerships" ADD COLUMN IF NOT EXISTS "last_scraped_at" timestamp;
