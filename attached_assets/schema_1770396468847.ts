import {
  int,
  mysqlEnum,
  mysqlTable,
  text,
  timestamp,
  varchar,
  boolean,
  decimal,
  json,
} from "drizzle-orm/mysql-core";

/**
 * Core user table backing auth flow.
 * Extend this file with additional tables as your product grows.
 * Columns use camelCase to match both database fields and generated types.
 */
export const users = mysqlTable("users", {
  /**
   * Surrogate primary key. Auto-incremented numeric value managed by the database.
   * Use this for relations between tables.
   */
  id: int("id").autoincrement().primaryKey(),
  /** Manus OAuth identifier (openId) returned from the OAuth callback. Unique per user. */
  openId: varchar("openId", { length: 64 }).notNull().unique(),
  name: text("name"),
  email: varchar("email", { length: 320 }),
  loginMethod: varchar("loginMethod", { length: 64 }),
  role: mysqlEnum("role", ["user", "admin"]).default("user").notNull(),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
  lastSignedIn: timestamp("lastSignedIn").defaultNow().notNull(),
});

export type User = typeof users.$inferSelect;
export type InsertUser = typeof users.$inferInsert;

// Dealership table - stores dealership credentials and info
export const dealerships = mysqlTable("dealerships", {
  id: int("id").autoincrement().primaryKey(),
  name: varchar("name", { length: 255 }).notNull(),
  username: varchar("username", { length: 100 }).notNull().unique(),
  passwordHash: varchar("passwordHash", { length: 255 }).notNull(),
  email: varchar("email", { length: 320 }),
  phone: varchar("phone", { length: 20 }),
  address: text("address"),
  numberOfStores: int("numberOfStores").default(1),
  stores: json("stores"), // Array of store names/locations
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
});

export type Dealership = typeof dealerships.$inferSelect;
export type InsertDealership = typeof dealerships.$inferInsert;

// Dealership sessions - tracks active sessions
export const dealershipSessions = mysqlTable("dealershipSessions", {
  id: int("id").autoincrement().primaryKey(),
  dealershipId: int("dealershipId").notNull(),
  sessionToken: varchar("sessionToken", { length: 255 }).notNull().unique(),
  expiresAt: timestamp("expiresAt").notNull(),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
});

export type DealershipSession = typeof dealershipSessions.$inferSelect;
export type InsertDealershipSession = typeof dealershipSessions.$inferInsert;

// Leads table - stores customer preferences and contact info
export const leads = mysqlTable("leads", {
  id: int("id").autoincrement().primaryKey(),
  dealershipId: int("dealershipId").notNull(), // Which dealership owns this lead
  customerName: varchar("customerName", { length: 255 }).notNull(),
  customerEmail: varchar("customerEmail", { length: 320 }),
  customerPhone: varchar("customerPhone", { length: 20 }),
  
  // Preference type: "model" (specific RV model) or "features" (feature-based search)
  preferenceType: mysqlEnum("preferenceType", ["model", "features"]).notNull(),
  
  // For model-based preferences (e.g., "2025 Tiffin Allegro Bus 45OPP")
  preferredModel: varchar("preferredModel", { length: 255 }),
  preferredYear: int("preferredYear"),
  
  // For feature-based preferences (stored as JSON)
  preferences: json("preferences"),
  
  // Additional notes from salesperson
  notes: text("notes"),
  
  // Status: active, matched, sold, inactive
  status: mysqlEnum("status", ["active", "matched", "sold", "inactive"]).default("active").notNull(),
  
  // Store location (which of the dealership's stores)
  storeLocation: varchar("storeLocation", { length: 100 }),
  
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
});

export type Lead = typeof leads.$inferSelect;
export type InsertLead = typeof leads.$inferInsert;

