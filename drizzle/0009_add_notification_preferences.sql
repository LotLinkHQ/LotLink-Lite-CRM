-- E8: Notification preferences per user
ALTER TABLE "users" ADD COLUMN IF NOT EXISTS "push_notifications" boolean DEFAULT true NOT NULL;
ALTER TABLE "users" ADD COLUMN IF NOT EXISTS "email_notifications" boolean DEFAULT true NOT NULL;
ALTER TABLE "users" ADD COLUMN IF NOT EXISTS "quiet_hours_start" integer;
ALTER TABLE "users" ADD COLUMN IF NOT EXISTS "quiet_hours_end" integer;
