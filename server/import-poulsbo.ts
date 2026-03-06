import { getDb } from "./db";
import { inventory } from "../shared/schema";
import { eq, and } from "drizzle-orm";
import { readFileSync, existsSync } from "fs";
import { join } from "path";

export async function importPoulsboInventory(dealershipId: number) {
  const db = getDb();
  if (!db) return;

  const jsonPath = join(__dirname, "../poulsbo-inventory.json");
  if (!existsSync(jsonPath)) {
    console.log("[Import] No poulsbo-inventory.json found, skipping");
    return;
  }

  // Check if we already imported
  const existing = await db.select().from(inventory).where(eq(inventory.dealershipId, dealershipId)).limit(1);
  if (existing.length > 0) {
    console.log("[Import] Inventory already exists, skipping import");
    return;
  }

  const raw = JSON.parse(readFileSync(jsonPath, "utf-8"));
  console.log(`[Import] Importing ${raw.length} Poulsbo RV units...`);

  const items = raw.map((rv: any) => ({
    dealershipId,
    vin: rv.vin || null,
    unitId: rv.stock_number || `PRV-${rv.id?.slice(0, 8)}`,
    year: rv.year || 2024,
    make: rv.make || "Unknown",
    model: rv.model + (rv.trim ? " " + rv.trim : ""),
    length: rv.length_ft ? String(rv.length_ft) : null,
    weight: rv.weight_lbs ? String(rv.weight_lbs) : null,
    bedType: null as string | null,
    bedCount: null as number | null,
    amenities: rv.features?.length ? rv.features : null,
    bathrooms: null as string | null,
    slideOutCount: rv.slides || null,
    fuelType: rv.fuel_type || null,
    horsepower: null as number | null,
    price: rv.price ? String(rv.price) : null,
    status: "in_stock" as const,
    storeLocation: rv.location || "Poulsbo RV",
    arrivalDate: new Date(rv.scraped_at || Date.now()),
  }));

  // Batch insert in chunks of 50
  for (let i = 0; i < items.length; i += 50) {
    const chunk = items.slice(i, i + 50);
    await db.insert(inventory).values(chunk);
    console.log(`[Import] Inserted ${Math.min(i + 50, items.length)}/${items.length}`);
  }

  console.log(`[Import] Done! ${items.length} units imported.`);
}
