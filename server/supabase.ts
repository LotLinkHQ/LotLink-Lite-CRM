import { createClient } from "@supabase/supabase-js";

const SUPABASE_URL = process.env.SUPABASE_URL;
const SUPABASE_SERVICE_KEY = process.env.SUPABASE_SERVICE_KEY;

let _supabase: ReturnType<typeof createClient> | null = null;

export function getSupabase() {
  if (!_supabase) {
    if (!SUPABASE_URL || !SUPABASE_SERVICE_KEY) {
      throw new Error("[Supabase] SUPABASE_URL and SUPABASE_SERVICE_KEY environment variables are required");
    }
    _supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_KEY);
  }
  return _supabase;
}

// Map rv_listings row to CRM Inventory format
interface RVListing {
  id: string;
  dealer_id: string;
  dealer_name: string;
  year: number | null;
  make: string | null;
  model: string | null;
  trim: string | null;
  type: string | null;
  price: number | null;
  location: string | null;
  length_ft: number | null;
  sleeps: number | null;
  slides: number | null;
  weight_lbs: number | null;
  fuel_type: string | null;
  condition: string | null;
  vin: string | null;
  stock_number: string | null;
  url: string | null;
  photos: string[];
  features: string[];
  description: string | null;
  is_active: boolean;
  scraped_at: string;
  updated_at: string;
}

// Auto-incrementing ID counter for mapped listings (stable within session)
let _idMap = new Map<string, number>();
let _nextId = 1;

function stableId(uuid: string): number {
  if (!_idMap.has(uuid)) {
    _idMap.set(uuid, _nextId++);
  }
  return _idMap.get(uuid)!;
}

export function mapToInventory(rv: RVListing, dealershipId: number = 1) {
  return {
    id: stableId(rv.id),
    dealershipId,
    vin: rv.vin,
    unitId: rv.stock_number || rv.vin || `PRV-${rv.id.slice(0, 8)}`,
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
    updatedAt: new Date(rv.updated_at || Date.now()),
  };
}

// Fetch Poulsbo RV inventory from Supabase
export async function getPoulsboInventory(
  dealershipId: number = 1,
  cursor?: number,
  limit: number = 50
) {
  const supabase = getSupabase();
  let query = supabase
    .from("rv_listings")
    .select("*")
    .eq("dealer_id", "poulsbo-rv")
    .eq("is_active", true)
    .order("updated_at", { ascending: false });

  // Pagination via offset (since rv_listings uses UUIDs, not sequential IDs)
  const offset = cursor ? cursor : 0;
  query = query.range(offset, offset + limit);

  const { data, error } = await query;
  if (error) throw new Error(`Supabase fetch error: ${error.message}`);

  return (data || []).map((rv: any) => mapToInventory(rv, dealershipId));
}

export async function getPoulsboInventoryById(rvId: number, dealershipId: number = 1) {
  // Find by stable ID - need to fetch all and find
  const supabase = getSupabase();
  const { data, error } = await supabase
    .from("rv_listings")
    .select("*")
    .eq("dealer_id", "poulsbo-rv")
    .eq("is_active", true);

  if (error || !data) return null;

  for (const rv of data) {
    const mapped = mapToInventory(rv, dealershipId);
    if (mapped.id === rvId) return mapped;
  }
  return null;
}

export async function getPoulsboInventoryByUnitId(unitId: string, dealershipId: number = 1) {
  const supabase = getSupabase();

  // Try stock_number first, then vin
  let { data, error } = await supabase
    .from("rv_listings")
    .select("*")
    .eq("dealer_id", "poulsbo-rv")
    .eq("stock_number", unitId)
    .limit(1);

  if ((!data || data.length === 0) && !error) {
    ({ data, error } = await supabase
      .from("rv_listings")
      .select("*")
      .eq("dealer_id", "poulsbo-rv")
      .eq("vin", unitId)
      .limit(1));
  }

  if (error || !data || data.length === 0) return null;
  return mapToInventory(data[0], dealershipId);
}

export async function getPoulsboInventoryCount() {
  const supabase = getSupabase();
  const { count, error } = await supabase
    .from("rv_listings")
    .select("*", { count: "exact", head: true })
    .eq("dealer_id", "poulsbo-rv")
    .eq("is_active", true);

  return error ? 0 : (count || 0);
}
