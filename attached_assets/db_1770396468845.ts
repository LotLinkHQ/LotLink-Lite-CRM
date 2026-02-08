import { eq, and, like, desc } from "drizzle-orm";
import { drizzle } from "drizzle-orm/mysql2";
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
} from "../drizzle/schema";
import { ENV } from "./_core/env";

let _db: ReturnType<typeof drizzle> | null = null;

// Lazily create the drizzle instance so local tooling can run without a DB.
export async function getDb() {
  if (!_db && process.env.DATABASE_URL) {
    try {
      _db = drizzle(process.env.DATABASE_URL);
    } catch (error) {
      console.warn("[Database] Failed to connect:", error);
      _db = null;
    }
  }
  return _db;
}

export async function upsertUser(user: InsertUser): Promise<void> {
  if (!user.openId) {
    throw new Error("User openId is required for upsert");
  }

  const db = await getDb();
  if (!db) {
    console.warn("[Database] Cannot upsert user: database not available");
    return;
  }

  try {
    const values: InsertUser = {
      openId: user.openId,
    };
    const updateSet: Record<string, unknown> = {};

    const textFields = ["name", "email", "loginMethod"] as const;
    type TextField = (typeof textFields)[number];

    const assignNullable = (field: TextField) => {
      const value = user[field];
      if (value === undefined) return;
      const normalized = value ?? null;
      values[field] = normalized;
      updateSet[field] = normalized;
    };

    textFields.forEach(assignNullable);

    if (user.lastSignedIn !== undefined) {
      values.lastSignedIn = user.lastSignedIn;
      updateSet.lastSignedIn = user.lastSignedIn;
    }
    if (user.role !== undefined) {
      values.role = user.role;
      updateSet.role = user.role;
    } else if (user.openId === ENV.ownerOpenId) {
      values.role = "admin";
      updateSet.role = "admin";
    }

    if (!values.lastSignedIn) {
      values.lastSignedIn = new Date();
    }

    if (Object.keys(updateSet).length === 0) {
      updateSet.lastSignedIn = new Date();
    }

    await db.insert(users).values(values).onDuplicateKeyUpdate({
      set: updateSet,
    });
  } catch (error) {
    console.error("[Database] Failed to upsert user:", error);
    throw error;
  }
}

export async function getUserByOpenId(openId: string) {
  const db = await getDb();
  if (!db) {
    console.warn("[Database] Cannot get user: database not available");
    return undefined;
  }

  const result = await db.select().from(users).where(eq(users.openId, openId)).limit(1);

  return result.length > 0 ? result[0] : undefined;
}

// ============================================================================
// LEADS QUERIES
// ============================================================================

export async function createLead(data: InsertLead) {
  const db = await getDb();
  if (!db) throw new Error("Database not available");

  await db.insert(leads).values(data);
}

export async function getUserLeads(dealershipId: number) {
  const db = await getDb();
  if (!db) return [];

  return db
    .select()
    .from(leads)
    .where(eq(leads.dealershipId, dealershipId))
    .orderBy(desc(leads.createdAt));
}

export async function getLeadById(id: number) {
  const db = await getDb();
  if (!db) return null;

  const result = await db.select().from(leads).where(eq(leads.id, id));
  return result[0] || null;
}

export async function updateLead(id: number, data: Partial<InsertLead>) {
  const db = await getDb();
  if (!db) throw new Error("Database not available");

  await db.update(leads).set(data).where(eq(leads.id, id));
}

export async function deleteLead(id: number) {
  const db = await getDb();
  if (!db) throw new Error("Database not available");

  await db.delete(leads).where(eq(leads.id, id));
}

