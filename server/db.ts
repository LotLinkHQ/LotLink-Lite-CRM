import { eq, and, like, desc, lt, sql, gte, count, or, inArray } from "drizzle-orm";
import { drizzle } from "drizzle-orm/postgres-js";
import postgres from "postgres";
import {
  InsertUser,
  users,
  leads,
  inventory,
  matches,
  matchHistory,
  dealershipPreferences,
  dealerships,
  dealershipSessions,
  userSessions,
  invites,
  InsertLead,
  InsertInventory,
  InsertMatch,
  InsertMatchHistory,
  InsertDealershipPreferences,
  InsertDealership,
  InsertDealershipSession,
  InsertUserSession,
  InsertInvite,
  inAppNotifications,
  InsertInAppNotification,
  activityLogs,
  InsertActivityLog,
  passwordResetTokens,
} from "../shared/schema";
import { readFileSync, existsSync } from "fs";
import { join } from "path";

let _db: ReturnType<typeof drizzle> | null = null;
const _useJsonFallback = !process.env.DATABASE_URL;

if (_useJsonFallback) {
  if (process.env.NODE_ENV === "production") {
    console.error("[DB] FATAL: DATABASE_URL is required in production. Exiting.");
    process.exit(1);
  }
  console.log("[DB] No DATABASE_URL set — using JSON file for inventory data (dev mode only)");
}

export function getDb() {
  if (!_db) {
    if (!process.env.DATABASE_URL) {
      return null as any;
    }
    const url = process.env.DATABASE_URL;
    const isLocal = url.includes("localhost") || url.includes("127.0.0.1");
    const client = postgres(url, {
      ssl: isLocal ? false : "require",
    });
    _db = drizzle(client);
  }
  return _db;
}

export function isUsingJsonFallback() {
  return _useJsonFallback;
}

// Load inventory from JSON file when no database is available
function loadInventoryFromJson() {
  const jsonPath = join(process.cwd(), "poulsbo-rv-inventory.json");
  if (!existsSync(jsonPath)) return [];

  const raw = JSON.parse(readFileSync(jsonPath, "utf-8"));
  return raw.map((rv: any, index: number) => ({
    id: index + 1,
    dealershipId: 1,
    vin: rv.vin || null,
    unitId: rv.stock_number || rv.vin || `PRV-${index + 1}`,
    year: rv.year || 2024,
    make: rv.make || "Unknown",
    model: (rv.model || "Unknown") + (rv.trim ? " " + rv.trim : ""),
    length: rv.length_ft ? String(rv.length_ft) : null,
    weight: rv.weight_lbs ? String(rv.weight_lbs) : null,
    bedType: null as string | null,
    bedCount: null as number | null,
    amenities: rv.features || null,
    bathrooms: null as string | null,
    slideOutCount: rv.slides || null,
    fuelType: rv.fuel_type || null,
    horsepower: null as number | null,
    price: rv.price ? String(rv.price) : null,
    status: "in_stock" as const,
    storeLocation: rv.location || "Poulsbo RV",
    arrivalDate: new Date(rv.scraped_at || Date.now()),
    createdAt: new Date(rv.scraped_at || Date.now()),
    updatedAt: new Date(rv.updated_at || rv.scraped_at || Date.now()),
  }));
}

export async function getUserLeads(dealershipId: number, cursor?: number, limit: number = 50, userId?: number) {
  if (_useJsonFallback) return [];
  const db = getDb();
  const conditions = [eq(leads.dealershipId, dealershipId)];

  if (userId !== undefined) {
    conditions.push(eq(leads.userId, userId));
  }

  if (cursor) {
    conditions.push(lt(leads.id, cursor));
  }

  return db
    .select()
    .from(leads)
    .where(and(...conditions))
    .orderBy(desc(leads.id))
    .limit(limit + 1);
}

