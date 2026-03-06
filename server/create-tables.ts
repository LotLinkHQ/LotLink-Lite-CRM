import { sql } from "drizzle-orm";
import { getDb } from "./db";

export async function createTablesIfNeeded() {
  const database = getDb();
  if (!database) return;

  // Check if schema is correct by testing a known column
  try {
    await database.execute(sql`SELECT password_hash FROM users LIMIT 0`);
    console.log("[DB] Schema OK");
    return; // Tables exist with correct schema
  } catch {
    console.log("[DB] Schema mismatch or missing tables — recreating...");
  }

  // Drop everything and start fresh
  const dropStatements = [
    `DROP TABLE IF EXISTS activity_logs CASCADE`,
    `DROP TABLE IF EXISTS in_app_notifications CASCADE`,
    `DROP TABLE IF EXISTS match_history CASCADE`,
    `DROP TABLE IF EXISTS matches CASCADE`,
    `DROP TABLE IF EXISTS inventory CASCADE`,
    `DROP TABLE IF EXISTS leads CASCADE`,
    `DROP TABLE IF EXISTS dealership_preferences CASCADE`,
    `DROP TABLE IF EXISTS password_reset_tokens CASCADE`,
    `DROP TABLE IF EXISTS invites CASCADE`,
    `DROP TABLE IF EXISTS user_sessions CASCADE`,
    `DROP TABLE IF EXISTS dealership_sessions CASCADE`,
    `DROP TABLE IF EXISTS users CASCADE`,
    `DROP TABLE IF EXISTS dealerships CASCADE`,
    `DROP TABLE IF EXISTS __drizzle_migrations CASCADE`,
    `DROP TYPE IF EXISTS role CASCADE`,
    `DROP TYPE IF EXISTS preference_type CASCADE`,
    `DROP TYPE IF EXISTS lead_status CASCADE`,
    `DROP TYPE IF EXISTS inventory_status CASCADE`,
    `DROP TYPE IF EXISTS match_status CASCADE`,
    `DROP TYPE IF EXISTS notification_method CASCADE`,
    `DROP TYPE IF EXISTS outcome CASCADE`,
    `DROP TYPE IF EXISTS matching_sensitivity CASCADE`,
    `DROP TYPE IF EXISTS invite_status CASCADE`,
  ];

  for (const stmt of dropStatements) {
    await database.execute(sql.raw(stmt));
  }
  console.log("[DB] Dropped old tables/types");

  // Create enums
  await database.execute(sql.raw(`CREATE TYPE role AS ENUM ('salesperson', 'manager', 'admin', 'owner')`));
  await database.execute(sql.raw(`CREATE TYPE preference_type AS ENUM ('model', 'features')`));
  await database.execute(sql.raw(`CREATE TYPE lead_status AS ENUM ('active', 'new', 'contacted', 'working', 'matched', 'sold', 'lost', 'inactive')`));
  await database.execute(sql.raw(`CREATE TYPE inventory_status AS ENUM ('in_stock', 'matched', 'sold', 'pending', 'hold', 'removed')`));
  await database.execute(sql.raw(`CREATE TYPE match_status AS ENUM ('pending', 'notified', 'contacted', 'sold', 'dismissed', 'new', 'appointment')`));
  await database.execute(sql.raw(`CREATE TYPE notification_method AS ENUM ('email', 'sms', 'in_app')`));
  await database.execute(sql.raw(`CREATE TYPE outcome AS ENUM ('sold', 'not_interested', 'pending', 'other')`));
  await database.execute(sql.raw(`CREATE TYPE matching_sensitivity AS ENUM ('strict', 'moderate', 'loose')`));
  await database.execute(sql.raw(`CREATE TYPE invite_status AS ENUM ('pending', 'accepted', 'expired', 'revoked')`));
  console.log("[DB] Created enums");

  // Create tables
  await database.execute(sql.raw(`
    CREATE TABLE dealerships (
      id SERIAL PRIMARY KEY,
      name VARCHAR(255) NOT NULL,
      username VARCHAR(100) NOT NULL UNIQUE,
      password_hash VARCHAR(255) NOT NULL,
      email_domain VARCHAR(255),
      email VARCHAR(320),
      phone VARCHAR(20),
      address TEXT,
      number_of_stores INTEGER DEFAULT 1,
      stores JSON,
      branding JSON,
      website_url VARCHAR(500),
      last_scraped_at TIMESTAMP,
      created_at TIMESTAMP NOT NULL DEFAULT NOW(),
      updated_at TIMESTAMP NOT NULL DEFAULT NOW()
    )
  `));

  await database.execute(sql.raw(`
    CREATE TABLE users (
      id SERIAL PRIMARY KEY,
      email VARCHAR(320) NOT NULL UNIQUE,
      alt_email VARCHAR(320) UNIQUE,
      password_hash VARCHAR(255) NOT NULL,
      name VARCHAR(255) NOT NULL,
      dealership_id INTEGER,
      role role NOT NULL DEFAULT 'salesperson',
      is_active BOOLEAN NOT NULL DEFAULT TRUE,
      created_at TIMESTAMP NOT NULL DEFAULT NOW(),
      updated_at TIMESTAMP NOT NULL DEFAULT NOW(),
      last_signed_in TIMESTAMP,
      push_notifications BOOLEAN NOT NULL DEFAULT TRUE,
      email_notifications BOOLEAN NOT NULL DEFAULT TRUE,
      quiet_hours_start INTEGER,
      quiet_hours_end INTEGER
    )
  `));

  await database.execute(sql.raw(`
    CREATE TABLE dealership_sessions (
      id SERIAL PRIMARY KEY,
      dealership_id INTEGER NOT NULL,
      session_token VARCHAR(255) NOT NULL UNIQUE,
      expires_at TIMESTAMP NOT NULL,
      created_at TIMESTAMP NOT NULL DEFAULT NOW()
    )
  `));

  await database.execute(sql.raw(`
    CREATE TABLE user_sessions (
      id SERIAL PRIMARY KEY,
      user_id INTEGER NOT NULL,
      session_token VARCHAR(255) NOT NULL UNIQUE,
      expires_at TIMESTAMP NOT NULL,
      created_at TIMESTAMP NOT NULL DEFAULT NOW()
    )
  `));

  await database.execute(sql.raw(`
    CREATE TABLE password_reset_tokens (
      id SERIAL PRIMARY KEY,
      user_id INTEGER NOT NULL,
      token VARCHAR(255) NOT NULL UNIQUE,
      expires_at TIMESTAMP NOT NULL,
      used_at TIMESTAMP,
      created_at TIMESTAMP NOT NULL DEFAULT NOW()
    )
  `));

  await database.execute(sql.raw(`
    CREATE TABLE invites (
      id SERIAL PRIMARY KEY,
      dealership_id INTEGER NOT NULL,
      email VARCHAR(320) NOT NULL,
      role role NOT NULL DEFAULT 'salesperson',
      invite_token VARCHAR(255) NOT NULL UNIQUE,
      status invite_status NOT NULL DEFAULT 'pending',
      invited_by_user_id INTEGER NOT NULL,
      expires_at TIMESTAMP NOT NULL,
      accepted_at TIMESTAMP,
      created_at TIMESTAMP NOT NULL DEFAULT NOW()
    )
  `));

  await database.execute(sql.raw(`
    CREATE TABLE leads (
      id SERIAL PRIMARY KEY,
      dealership_id INTEGER NOT NULL,
      user_id INTEGER,
      customer_name VARCHAR(255) NOT NULL,
      customer_email VARCHAR(320),
      customer_phone VARCHAR(20),
      preference_type preference_type NOT NULL,
      preferred_model VARCHAR(255),
      preferred_year INTEGER,
      preferences JSON,
      notes TEXT,
      status lead_status NOT NULL DEFAULT 'active',
      store_location VARCHAR(100),
      salesperson_name VARCHAR(255),
      created_at TIMESTAMP NOT NULL DEFAULT NOW(),
      updated_at TIMESTAMP NOT NULL DEFAULT NOW()
    )
  `));

  await database.execute(sql.raw(`
    CREATE TABLE inventory (
      id SERIAL PRIMARY KEY,
      dealership_id INTEGER NOT NULL,
      vin VARCHAR(50),
      unit_id VARCHAR(100) NOT NULL,
      year INTEGER NOT NULL,
      make VARCHAR(100) NOT NULL,
      model VARCHAR(255) NOT NULL,
      length DECIMAL(5,2),
      weight DECIMAL(8,2),
      bed_type VARCHAR(100),
      bed_count INTEGER,
      amenities JSON,
      bathrooms DECIMAL(2,1),
      slide_out_count INTEGER,
      fuel_type VARCHAR(50),
      horsepower INTEGER,
      price DECIMAL(10,2),
      status inventory_status NOT NULL DEFAULT 'in_stock',
      store_location VARCHAR(100) NOT NULL,
      arrival_date TIMESTAMP NOT NULL,
      hold_by_user_id INTEGER,
      hold_customer_name VARCHAR(255),
      hold_expires_at TIMESTAMP,
      created_at TIMESTAMP NOT NULL DEFAULT NOW(),
      updated_at TIMESTAMP NOT NULL DEFAULT NOW()
    )
  `));

  await database.execute(sql.raw(`
    CREATE TABLE matches (
      id SERIAL PRIMARY KEY,
      lead_id INTEGER NOT NULL,
      inventory_id INTEGER NOT NULL,
      match_score INTEGER NOT NULL,
      match_reason TEXT,
      status match_status NOT NULL DEFAULT 'pending',
      notification_sent_at TIMESTAMP,
      notification_method notification_method,
      customer_contacted_at TIMESTAMP,
      contact_notes TEXT,
      outcome outcome,
      dismiss_reason VARCHAR(255),
      last_matched_price DECIMAL(10,2),
      created_at TIMESTAMP NOT NULL DEFAULT NOW(),
      updated_at TIMESTAMP NOT NULL DEFAULT NOW()
    )
  `));

  await database.execute(sql.raw(`
    CREATE TABLE match_history (
      id SERIAL PRIMARY KEY,
      lead_id INTEGER NOT NULL,
      inventory_id INTEGER NOT NULL,
      match_id INTEGER,
      match_score INTEGER NOT NULL,
      match_reason TEXT,
      status VARCHAR(50) NOT NULL,
      outcome VARCHAR(50),
      matched_at TIMESTAMP NOT NULL DEFAULT NOW(),
      completed_at TIMESTAMP,
      created_at TIMESTAMP NOT NULL DEFAULT NOW()
    )
  `));

  await database.execute(sql.raw(`
    CREATE TABLE dealership_preferences (
      id SERIAL PRIMARY KEY,
      dealership_id INTEGER NOT NULL UNIQUE,
      stores JSON,
      email_notifications BOOLEAN NOT NULL DEFAULT TRUE,
      sms_notifications BOOLEAN NOT NULL DEFAULT FALSE,
      in_app_notifications BOOLEAN NOT NULL DEFAULT TRUE,
      matching_sensitivity matching_sensitivity NOT NULL DEFAULT 'moderate',
      match_threshold INTEGER NOT NULL DEFAULT 60,
      dark_mode BOOLEAN NOT NULL DEFAULT FALSE,
      created_at TIMESTAMP NOT NULL DEFAULT NOW(),
      updated_at TIMESTAMP NOT NULL DEFAULT NOW()
    )
  `));

  await database.execute(sql.raw(`
    CREATE TABLE in_app_notifications (
      id SERIAL PRIMARY KEY,
      dealership_id INTEGER NOT NULL,
      lead_id INTEGER,
      inventory_id INTEGER,
      match_id INTEGER,
      title VARCHAR(255) NOT NULL,
      message TEXT NOT NULL,
      is_read BOOLEAN NOT NULL DEFAULT FALSE,
      created_at TIMESTAMP NOT NULL DEFAULT NOW()
    )
  `));

  await database.execute(sql.raw(`
    CREATE TABLE activity_logs (
      id SERIAL PRIMARY KEY,
      user_id INTEGER NOT NULL,
      dealership_id INTEGER,
      action VARCHAR(100) NOT NULL,
      metadata JSON,
      session_duration INTEGER,
      created_at TIMESTAMP NOT NULL DEFAULT NOW()
    )
  `));

  console.log("[DB] All tables created successfully");
}
