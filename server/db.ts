import { eq, and, like, desc, lt } from "drizzle-orm";
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
  InsertLead,
  InsertInventory,
  InsertMatch,
  InsertMatchHistory,
  InsertDealershipPreferences,
  InsertDealership,
  InsertDealershipSession,
  inAppNotifications,
  InsertInAppNotification,
} from "../shared/schema";

let _db: ReturnType<typeof drizzle> | null = null;

export function getDb() {
  if (!_db) {
    if (!process.env.DATABASE_URL) {
      throw new Error(
        "DATABASE_URL is not set. Please create a .env file based on .env.example and provide a valid PostgreSQL connection string."
      );
    }
    const client = postgres(process.env.DATABASE_URL);
    _db = drizzle(client);
  }
  return _db;
}

export async function getUserLeads(dealershipId: number, cursor?: number, limit: number = 50) {
  const db = getDb();
  let whereClause = eq(leads.dealershipId, dealershipId);

  if (cursor) {
    whereClause = and(whereClause, lt(leads.id, cursor)) as any;
  }

  return db
    .select()
    .from(leads)
    .where(whereClause)
    .orderBy(desc(leads.id))
    .limit(limit + 1);
}

export async function getLeadById(id: number) {
  const db = getDb();
  const result = await db.select().from(leads).where(eq(leads.id, id));
  return result[0] || null;
}

export async function createLead(data: InsertLead) {
  const db = getDb();
  const result = await db.insert(leads).values(data).returning();
  return result[0];
}

export async function updateLead(id: number, data: Partial<InsertLead>) {
  const db = getDb();
  await db.update(leads).set({ ...data, updatedAt: new Date() }).where(eq(leads.id, id));
}

export async function deleteLead(id: number) {
  const db = getDb();
  await db.delete(leads).where(eq(leads.id, id));
}

export async function searchLeads(dealershipId: number, query: string) {
  const db = getDb();
  return db
    .select()
    .from(leads)
    .where(
      and(
        eq(leads.dealershipId, dealershipId),
        like(leads.customerName, `%${query}%`)
      )
    )
    .orderBy(desc(leads.createdAt));
}

export async function getUserInventory(dealershipId: number, cursor?: number, limit: number = 50) {
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
  const db = getDb();
  const result = await db.select().from(inventory).where(eq(inventory.id, id));
  return result[0] || null;
}

export async function createInventory(data: InsertInventory) {
  const db = getDb();
  const result = await db.insert(inventory).values(data).returning();
  return result[0];
}

export async function updateInventory(id: number, data: Partial<InsertInventory>) {
  const db = getDb();
  await db.update(inventory).set({ ...data, updatedAt: new Date() }).where(eq(inventory.id, id));
}

export async function deleteInventory(id: number) {
  const db = getDb();
  await db.delete(inventory).where(eq(inventory.id, id));
}

export async function getMatchesByLeadId(leadId: number) {
  const db = getDb();
  return db
    .select()
    .from(matches)
    .where(eq(matches.leadId, leadId))
    .orderBy(desc(matches.createdAt));
}

export async function getMatchesByLeadIds(leadIds: number[]) {
  const db = getDb();
  if (leadIds.length === 0) return [];
  return db
    .select()
    .from(matches)
    .where(
      and(
        ...leadIds.map(id => eq(matches.leadId, id))
      )
    )
    .orderBy(desc(matches.createdAt));
}

export async function getMatchesByInventoryId(inventoryId: number) {
  const db = getDb();
  return db
    .select()
    .from(matches)
    .where(eq(matches.inventoryId, inventoryId))
    .orderBy(desc(matches.createdAt));
}

export async function createMatch(data: InsertMatch) {
  const db = getDb();
  const result = await db.insert(matches).values(data).returning();
  return result[0];
}

export async function updateMatch(id: number, data: Partial<InsertMatch>) {
  const db = getDb();
  await db.update(matches).set({ ...data, updatedAt: new Date() }).where(eq(matches.id, id));
}

export async function getMatchById(id: number) {
  const db = getDb();
  const result = await db.select().from(matches).where(eq(matches.id, id));
  return result[0] || null;
}