export async function getLeadById(id: number) {
  if (_useJsonFallback) return null;
  const db = getDb();
  const result = await db.select().from(leads).where(eq(leads.id, id));
  return result[0] || null;
}

export async function createLead(data: InsertLead) {
  if (_useJsonFallback) return null;
  const db = getDb();
  const result = await db.insert(leads).values(data).returning();
  return result[0];
}

export async function updateLead(id: number, data: Partial<InsertLead>) {
  if (_useJsonFallback) return;
  const db = getDb();
  await db.update(leads).set({ ...data, updatedAt: new Date() }).where(eq(leads.id, id));
}

export async function deleteLead(id: number) {
  if (_useJsonFallback) return;
  const db = getDb();
  await db.delete(leads).where(eq(leads.id, id));
}

export async function searchLeads(dealershipId: number, query: string) {
  if (_useJsonFallback) return [];
  const db = getDb();
  return db
    .select()
    .from(leads)
    .where(
      and(
        eq(leads.dealershipId, dealershipId),
        or(
          like(leads.customerName, `%${query}%`),
          like(leads.customerPhone, `%${query}%`),
          like(leads.customerEmail, `%${query}%`)
        )
      )
    )
    .orderBy(desc(leads.createdAt));
}

export async function getUserInventory(dealershipId: number, cursor?: number, limit: number = 50) {
  if (_useJsonFallback) {
    const all = loadInventoryFromJson();
    const startIndex = cursor ? cursor : 0;
    return all.slice(startIndex, startIndex + limit + 1);
  }
  const db = getDb();
  let whereClause = eq(inventory.dealershipId, dealershipId);

  if (cursor) {
    whereClause = and(whereClause, lt(inventory.id, cursor)) as any;
  }

  return db
    .select()
    .from(inventory)
    .where(whereClause)
    .orderBy(desc(inventory.id))
    .limit(limit + 1);
}

export async function getInventoryById(id: number) {
  if (_useJsonFallback) {
    const all = loadInventoryFromJson();
    return all.find((item: any) => item.id === id) || null;
  }
  const db = getDb();
  const result = await db.select().from(inventory).where(eq(inventory.id, id));
  return result[0] || null;
}

export async function createInventory(data: InsertInventory) {
  if (_useJsonFallback) return null;
  const db = getDb();
  const result = await db.insert(inventory).values(data).returning();
  return result[0];
}

export async function updateInventory(id: number, data: Partial<InsertInventory>) {
  if (_useJsonFallback) return;
  const db = getDb();
  await db.update(inventory).set({ ...data, updatedAt: new Date() }).where(eq(inventory.id, id));
}

export async function deleteInventory(id: number) {
  if (_useJsonFallback) return;
  const db = getDb();
  await db.delete(inventory).where(eq(inventory.id, id));
}

export async function getMatchesByLeadId(leadId: number) {
  if (_useJsonFallback) return [];
  const db = getDb();
  return db
    .select()
    .from(matches)
    .where(eq(matches.leadId, leadId))
    .orderBy(desc(matches.createdAt));
}

export async function getMatchesByLeadIds(leadIds: number[]) {
  if (_useJsonFallback) return [];
  const db = getDb();
  if (leadIds.length === 0) return [];
  return db
    .select()
    .from(matches)
    .where(inArray(matches.leadId, leadIds))
    .orderBy(desc(matches.createdAt));
}

export async function getMatchesByInventoryId(inventoryId: number) {
  if (_useJsonFallback) return [];
  const db = getDb();
  return db
    .select()
    .from(matches)
    .where(eq(matches.inventoryId, inventoryId))
    .orderBy(desc(matches.createdAt));
}

export async function createMatch(data: InsertMatch) {
  if (_useJsonFallback) return null;
  const db = getDb();
  const result = await db.insert(matches).values(data).returning();
  return result[0];
}

