import {
  integer,
  pgEnum,
  pgTable,
  text,
  timestamp,
  varchar,
  boolean,
  decimal,
  json,
  serial,
} from "drizzle-orm/pg-core";

export const roleEnum = pgEnum("role", ["salesperson", "manager", "admin", "owner"]);
export const preferenceTypeEnum = pgEnum("preference_type", ["model", "features"]);
export const leadStatusEnum = pgEnum("lead_status", ["active", "new", "contacted", "working", "matched", "sold", "lost", "inactive"]);
export const inventoryStatusEnum = pgEnum("inventory_status", ["in_stock", "matched", "sold", "pending", "hold", "removed"]);
export const matchStatusEnum = pgEnum("match_status", ["pending", "notified", "contacted", "sold", "dismissed", "new", "appointment"]);
export const notificationMethodEnum = pgEnum("notification_method", ["email", "sms", "in_app"]);
export const outcomeEnum = pgEnum("outcome", ["sold", "not_interested", "pending", "other"]);
export const matchingSensitivityEnum = pgEnum("matching_sensitivity", ["strict", "moderate", "loose"]);
export const inviteStatusEnum = pgEnum("invite_status", ["pending", "accepted", "expired", "revoked"]);

export const users = pgTable("users", {
  id: serial("id").primaryKey(),
  email: varchar("email", { length: 320 }).notNull().unique(),
  altEmail: varchar("alt_email", { length: 320 }).unique(),
  passwordHash: varchar("password_hash", { length: 255 }).notNull(),
  name: varchar("name", { length: 255 }).notNull(),
  dealershipId: integer("dealership_id"),
  role: roleEnum("role").default("salesperson").notNull(),
  isActive: boolean("is_active").default(true).notNull(),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
  lastSignedIn: timestamp("last_signed_in"),
});

export type User = typeof users.$inferSelect;
export type InsertUser = typeof users.$inferInsert;

export const dealerships = pgTable("dealerships", {
  id: serial("id").primaryKey(),
  name: varchar("name", { length: 255 }).notNull(),
  username: varchar("username", { length: 100 }).notNull().unique(),
  passwordHash: varchar("password_hash", { length: 255 }).notNull(),
  emailDomain: varchar("email_domain", { length: 255 }),
  email: varchar("email", { length: 320 }),
  phone: varchar("phone", { length: 20 }),
  address: text("address"),
  numberOfStores: integer("number_of_stores").default(1),
  stores: json("stores"),
  branding: json("branding"), // { primaryColor, logoUrl, showPoweredBy }
  websiteUrl: varchar("website_url", { length: 500 }),
  lastScrapedAt: timestamp("last_scraped_at"),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
});

export type Dealership = typeof dealerships.$inferSelect;
export type InsertDealership = typeof dealerships.$inferInsert;

export const dealershipSessions = pgTable("dealership_sessions", {
  id: serial("id").primaryKey(),
  dealershipId: integer("dealership_id").notNull(),
  sessionToken: varchar("session_token", { length: 255 }).notNull().unique(),
  expiresAt: timestamp("expires_at").notNull(),
  createdAt: timestamp("created_at").defaultNow().notNull(),
});

export type DealershipSession = typeof dealershipSessions.$inferSelect;
export type InsertDealershipSession = typeof dealershipSessions.$inferInsert;

export const userSessions = pgTable("user_sessions", {
  id: serial("id").primaryKey(),
  userId: integer("user_id").notNull(),
  sessionToken: varchar("session_token", { length: 255 }).notNull().unique(),
  expiresAt: timestamp("expires_at").notNull(),
  createdAt: timestamp("created_at").defaultNow().notNull(),
});

export type UserSession = typeof userSessions.$inferSelect;
export type InsertUserSession = typeof userSessions.$inferInsert;

export const passwordResetTokens = pgTable("password_reset_tokens", {
  id: serial("id").primaryKey(),
  userId: integer("user_id").notNull(),
  token: varchar("token", { length: 255 }).notNull().unique(),
  expiresAt: timestamp("expires_at").notNull(),
  usedAt: timestamp("used_at"),
  createdAt: timestamp("created_at").defaultNow().notNull(),
});

export type PasswordResetToken = typeof passwordResetTokens.$inferSelect;

export const invites = pgTable("invites", {
  id: serial("id").primaryKey(),
  dealershipId: integer("dealership_id").notNull(),
  email: varchar("email", { length: 320 }).notNull(),
  role: roleEnum("role").default("salesperson").notNull(),
  inviteToken: varchar("invite_token", { length: 255 }).notNull().unique(),
  status: inviteStatusEnum("status").default("pending").notNull(),
  invitedByUserId: integer("invited_by_user_id").notNull(),
  expiresAt: timestamp("expires_at").notNull(),
  acceptedAt: timestamp("accepted_at"),
  createdAt: timestamp("created_at").defaultNow().notNull(),
});

export type Invite = typeof invites.$inferSelect;
export type InsertInvite = typeof invites.$inferInsert;

export const leads = pgTable("leads", {
  id: serial("id").primaryKey(),
  dealershipId: integer("dealership_id").notNull(),
  userId: integer("user_id"),
  customerName: varchar("customer_name", { length: 255 }).notNull(),
  customerEmail: varchar("customer_email", { length: 320 }),
  customerPhone: varchar("customer_phone", { length: 20 }),
  preferenceType: preferenceTypeEnum("preference_type").notNull(),
  preferredModel: varchar("preferred_model", { length: 255 }),
  preferredYear: integer("preferred_year"),
  preferences: json("preferences"),
  notes: text("notes"),
  status: leadStatusEnum("status").default("active").notNull(),
  storeLocation: varchar("store_location", { length: 100 }),
  salespersonName: varchar("salesperson_name", { length: 255 }),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
});