export async function createMatchHistory(data: InsertMatchHistory) {
  const db = getDb();
  await db.insert(matchHistory).values(data);
}

export async function getMatchHistoryByLeadId(leadId: number) {
  const db = getDb();
  return db
    .select()
    .from(matchHistory)
    .where(eq(matchHistory.leadId, leadId))
    .orderBy(desc(matchHistory.matchedAt));
}

export async function getDealershipPreferences(dealershipId: number) {
  const db = getDb();
  const result = await db
    .select()
    .from(dealershipPreferences)
    .where(eq(dealershipPreferences.dealershipId, dealershipId));
  return result[0] || null;
}

export async function createDealershipPreferences(data: InsertDealershipPreferences) {
  const db = getDb();
  await db.insert(dealershipPreferences).values(data);
}

export async function updateDealershipPreferences(
  dealershipId: number,
  data: Partial<InsertDealershipPreferences>
) {
  const db = getDb();
  await db
    .update(dealershipPreferences)
    .set({ ...data, updatedAt: new Date() })
    .where(eq(dealershipPreferences.dealershipId, dealershipId));
}

export async function getDealershipByUsername(username: string) {
  const db = getDb();
  const result = await db
    .select()
    .from(dealerships)
    .where(eq(dealerships.username, username));
  return result[0] || null;
}

export async function getDealershipById(id: number) {
  const db = getDb();
  const result = await db
    .select()
    .from(dealerships)
    .where(eq(dealerships.id, id));
  return result[0] || null;
}

export async function createDealership(data: InsertDealership) {
  const db = getDb();
  const result = await db.insert(dealerships).values(data).returning();
  return result[0];
}

export async function createDealershipSession(data: InsertDealershipSession) {
  const db = getDb();
  const result = await db.insert(dealershipSessions).values(data).returning();
  return result[0];
}

export async function getDealershipSessionByToken(token: string) {
  const db = getDb();
  const result = await db
    .select()
    .from(dealershipSessions)
    .where(eq(dealershipSessions.sessionToken, token));
  return result[0] || null;
}

export async function deleteDealershipSession(token: string) {
  const db = getDb();
  await db.delete(dealershipSessions).where(eq(dealershipSessions.sessionToken, token));
}

export async function getAllDealershipLeads(dealershipId: number) {
  const db = getDb();
  return db
    .select()
    .from(leads)
    .where(
      and(
        eq(leads.dealershipId, dealershipId),
        eq(leads.status, "active")
      )
    )
    .orderBy(desc(leads.createdAt));
}

export async function getAllDealershipMatches(dealershipId: number, cursor?: number, limit: number = 20) {
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
  const db = getDb();
  const result = await db.insert(inAppNotifications).values(data).returning();
  return result[0];
}

export async function getInAppNotifications(dealershipId: number, limit: number = 20) {
  const db = getDb();
  return db
    .select()
    .from(inAppNotifications)
    .where(eq(inAppNotifications.dealershipId, dealershipId))
    .orderBy(desc(inAppNotifications.createdAt))
    .limit(limit);
}

export async function markNotificationAsRead(id: number) {
  const db = getDb();
  await db
    .update(inAppNotifications)
    .set({ isRead: true })
    .where(eq(inAppNotifications.id, id));
}

export async function updateDealership(id: number, data: Partial<InsertDealership>) {
  const db = getDb();
  await db.update(dealerships).set({ ...data, updatedAt: new Date() }).where(eq(dealerships.id, id));
}

export async function getInventoryByUnitId(unitId: string, dealershipId: number) {
  const db = getDb();
  const result = await db
    .select()
    .from(inventory)
    .where(and(eq(inventory.unitId, unitId), eq(inventory.dealershipId, dealershipId)));
  return result[0] || null;
}

export async function getUnreadNotificationCount(dealershipId: number) {
  const db = getDb();
  const result = await db
    .select()
    .from(inAppNotifications)
    .where(
      and(
        eq(inAppNotifications.dealershipId, dealershipId),
        eq(inAppNotifications.isRead, false)
      )
    );
  return result.length;
}