export async function updateMatch(id: number, data: Partial<InsertMatch>) {
  if (_useJsonFallback) return;
  const db = getDb();
  await db.update(matches).set({ ...data, updatedAt: new Date() }).where(eq(matches.id, id));
}

export async function getMatchById(id: number) {
  if (_useJsonFallback) return null;
  const db = getDb();
  const result = await db.select().from(matches).where(eq(matches.id, id));
  return result[0] || null;
}

export async function createMatchHistory(data: InsertMatchHistory) {
  if (_useJsonFallback) return;
  const db = getDb();
  await db.insert(matchHistory).values(data);
}

export async function getMatchHistoryByLeadId(leadId: number) {
  if (_useJsonFallback) return [];
  const db = getDb();
  return db
    .select()
    .from(matchHistory)
    .where(eq(matchHistory.leadId, leadId))
    .orderBy(desc(matchHistory.matchedAt));
}

export async function getDealershipPreferences(dealershipId: number) {
  if (_useJsonFallback) return null;
  const db = getDb();
  const result = await db
    .select()
    .from(dealershipPreferences)
    .where(eq(dealershipPreferences.dealershipId, dealershipId));
  return result[0] || null;
}

export async function createDealershipPreferences(data: InsertDealershipPreferences) {
  if (_useJsonFallback) return;
  const db = getDb();
  await db.insert(dealershipPreferences).values(data);
}

export async function updateDealershipPreferences(
  dealershipId: number,
  data: Partial<InsertDealershipPreferences>
) {
  if (_useJsonFallback) return;
  const db = getDb();
  await db
    .update(dealershipPreferences)
    .set({ ...data, updatedAt: new Date() })
    .where(eq(dealershipPreferences.dealershipId, dealershipId));
}

export async function getDealershipByUsername(username: string) {
  if (_useJsonFallback) {
    if (username === "demo") {
      return { id: 1, username: "demo", name: "Poulsbo RV", passwordHash: "", email: null, phone: null, address: null, numberOfStores: 1, stores: ["Poulsbo RV"], createdAt: new Date(), updatedAt: new Date() };
    }
    return null;
  }
  const db = getDb();
  const result = await db
    .select()
    .from(dealerships)
    .where(eq(dealerships.username, username));
  return result[0] || null;
}

export async function getDealershipById(id: number) {
  if (_useJsonFallback) {
    if (id === 1) {
      return { id: 1, username: "demo", name: "Poulsbo RV", passwordHash: "", email: null, phone: null, address: null, numberOfStores: 1, stores: ["Poulsbo RV"], createdAt: new Date(), updatedAt: new Date() };
    }
    return null;
  }
  const db = getDb();
  const result = await db
    .select()
    .from(dealerships)
    .where(eq(dealerships.id, id));
  return result[0] || null;
}

export async function createDealership(data: InsertDealership) {
  if (_useJsonFallback) return null;
  const db = getDb();
  const result = await db.insert(dealerships).values(data).returning();
  return result[0];
}

export async function createDealershipSession(data: InsertDealershipSession) {
  if (_useJsonFallback) return null;
  const db = getDb();
  const result = await db.insert(dealershipSessions).values(data).returning();
  return result[0];
}

export async function getDealershipSessionByToken(token: string) {
  if (_useJsonFallback) return null;
  const db = getDb();
  const result = await db
    .select()
    .from(dealershipSessions)
    .where(eq(dealershipSessions.sessionToken, token));
  return result[0] || null;
}

export async function deleteDealershipSession(token: string) {
  if (_useJsonFallback) return;
  const db = getDb();
  await db.delete(dealershipSessions).where(eq(dealershipSessions.sessionToken, token));
}

export async function getAllDealershipLeads(dealershipId: number) {
  if (_useJsonFallback) return [];
  const db = getDb();
  return db
    .select()
    .from(leads)
    .where(
      and(
        eq(leads.dealershipId, dealershipId),
        inArray(leads.status, ["new", "active", "contacted", "working", "matched"])
      )
    )
    .orderBy(desc(leads.createdAt));
}

