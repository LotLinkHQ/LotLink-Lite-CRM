-- Add "owner" to the role enum
ALTER TYPE "role" ADD VALUE IF NOT EXISTS 'owner';

-- Create activity_logs table
CREATE TABLE IF NOT EXISTS "activity_logs" (
  "id" serial PRIMARY KEY NOT NULL,
  "user_id" integer NOT NULL,
  "dealership_id" integer,
  "action" varchar(100) NOT NULL,
  "metadata" json,
  "session_duration" integer,
  "created_at" timestamp DEFAULT now() NOT NULL
);
