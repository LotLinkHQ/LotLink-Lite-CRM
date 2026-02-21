import * as db from "./db";

interface CachedContext {
  text: string;
  timestamp: number;
}

const cache = new Map<number, CachedContext>();
const CACHE_TTL = 5 * 60 * 1000; // 5 minutes

export async function buildInventoryContext(dealershipId: number): Promise<string> {
  const cached = cache.get(dealershipId);
  if (cached && Date.now() - cached.timestamp < CACHE_TTL) {
    return cached.text;
  }

  // Fetch all inventory for the dealership (up to 200 units)
  const items = await db.getUserInventory(dealershipId, undefined, 200);

  if (!items || items.length === 0) {
    return "No inventory currently available.";
  }

  const lines = items.map((item: any) => {
    const parts: string[] = [];
    parts.push(`[${item.unitId}]`);
    parts.push(`${item.year} ${item.make} ${item.model}`);

    if (item.price) parts.push(`| Price: $${Number(item.price).toLocaleString()}`);
    if (item.status) parts.push(`| Status: ${item.status}`);
    if (item.storeLocation) parts.push(`| Location: ${item.storeLocation}`);
    if (item.length) parts.push(`| Length: ${item.length} ft`);
    if (item.weight) parts.push(`| Weight: ${item.weight} lbs`);
    if (item.bedType) parts.push(`| Bed: ${item.bedType}`);
    if (item.slideOutCount) parts.push(`| Slides: ${item.slideOutCount}`);
    if (item.fuelType) parts.push(`| Fuel: ${item.fuelType}`);
    if (item.bathrooms) parts.push(`| Bathrooms: ${item.bathrooms}`);
    if (item.vin) parts.push(`| VIN: ${item.vin}`);
    if (item.amenities?.length) parts.push(`| Features: ${item.amenities.join(", ")}`);

    return parts.join(" ");
  });

  const text = lines.join("\n");

  cache.set(dealershipId, { text, timestamp: Date.now() });

  return text;
}