export async function getAllDealershipMatches(dealershipId: number, cursor?: number, limit: number = 20) {
  if (_useJsonFallback) return [];
  const db = getDb();

  let whereClause = eq(leads.dealershipId, dealershipId);

  if (cursor) {
    whereClause = and(whereClause, lt(matches.id, cursor)) as any;
  }

  return db
    .select({
      id: matches.id,
      match: matches,
      lead: leads,
      unit: inventory,
    })
    .from(matches)
    .innerJoin(leads, eq(matches.leadId, leads.id))
    .innerJoin(inventory, eq(matches.inventoryId, inventory.id))
    .where(whereClause)
    .orderBy(desc(matches.id))
    .limit(limit + 1);
}

export async function createInAppNotification(data: InsertInAppNotification) {
  if (_useJsonFallback) return null;
  const db = getDb();
  const result = await db.insert(inAppNotifications).values(data).returning();
  return result[0];
}

export async function getInAppNotifications(dealershipId: number, limit: number = 20) {
  if (_useJsonFallback) return [];
  const db = getDb();
  return db
    .select()
    .from(inAppNotifications)
    .where(eq(inAppNotifications.dealershipId, dealershipId))
    .orderBy(desc(inAppNotifications.createdAt))
    .limit(limit);
}

export async function markNotificationAsRead(id: number) {
  if (_useJsonFallback) return;
  const db = getDb();
  await db
    .update(inAppNotifications)
    .set({ isRead: true })
    .where(eq(inAppNotifications.id, id));
}

export async function updateDealership(id: number, data: Partial<InsertDealership>) {
  if (_useJsonFallback) return;
  const db = getDb();
  await db.update(dealerships).set({ ...data, updatedAt: new Date() }).where(eq(dealerships.id, id));
}

export async function getInventoryByUnitId(unitId: string, dealershipId: number) {
  if (_useJsonFallback) {
    const all = loadInventoryFromJson();
    return all.find((item: any) => item.unitId === unitId) || null;
  }
  const db = getDb();
  const result = await db
    .select()
    .from(inventory)
    .where(and(eq(inventory.unitId, unitId), eq(inventory.dealershipId, dealershipId)));
  return result[0] || null;
}

export async function getUnreadNotificationCount(dealershipId: number) {
  if (_useJsonFallback) return 0;
  const db = getDb();
  const [result] = await db
    .select({ count: count() })
    .from(inAppNotifications)
    .where(
      and(
        eq(inAppNotifications.dealershipId, dealershipId),
        eq(inAppNotifications.isRead, false)
      )
    );
  return result.count;
}

// ─── User functions ───

export async function getUserByEmail(email: string) {
  if (_useJsonFallback) return null;
  const db = getDb();
  const emailLower = email.toLowerCase();
  const result = await db.select().from(users).where(
    or(eq(users.email, emailLower), eq(users.altEmail, emailLower))
  );
  return result[0] || null;
}

export async function getUserById(id: number) {
  if (_useJsonFallback) {
    if (id === 1) {
      return {
        id: 1, email: "demo@demo.com", passwordHash: "", name: "Demo User",
        dealershipId: 1, role: "admin" as const, isActive: true,
        createdAt: new Date(), updatedAt: new Date(), lastSignedIn: null,
      };
    }
    return null;
  }
  const db = getDb();
  const result = await db.select().from(users).where(eq(users.id, id));
  return result[0] || null;
}

export async function createUser(data: InsertUser) {
  if (_useJsonFallback) return null;
  const db = getDb();
  const result = await db.insert(users).values({
    ...data,
    email: data.email.toLowerCase(),
  }).returning();
  return result[0];
}

export async function updateUser(id: number, data: Partial<InsertUser>) {
  if (_useJsonFallback) return;
  const db = getDb();
  await db.update(users).set({ ...data, updatedAt: new Date() }).where(eq(users.id, id));
}

