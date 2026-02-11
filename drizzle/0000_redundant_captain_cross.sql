CREATE TYPE "public"."inventory_status" AS ENUM('in_stock', 'matched', 'sold', 'pending');--> statement-breakpoint
CREATE TYPE "public"."lead_status" AS ENUM('active', 'matched', 'sold', 'inactive');--> statement-breakpoint
CREATE TYPE "public"."match_status" AS ENUM('pending', 'notified', 'contacted', 'sold', 'dismissed');--> statement-breakpoint
CREATE TYPE "public"."matching_sensitivity" AS ENUM('strict', 'moderate', 'loose');--> statement-breakpoint
CREATE TYPE "public"."notification_method" AS ENUM('email', 'sms', 'in_app');--> statement-breakpoint
CREATE TYPE "public"."outcome" AS ENUM('sold', 'not_interested', 'pending', 'other');--> statement-breakpoint
CREATE TYPE "public"."preference_type" AS ENUM('model', 'features');--> statement-breakpoint
CREATE TYPE "public"."role" AS ENUM('user', 'admin');--> statement-breakpoint
CREATE TABLE "dealership_preferences" (
	"id" serial PRIMARY KEY NOT NULL,
	"dealership_id" integer NOT NULL,
	"stores" json,
	"email_notifications" boolean DEFAULT true NOT NULL,
	"sms_notifications" boolean DEFAULT false NOT NULL,
	"in_app_notifications" boolean DEFAULT true NOT NULL,
	"matching_sensitivity" "matching_sensitivity" DEFAULT 'moderate' NOT NULL,
	"dark_mode" boolean DEFAULT false NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "dealership_preferences_dealership_id_unique" UNIQUE("dealership_id")
);
--> statement-breakpoint
CREATE TABLE "dealership_sessions" (
	"id" serial PRIMARY KEY NOT NULL,
	"dealership_id" integer NOT NULL,
	"session_token" varchar(255) NOT NULL,
	"expires_at" timestamp NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "dealership_sessions_session_token_unique" UNIQUE("session_token")
);
--> statement-breakpoint
CREATE TABLE "dealerships" (
	"id" serial PRIMARY KEY NOT NULL,
	"name" varchar(255) NOT NULL,
	"username" varchar(100) NOT NULL,
	"password_hash" varchar(255) NOT NULL,
	"email" varchar(320),
	"phone" varchar(20),
	"address" text,
	"number_of_stores" integer DEFAULT 1,
	"stores" json,
	"branding" json,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "dealerships_username_unique" UNIQUE("username")
);
--> statement-breakpoint
CREATE TABLE "in_app_notifications" (
	"id" serial PRIMARY KEY NOT NULL,
	"dealership_id" integer NOT NULL,
	"lead_id" integer,
	"inventory_id" integer,
	"match_id" integer,
	"title" varchar(255) NOT NULL,
	"message" text NOT NULL,
	"is_read" boolean DEFAULT false NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "inventory" (
	"id" serial PRIMARY KEY NOT NULL,
	"dealership_id" integer NOT NULL,
	"vin" varchar(50),
	"unit_id" varchar(100) NOT NULL,
	"year" integer NOT NULL,
	"make" varchar(100) NOT NULL,
	"model" varchar(255) NOT NULL,
	"length" numeric(5, 2),
	"weight" numeric(8, 2),
	"bed_type" varchar(100),
	"bed_count" integer,
	"amenities" json,
	"bathrooms" numeric(2, 1),
	"slide_out_count" integer,
	"fuel_type" varchar(50),
	"horsepower" integer,
	"price" numeric(10, 2),
	"status" "inventory_status" DEFAULT 'in_stock' NOT NULL,
	"store_location" varchar(100) NOT NULL,
	"arrival_date" timestamp NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "leads" (
	"id" serial PRIMARY KEY NOT NULL,
	"dealership_id" integer NOT NULL,
	"customer_name" varchar(255) NOT NULL,
	"customer_email" varchar(320),
	"customer_phone" varchar(20),
	"preference_type" "preference_type" NOT NULL,
	"preferred_model" varchar(255),
	"preferred_year" integer,
	"preferences" json,
	"notes" text,
	"status" "lead_status" DEFAULT 'active' NOT NULL,
	"store_location" varchar(100),
	"salesperson_name" varchar(255),
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "match_history" (
	"id" serial PRIMARY KEY NOT NULL,
	"lead_id" integer NOT NULL,
	"inventory_id" integer NOT NULL,
	"match_id" integer,
	"match_score" integer NOT NULL,
	"match_reason" text,
	"status" varchar(50) NOT NULL,
	"outcome" varchar(50),
	"matched_at" timestamp DEFAULT now() NOT NULL,
	"completed_at" timestamp,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "matches" (
	"id" serial PRIMARY KEY NOT NULL,
	"lead_id" integer NOT NULL,
	"inventory_id" integer NOT NULL,
	"match_score" integer NOT NULL,
	"match_reason" text,
	"status" "match_status" DEFAULT 'pending' NOT NULL,
	"notification_sent_at" timestamp,
	"notification_method" "notification_method",
	"customer_contacted_at" timestamp,
	"contact_notes" text,
	"outcome" "outcome",
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "users" (
	"id" serial PRIMARY KEY NOT NULL,
	"open_id" varchar(64) NOT NULL,
	"name" text,
	"email" varchar(320),
	"login_method" varchar(64),
	"role" "role" DEFAULT 'user' NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL,
	"last_signed_in" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "users_open_id_unique" UNIQUE("open_id")
);