export async function searchLeads(dealershipId: number, query: string) {
  const db = await getDb();
  if (!db) return [];

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

export async function getActiveLeads(dealershipId: number) {
  const db = await getDb();
  if (!db) return [];

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

// ============================================================================
// INVENTORY QUERIES
// ============================================================================

export async function createInventory(data: InsertInventory) {
  const db = await getDb();
  if (!db) throw new Error("Database not available");

  await db.insert(inventory).values(data);
}

export async function getUserInventory(dealershipId: number) {
  const db = await getDb();
  if (!db) return [];

  return db
    .select()
    .from(inventory)
    .where(eq(inventory.dealershipId, dealershipId))
    .orderBy(desc(inventory.arrivalDate));
}

export async function getInventoryById(id: number) {
  const db = await getDb();
  if (!db) return null;

  const result = await db
    .select()
    .from(inventory)
    .where(eq(inventory.id, id));
  return result[0] || null;
}

export async function getInventoryByUnitId(unitId: string) {
  const db = await getDb();
  if (!db) return null;

  const result = await db
    .select()
    .from(inventory)
    .where(eq(inventory.unitId, unitId));
  return result[0] || null;
}

export async function updateInventory(id: number, data: Partial<InsertInventory>) {
  const db = await getDb();
  if (!db) throw new Error("Database not available");

  await db.update(inventory).set(data).where(eq(inventory.id, id));
}

export async function deleteInventory(id: number) {
  const db = await getDb();
  if (!db) throw new Error("Database not available");

  await db.delete(inventory).where(eq(inventory.id, id));
}

export async function searchInventory(dealershipId: number, query: string) {
  const db = await getDb();
  if (!db) return [];

  return db
    .select()
    .from(inventory)
    .where(
      and(
        eq(inventory.dealershipId, dealershipId),
        like(inventory.model, `%${query}%`)
      )
    )
    .orderBy(desc(inventory.arrivalDate));
}

export async function getInStockInventory(dealershipId: number) {
  const db = await getDb();
  if (!db) return [];

  return db
    .select()
    .from(inventory)
    .where(
      and(
        eq(inventory.dealershipId, dealershipId),
        eq(inventory.status, "in_stock")
      )
    )
    .orderBy(desc(inventory.arrivalDate));
}

// ============================================================================
// MATCHES QUERIES
// ============================================================================

export async function createMatch(data: InsertMatch) {
  const db = await getDb();
  if (!db) throw new Error("Database not available");

  await db.insert(matches).values(data);
}

export async function getMatchById(id: number) {
  const db = await getDb();
  if (!db) return null;

  const result = await db.select().from(matches).where(eq(matches.id, id));
  return result[0] || null;
}

export async function getMatchesByLeadId(leadId: number) {
  const db = await getDb();
  if (!db) return [];

  return db
    .select()
    .from(matches)
    .where(eq(matches.leadId, leadId))
    .orderBy(desc(matches.createdAt));
}

export async function getMatchesByInventoryId(inventoryId: number) {
  const db = await getDb();
  if (!db) return [];

  return db
    .select()
    .from(matches)
    .where(eq(matches.inventoryId, inventoryId))
    .orderBy(desc(matches.createdAt));
}

export async function updateMatch(id: number, data: Partial<InsertMatch>) {
  const db = await getDb();
  if (!db) throw new Error("Database not available");

  await db.update(matches).set(data).where(eq(matches.id, id));
}

// ============================================================================
// MATCH HISTORY QUERIES
// ============================================================================

export async function createMatchHistory(data: InsertMatchHistory) {
  const db = await getDb();
  if (!db) throw new Error("Database not available");

  await db.insert(matchHistory).values(data);
}

export async function getMatchHistoryByLeadId(leadId: number) {
  const db = await getDb();
  if (!db) return [];

  return db
    .select()
    .from(matchHistory)
    .where(eq(matchHistory.leadId, leadId))
    .orderBy(desc(matchHistory.matchedAt));
}

// ============================================================================
// USER PREFERENCES QUERIES
// ============================================================================

export async function getDealershipPreferences(dealershipId: number) {
  const db = await getDb();
  if (!db) return null;

  const result = await db
    .select()
    .from(dealershipPreferences)
    .where(eq(dealershipPreferences.dealershipId, dealershipId));
  return result[0] || null;
}

export async function createDealershipPreferences(data: InsertDealershipPreferences) {
  const db = await getDb();
  if (!db) throw new Error("Database not available");

  await db.insert(dealershipPreferences).values(data);
}

export async function updateDealershipPreferences(
  dealershipId: number,
  data: Partial<InsertDealershipPreferences>
) {
  const db = await getDb();
  if (!db) throw new Error("Database not available");

  await db
    .update(dealershipPreferences)
    .set(data)
    .where(eq(dealershipPreferences.dealershipId, dealershipId));
}

export async function initializeDealershipPreferences(dealershipId: number) {
  const db = await getDb();
  if (!db) throw new Error("Database not available");

  const existing = await getDealershipPreferences(dealershipId);
  if (existing) return existing;

  await createDealershipPreferences({
    dealershipId,
    emailNotifications: true,
    smsNotifications: false,
    inAppNotifications: true,
    matchingSensitivity: "moderate",
    darkMode: false,
  });

  return getDealershipPreferences(dealershipId);
}