export async function getUsersByDealershipId(dealershipId: number) {
  if (_useJsonFallback) return [];
  const db = getDb();
  return db.select().from(users).where(eq(users.dealershipId, dealershipId)).orderBy(desc(users.createdAt));
}

// ─── User session functions ───

export async function createUserSession(data: InsertUserSession) {
  if (_useJsonFallback) return null;
  const db = getDb();
  const result = await db.insert(userSessions).values(data).returning();
  return result[0];
}

export async function getUserSessionByToken(token: string) {
  if (_useJsonFallback) return null;
  const db = getDb();
  const result = await db.select().from(userSessions).where(eq(userSessions.sessionToken, token));
  return result[0] || null;
}

export async function deleteUserSession(token: string) {
  if (_useJsonFallback) return;
  const db = getDb();
  await db.delete(userSessions).where(eq(userSessions.sessionToken, token));
}

export async function deleteAllUserSessions(userId: number) {
  if (_useJsonFallback) return;
  const db = getDb();
  await db.delete(userSessions).where(eq(userSessions.userId, userId));
}

export async function countUserSessions(userId: number): Promise<number> {
  if (_useJsonFallback) return 0;
  const db = getDb();
  const [result] = await db.select({ count: count() }).from(userSessions).where(eq(userSessions.userId, userId));
  return result.count;
}

export async function deleteOldestUserSession(userId: number) {
  if (_useJsonFallback) return;
  const db = getDb();
  const oldest = await db.select().from(userSessions)
    .where(eq(userSessions.userId, userId))
    .orderBy(userSessions.createdAt)
    .limit(1);
  if (oldest.length > 0) {
    await db.delete(userSessions).where(eq(userSessions.id, oldest[0].id));
  }
}

export async function extendSession(token: string) {
  if (_useJsonFallback) return;
  const db = getDb();
  const newExpiry = new Date(Date.now() + 30 * 24 * 60 * 60 * 1000);
  await db.update(userSessions).set({ expiresAt: newExpiry }).where(eq(userSessions.sessionToken, token));
}

export async function cleanupExpiredSessions() {
  if (_useJsonFallback) return 0;
  const db = getDb();
  const result = await db.delete(userSessions).where(lt(userSessions.expiresAt, new Date())).returning();
  return result.length;
}

// ─── Password Reset ───

export async function createPasswordResetToken(userId: number, token: string, expiresAt: Date) {
  if (_useJsonFallback) return null;
  const db = getDb();
  const [row] = await db.insert(passwordResetTokens).values({ userId, token, expiresAt }).returning();
  return row;
}

export async function getPasswordResetToken(token: string) {
  if (_useJsonFallback) return null;
  const db = getDb();
  const [row] = await db.select().from(passwordResetTokens).where(eq(passwordResetTokens.token, token));
  return row || null;
}

export async function markResetTokenUsed(tokenId: number) {
  if (_useJsonFallback) return;
  const db = getDb();
  await db.update(passwordResetTokens).set({ usedAt: new Date() }).where(eq(passwordResetTokens.id, tokenId));
}

export async function deleteExpiredResetTokens() {
  if (_useJsonFallback) return 0;
  const db = getDb();
  const result = await db.delete(passwordResetTokens).where(lt(passwordResetTokens.expiresAt, new Date())).returning();
  return result.length;
}

// ─── Domain matching ───

export async function getDealershipByDomain(domain: string) {
  if (_useJsonFallback) return null;
  const db = getDb();
  const result = await db.select().from(dealerships).where(eq(dealerships.emailDomain, domain.toLowerCase()));
  return result[0] || null;
}

// ─── Invite functions ───

export async function createInvite(data: InsertInvite) {
  if (_useJsonFallback) return null;
  const db = getDb();
  const result = await db.insert(invites).values(data).returning();
  return result[0];
}

