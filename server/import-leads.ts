import { getDb } from "./db";
import { leads, dealerships, users } from "../shared/schema";
import { eq } from "drizzle-orm";
import { readFileSync, existsSync } from "fs";
import { join } from "path";

export async function importLeadsFromJSON(dealershipId: number) {
  const db = getDb();
  if (!db) return;

  const jsonPath = join(__dirname, "../parsed-leads.json");
  if (!existsSync(jsonPath)) {
    console.log("[Import] No parsed-leads.json found, skipping lead import");
    return;
  }

  // Check if leads already imported (look for DealerSocket import marker)
  const existing = await db
    .select()
    .from(leads)
    .where(eq(leads.dealershipId, dealershipId))
    .limit(1);
  if (existing.length > 0) {
    console.log("[Import] Leads already exist, skipping import");
    return;
  }

  // Find Jonathan's user ID
  const jonathanUser = await db
    .select()
    .from(users)
    .where(eq(users.email, "jonathan@lotlink.io"))
    .limit(1);
  const userId = jonathanUser[0]?.id || null;

  const raw = JSON.parse(readFileSync(jsonPath, "utf-8"));
  console.log(`[Import] Importing ${raw.length} leads...`);

  const items = raw.map((lead: any) => ({
    dealershipId,
    userId,
    customerName: lead.customerName,
    customerEmail: null,
    customerPhone: lead.customerPhone || null,
    preferenceType: lead.preferenceType as "model" | "features",
    preferredModel: lead.preferredModel || null,
    preferredYear: lead.preferredYear || null,
    preferences: lead.preferences || null,
    notes: lead.notes || null,
    status: "active" as const,
    storeLocation: lead.storeLocation || "Sumner",
    salespersonName: lead.salespersonName || "Jonathan Kitchel",
  }));

  // Batch insert in chunks of 25
  for (let i = 0; i < items.length; i += 25) {
    const chunk = items.slice(i, i + 25);
    await db.insert(leads).values(chunk);
    console.log(`[Import] Inserted ${Math.min(i + 25, items.length)}/${items.length} leads`);
  }

  console.log(`[Import] Done! ${items.length} leads imported.`);
}