// Inventory table - tracks incoming RV units
export const inventory = mysqlTable("inventory", {
  id: int("id").autoincrement().primaryKey(),
  dealershipId: int("dealershipId").notNull(), // Which dealership owns this unit
  
  // Unit identification
  vin: varchar("vin", { length: 50 }),
  unitId: varchar("unitId", { length: 100 }).notNull(),
  
  // Basic info
  year: int("year").notNull(),
  make: varchar("make", { length: 100 }).notNull(),
  model: varchar("model", { length: 255 }).notNull(),
  
  // Specifications
  length: decimal("length", { precision: 5, scale: 2 }), // in feet
  weight: decimal("weight", { precision: 8, scale: 2 }), // in lbs
  
  // Bed configuration
  bedType: varchar("bedType", { length: 100 }), // e.g., "king", "queen", "bunk"
  bedCount: int("bedCount"),
  
  // Amenities (stored as JSON array)
  amenities: json("amenities"),
  
  // Bathroom count
  bathrooms: decimal("bathrooms", { precision: 2, scale: 1 }),
  
  // Slide-outs
  slideOutCount: int("slideOutCount"),
  
  // Engine/Fuel info
  fuelType: varchar("fuelType", { length: 50 }), // e.g., "diesel", "gasoline"
  horsepower: int("horsepower"),
  
  // Pricing
  price: decimal("price", { precision: 10, scale: 2 }),
  
  // Status: in_stock, matched, sold, pending
  status: mysqlEnum("status", ["in_stock", "matched", "sold", "pending"]).default("in_stock").notNull(),
  
  // Store location
  storeLocation: varchar("storeLocation", { length: 100 }).notNull(),
  
  // Arrival date
  arrivalDate: timestamp("arrivalDate").notNull(),
  
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
});

export type Inventory = typeof inventory.$inferSelect;
export type InsertInventory = typeof inventory.$inferInsert;

// Matches table - tracks when units are matched with customers
export const matches = mysqlTable("matches", {
  id: int("id").autoincrement().primaryKey(),
  
  // References
  leadId: int("leadId").notNull(),
  inventoryId: int("inventoryId").notNull(),
  
  // Match score (0-100) - how well the unit matches the customer's preferences
  matchScore: int("matchScore").notNull(),
  
  // Reason for match (AI-generated explanation)
  matchReason: text("matchReason"),
  
  // Status: pending, notified, contacted, sold, dismissed
  status: mysqlEnum("status", ["pending", "notified", "contacted", "sold", "dismissed"]).default("pending").notNull(),
  
  // Notification tracking
  notificationSentAt: timestamp("notificationSentAt"),
  notificationMethod: mysqlEnum("notificationMethod", ["email", "sms", "in_app"]),
  
  // Customer contact tracking
  customerContactedAt: timestamp("customerContactedAt"),
  contactNotes: text("contactNotes"),
  
  // Outcome
  outcome: mysqlEnum("outcome", ["sold", "not_interested", "pending", "other"]),
  
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
});

export type Match = typeof matches.$inferSelect;
export type InsertMatch = typeof matches.$inferInsert;

// Match history table - for archiving and analytics
export const matchHistory = mysqlTable("matchHistory", {
  id: int("id").autoincrement().primaryKey(),
  
  // References
  leadId: int("leadId").notNull(),
  inventoryId: int("inventoryId").notNull(),
  matchId: int("matchId"),
  
  // Match details
  matchScore: int("matchScore").notNull(),
  matchReason: text("matchReason"),
  
  // Outcome
  status: varchar("status", { length: 50 }).notNull(),
  outcome: varchar("outcome", { length: 50 }),
  
  // Timeline
  matchedAt: timestamp("matchedAt").defaultNow().notNull(),
  completedAt: timestamp("completedAt"),
  
  createdAt: timestamp("createdAt").defaultNow().notNull(),
});

export type MatchHistory = typeof matchHistory.$inferSelect;
export type InsertMatchHistory = typeof matchHistory.$inferInsert;

// User preferences table - stores app settings per dealership
export const dealershipPreferences = mysqlTable("dealershipPreferences", {
  id: int("id").autoincrement().primaryKey(),
  dealershipId: int("dealershipId").notNull().unique(),
  
  // Store assignments
  stores: json("stores"), // Array of store names
  
  // Notification preferences
  emailNotifications: boolean("emailNotifications").default(true).notNull(),
  smsNotifications: boolean("smsNotifications").default(false).notNull(),
  inAppNotifications: boolean("inAppNotifications").default(true).notNull(),
  
  // Matching preferences
  matchingSensitivity: mysqlEnum("matchingSensitivity", ["strict", "moderate", "loose"]).default("moderate").notNull(),
  
  // UI preferences
  darkMode: boolean("darkMode").default(false).notNull(),
  
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
});

export type DealershipPreferences = typeof dealershipPreferences.$inferSelect;
export type InsertDealershipPreferences = typeof dealershipPreferences.$inferInsert;