export async function getInviteByToken(token: string) {
  if (_useJsonFallback) return null;
  const db = getDb();
  const result = await db.select().from(invites).where(eq(invites.inviteToken, token));
  return result[0] || null;
}

export async function getInviteById(id: number) {
  if (_useJsonFallback) return null;
  const db = getDb();
  const result = await db.select().from(invites).where(eq(invites.id, id));
  return result[0] || null;
}

export async function getPendingInviteByEmail(email: string, dealershipId?: number) {
  if (_useJsonFallback) return null;
  const db = getDb();
  const conditions = [
    eq(invites.email, email.toLowerCase()),
    eq(invites.status, "pending"),
  ];
  if (dealershipId !== undefined) {
    conditions.push(eq(invites.dealershipId, dealershipId));
  }
  const result = await db.select().from(invites).where(and(...conditions));
  return result[0] || null;
}

export async function getInvitesByDealershipId(dealershipId: number) {
  if (_useJsonFallback) return [];
  const db = getDb();
  return db.select().from(invites).where(eq(invites.dealershipId, dealershipId)).orderBy(desc(invites.createdAt));
}

export async function updateInvite(id: number, data: Partial<InsertInvite>) {
  if (_useJsonFallback) return;
  const db = getDb();
  await db.update(invites).set(data).where(eq(invites.id, id));
}

// ─── Owner / platform-wide functions ───

export async function getAllDealerships() {
  if (_useJsonFallback) return [];
  const db = getDb();
  return db.select().from(dealerships).orderBy(desc(dealerships.createdAt));
}

export async function getAllUsers(dealershipId?: number) {
  if (_useJsonFallback) return [];
  const db = getDb();
  if (dealershipId !== undefined) {
    return db.select().from(users).where(eq(users.dealershipId, dealershipId)).orderBy(desc(users.createdAt));
  }
  return db.select().from(users).orderBy(desc(users.createdAt));
}

export async function getPlatformStats() {
  if (_useJsonFallback) return { dealerships: 0, users: 0, leads: 0, inventory: 0 };
  const db = getDb();
  const [dCount] = await db.select({ count: count() }).from(dealerships);
  const [uCount] = await db.select({ count: count() }).from(users);
  const [lCount] = await db.select({ count: count() }).from(leads);
  const [iCount] = await db.select({ count: count() }).from(inventory);
  return {
    dealerships: dCount.count,
    users: uCount.count,
    leads: lCount.count,
    inventory: iCount.count,
  };
}

export async function getDealershipStats(dealershipId: number) {
  if (_useJsonFallback) return { users: 0, leads: 0, inventory: 0, matches: 0 };
  const db = getDb();
  const [uCount] = await db.select({ count: count() }).from(users).where(eq(users.dealershipId, dealershipId));
  const [lCount] = await db.select({ count: count() }).from(leads).where(eq(leads.dealershipId, dealershipId));
  const [iCount] = await db.select({ count: count() }).from(inventory).where(eq(inventory.dealershipId, dealershipId));
  return {
    users: uCount.count,
    leads: lCount.count,
    inventory: iCount.count,
  };
}

export async function bulkCreateInventory(items: InsertInventory[]) {
  if (_useJsonFallback) return [];
  const db = getDb();
  if (items.length === 0) return [];
  const result = await db.insert(inventory).values(items).returning();
  return result;
}

// ─── Activity log functions ───

export async function createActivityLog(data: InsertActivityLog) {
  if (_useJsonFallback) return null;
  const db = getDb();
  const result = await db.insert(activityLogs).values(data).returning();
  return result[0];
}

