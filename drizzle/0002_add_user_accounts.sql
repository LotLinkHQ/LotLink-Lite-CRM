-- Migration: Add individual user accounts with RBAC
-- Replaces dealership-level auth with per-user email/password auth

-- Add new enum values for roles
DO $$ BEGIN
  -- Create new role values (salesperson, manager already exist in new enum)
  -- Since we're replacing the enum, we handle this via the ORM schema push
  -- This migration handles the raw SQL tables only
END $$;

-- Create invite_status enum
DO $$ BEGIN
  CREATE TYPE "invite_status" AS ENUM('pending', 'accepted', 'expired', 'revoked');
EXCEPTION
  WHEN duplicate_object THEN null;
END $$;

-- Drop and recreate users table (currently unused, safe to drop)
DROP TABLE IF EXISTS "users" CASCADE;
CREATE TABLE "users" (
  "id" serial PRIMARY KEY NOT NULL,
  "email" varchar(320) NOT NULL,
  "password_hash" varchar(255) NOT NULL,
  "name" varchar(255) NOT NULL,
  "dealership_id" integer,
  "role" "role" DEFAULT 'salesperson' NOT NULL,
  "is_active" boolean DEFAULT true NOT NULL,
  "created_at" timestamp DEFAULT now() NOT NULL,
  "updated_at" timestamp DEFAULT now() NOT NULL,
  "last_signed_in" timestamp,
  CONSTRAINT "users_email_unique" UNIQUE("email")
);

-- Add email_domain to dealerships
ALTER TABLE "dealerships" ADD COLUMN IF NOT EXISTS "email_domain" varchar(255);

-- Create user_sessions table
CREATE TABLE IF NOT EXISTS "user_sessions" (
  "id" serial PRIMARY KEY NOT NULL,
  "user_id" integer NOT NULL,
  "session_token" varchar(255) NOT NULL,
  "expires_at" timestamp NOT NULL,
  "created_at" timestamp DEFAULT now() NOT NULL,
  CONSTRAINT "user_sessions_session_token_unique" UNIQUE("session_token")
);

-- Create invites table
CREATE TABLE IF NOT EXISTS "invites" (
  "id" serial PRIMARY KEY NOT NULL,
  "dealership_id" integer NOT NULL,
  "email" varchar(320) NOT NULL,
  "role" "role" DEFAULT 'salesperson' NOT NULL,
  "invite_token" varchar(255) NOT NULL,
  "status" "invite_status" DEFAULT 'pending' NOT NULL,
  "invited_by_user_id" integer NOT NULL,
  "expires_at" timestamp NOT NULL,
  "accepted_at" timestamp,
  "created_at" timestamp DEFAULT now() NOT NULL,
  CONSTRAINT "invites_invite_token_unique" UNIQUE("invite_token")
);

-- Add user_id to leads for salesperson ownership
ALTER TABLE "leads" ADD COLUMN IF NOT EXISTS "user_id" integer;