export type Lead = typeof leads.$inferSelect;
export type InsertLead = typeof leads.$inferInsert;

export const inventory = pgTable("inventory", {
  id: serial("id").primaryKey(),
  dealershipId: integer("dealership_id").notNull(),
  vin: varchar("vin", { length: 50 }),
  unitId: varchar("unit_id", { length: 100 }).notNull(),
  year: integer("year").notNull(),
  make: varchar("make", { length: 100 }).notNull(),
  model: varchar("model", { length: 255 }).notNull(),
  length: decimal("length", { precision: 5, scale: 2 }),
  weight: decimal("weight", { precision: 8, scale: 2 }),
  bedType: varchar("bed_type", { length: 100 }),
  bedCount: integer("bed_count"),
  amenities: json("amenities"),
  bathrooms: decimal("bathrooms", { precision: 2, scale: 1 }),
  slideOutCount: integer("slide_out_count"),
  fuelType: varchar("fuel_type", { length: 50 }),
  horsepower: integer("horsepower"),
  price: decimal("price", { precision: 10, scale: 2 }),
  status: inventoryStatusEnum("status").default("in_stock").notNull(),
  storeLocation: varchar("store_location", { length: 100 }).notNull(),
  arrivalDate: timestamp("arrival_date").notNull(),
  holdByUserId: integer("hold_by_user_id"),
  holdCustomerName: varchar("hold_customer_name", { length: 255 }),
  holdExpiresAt: timestamp("hold_expires_at"),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
});

export type Inventory = typeof inventory.$inferSelect;
export type InsertInventory = typeof inventory.$inferInsert;

export const matches = pgTable("matches", {
  id: serial("id").primaryKey(),
  leadId: integer("lead_id").notNull(),
  inventoryId: integer("inventory_id").notNull(),
  matchScore: integer("match_score").notNull(),
  matchReason: text("match_reason"),
  status: matchStatusEnum("status").default("pending").notNull(),
  notificationSentAt: timestamp("notification_sent_at"),
  notificationMethod: notificationMethodEnum("notification_method"),
  customerContactedAt: timestamp("customer_contacted_at"),
  contactNotes: text("contact_notes"),
  outcome: outcomeEnum("outcome"),
  dismissReason: varchar("dismiss_reason", { length: 255 }),
  lastMatchedPrice: decimal("last_matched_price", { precision: 10, scale: 2 }),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
});

export type Match = typeof matches.$inferSelect;
export type InsertMatch = typeof matches.$inferInsert;

export const matchHistory = pgTable("match_history", {
  id: serial("id").primaryKey(),
  leadId: integer("lead_id").notNull(),
  inventoryId: integer("inventory_id").notNull(),
  matchId: integer("match_id"),
  matchScore: integer("match_score").notNull(),
  matchReason: text("match_reason"),
  status: varchar("status", { length: 50 }).notNull(),
  outcome: varchar("outcome", { length: 50 }),
  matchedAt: timestamp("matched_at").defaultNow().notNull(),
  completedAt: timestamp("completed_at"),
  createdAt: timestamp("created_at").defaultNow().notNull(),
});

export type MatchHistory = typeof matchHistory.$inferSelect;
export type InsertMatchHistory = typeof matchHistory.$inferInsert;

export const dealershipPreferences = pgTable("dealership_preferences", {
  id: serial("id").primaryKey(),
  dealershipId: integer("dealership_id").notNull().unique(),
  stores: json("stores"),
  emailNotifications: boolean("email_notifications").default(true).notNull(),
  smsNotifications: boolean("sms_notifications").default(false).notNull(),
  inAppNotifications: boolean("in_app_notifications").default(true).notNull(),
  matchingSensitivity: matchingSensitivityEnum("matching_sensitivity").default("moderate").notNull(),
  matchThreshold: integer("match_threshold").default(60).notNull(),
  darkMode: boolean("dark_mode").default(false).notNull(),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
});

export type DealershipPreferences = typeof dealershipPreferences.$inferSelect;
export type InsertDealershipPreferences = typeof dealershipPreferences.$inferInsert;

export const inAppNotifications = pgTable("in_app_notifications", {
  id: serial("id").primaryKey(),
  dealershipId: integer("dealership_id").notNull(),
  leadId: integer("lead_id"),
  inventoryId: integer("inventory_id"),
  matchId: integer("match_id"),
  title: varchar("title", { length: 255 }).notNull(),
  message: text("message").notNull(),
  isRead: boolean("is_read").default(false).notNull(),
  createdAt: timestamp("created_at").defaultNow().notNull(),
});

export type InAppNotification = typeof inAppNotifications.$inferSelect;
export type InsertInAppNotification = typeof inAppNotifications.$inferInsert;

export const activityLogs = pgTable("activity_logs", {
  id: serial("id").primaryKey(),
  userId: integer("user_id").notNull(),
  dealershipId: integer("dealership_id"),
  action: varchar("action", { length: 100 }).notNull(),
  metadata: json("metadata"),
  sessionDuration: integer("session_duration"),
  createdAt: timestamp("created_at").defaultNow().notNull(),
});

export type ActivityLog = typeof activityLogs.$inferSelect;
export type InsertActivityLog = typeof activityLogs.$inferInsert;