export async function getActivityLogs(opts: {
  userId?: number;
  dealershipId?: number;
  action?: string;
  limit?: number;
  offset?: number;
}) {
  if (_useJsonFallback) return [];
  const db = getDb();
  const conditions: any[] = [];
  if (opts.userId !== undefined) conditions.push(eq(activityLogs.userId, opts.userId));
  if (opts.dealershipId !== undefined) conditions.push(eq(activityLogs.dealershipId, opts.dealershipId));
  if (opts.action) conditions.push(eq(activityLogs.action, opts.action));

  const query = db
    .select()
    .from(activityLogs)
    .where(conditions.length > 0 ? and(...conditions) : undefined)
    .orderBy(desc(activityLogs.createdAt))
    .limit(opts.limit || 50)
    .offset(opts.offset || 0);

  return query;
}

export async function getTeamAnalytics(dealershipId: number) {
  if (_useJsonFallback) return [];
  const db = getDb();

  // Get all team members
  const teamMembers = await db.select().from(users).where(eq(users.dealershipId, dealershipId));
  if (teamMembers.length === 0) return [];

  const memberIds = teamMembers.map(m => m.id);

  // Batch: all leads for this dealership grouped by userId
  const allLeads = await db.select().from(leads).where(eq(leads.dealershipId, dealershipId));

  // Group leads by userId
  const leadsByUser = new Map<number, typeof allLeads>();
  for (const lead of allLeads) {
    if (lead.userId == null) continue;
    const arr = leadsByUser.get(lead.userId) || [];
    arr.push(lead);
    leadsByUser.set(lead.userId, arr);
  }

  // Batch: all matches for leads in this dealership (single query)
  const allLeadIds = allLeads.map(l => l.id);
  let allMatches: any[] = [];
  if (allLeadIds.length > 0) {
    allMatches = await db.select().from(matches).where(inArray(matches.leadId, allLeadIds));
  }

  // Group matches by leadId
  const matchesByLead = new Map<number, typeof allMatches>();
  for (const match of allMatches) {
    const arr = matchesByLead.get(match.leadId) || [];
    arr.push(match);
    matchesByLead.set(match.leadId, arr);
  }

  // Build analytics per member (no additional queries)
  return teamMembers.map((member) => {
    const memberLeads = leadsByUser.get(member.id) || [];
    const activeLeads = memberLeads.filter(l => !["sold", "lost", "inactive"].includes(l.status)).length;
    const soldLeads = memberLeads.filter(l => l.status === "sold").length;

    const memberMatches = memberLeads.flatMap(l => matchesByLead.get(l.id) || []);
    const totalMatches = memberMatches.length;
    const soldMatches = memberMatches.filter(m => m.status === "sold").length;
    const contactedMatches = memberMatches.filter(m => m.status === "contacted").length;
    const pendingMatches = memberMatches.filter(m => m.status === "pending").length;

    const conversionRate = memberLeads.length > 0
      ? Math.round((soldLeads / memberLeads.length) * 100)
      : 0;

    return {
      userId: member.id,
      name: member.name,
      email: member.email,
      role: member.role,
      isActive: member.isActive,
      lastSignedIn: member.lastSignedIn,
      stats: {
        totalLeads: memberLeads.length,
        activeLeads,
        soldLeads,
        totalMatches,
        soldMatches,
        contactedMatches,
        pendingMatches,
        conversionRate,
      },
    };
  });
}

export async function getSessionStats(opts: { dealershipId?: number; since?: Date }) {
  if (_useJsonFallback) return [];
  const db = getDb();
  const conditions: any[] = [eq(activityLogs.action, "heartbeat")];
  if (opts.dealershipId !== undefined) conditions.push(eq(activityLogs.dealershipId, opts.dealershipId));
  if (opts.since) conditions.push(gte(activityLogs.createdAt, opts.since));

  return db
    .select({
      userId: activityLogs.userId,
      totalDuration: sql<number>`COALESCE(SUM(${activityLogs.sessionDuration}), 0)`.as("total_duration"),
      sessionCount: count().as("session_count"),
    })
    .from(activityLogs)
    .where(and(...conditions))
    .groupBy(activityLogs.userId);
}
