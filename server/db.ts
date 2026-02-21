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
import { readFileSync, existsSync } from "fs";
import { join } from "path";

let _db: ReturnType<typeof drizzle> | null = null;
const _useJsonFallback = !process.env.DATABASE_URL;

if (_useJsonFallback) {
  console.log("[DB] No DATABASE_URL set — using JSON file for inventory data");
}

export function getDb() {
  if (!_db) {
    if (!process.env.DATABASE_URL) {
      return null as any;
    }
    const client = postgres(process.env.DATABASE_URL);
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

export async function getUserLeads(dealershipId: number, cursor?: number, limit: number = 50) {
  if (_useJsonFallback) return [];
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
        like(leads.customerName, `%${query}%`)
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
    .where(
      and(
        ...leadIds.map(id => eq(matches.leadId, id))
      )
    )
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
        eq(leads.status, "active")
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
