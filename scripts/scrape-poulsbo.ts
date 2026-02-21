import "dotenv/config";
import { writeFileSync } from "fs";

const TINYFISH_API_KEY = process.env.TINYFISH_API_KEY || "sk-tinyfish-pPjs1MHYLv6y2vPsf9Ca7eV0udX4sl3f";
const TINYFISH_URL = "https://agent.tinyfish.ai/v1/automation/run-sse";

const POULSBO_INVENTORY_URLS = [
  "https://www.poulsborv.com/shop/rvs/class-a/",
  "https://www.poulsborv.com/shop/rvs/class-b/",
  "https://www.poulsborv.com/shop/rvs/class-c/",
  "https://www.poulsborv.com/shop/rvs/travel-trailer/",
  "https://www.poulsborv.com/shop/rvs/fifth-wheel/",
];

const LISTINGS_GOAL = `Extract ALL RV listings visible on this page. For each listing, extract:
- detail_page_url (the link to the listing detail page)
- title (full title including year, make, model)
- price (number without $ or commas, or null if not shown)
- stock_number (if shown, usually like "Stock# M3441")
- photo_url (main image URL)
- condition (New or Used)
- location (city/store if shown)

Return ONLY a JSON array. No markdown.`;

const DETAIL_GOAL = `Extract all details about this RV listing. Return a JSON object with:
- title (full title)
- year (number)
- make (brand like Coachmen, Keystone, Forest River, Tiffin, etc)
- model (model name and floor plan)
- trim (trim level if any)
- type (Class A, Class B, Class C, Travel Trailer, Fifth Wheel, Toy Hauler, etc)
- price (number without $ or commas, or null)
- condition (New or Used)
- vin (VIN number if shown)
- stock_number (stock/unit number)
- length_ft (length in feet, number)
- weight_lbs (weight in lbs, number)
- sleeps (number of sleeping spots)
- slides (number of slide-outs)
- fuel_type (Gas, Diesel, or null)
- features (array of feature strings)
- description (text description, first 500 chars)
- photos (array of all image URLs)

Return ONLY the JSON object. No markdown.`;

interface ScrapedListing {
  detail_page_url: string;
  title: string;
  price: number | null;
  stock_number: string | null;
  photo_url: string | null;
  condition: string | null;
  location: string | null;
}

interface RVDetail {
  title: string;
  year: number | null;
  make: string | null;
  model: string | null;
  trim: string | null;
  type: string | null;
  price: number | null;
  condition: string | null;
  vin: string | null;
  stock_number: string | null;
  length_ft: number | null;
  weight_lbs: number | null;
  sleeps: number | null;
  slides: number | null;
  fuel_type: string | null;
  features: string[];
  description: string | null;
  photos: string[];
}

async function callTinyFish(url: string, goal: string): Promise<any> {
  const payload = JSON.stringify({ url, goal });

  const response = await fetch(TINYFISH_URL, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "X-API-Key": TINYFISH_API_KEY,
    },
    body: payload,
  });

  if (!response.ok) {
    throw new Error(`TinyFish API error: ${response.status} ${response.statusText}`);
  }

  const text = await response.text();
  const lines = text.split("\n").filter((l) => l.startsWith("data: "));

  for (const line of lines) {
    try {
      const event = JSON.parse(line.slice(6));
      if (event.type === "COMPLETE" && event.resultJson) {
        return JSON.parse(event.resultJson);
      }
      if (event.type === "ERROR") {
        throw new Error(`TinyFish error: ${event.message}`);
      }
      if (event.type === "CANCELLED") {
        throw new Error("TinyFish job cancelled (rate limit or credits)");
      }
    } catch (e: any) {
      if (e.message.includes("TinyFish")) throw e;
      // Parse error on non-JSON line, skip
    }
  }
  throw new Error("No result from TinyFish");
}

function parseTitle(title: string) {
  const parts = title.split(/\s+/);
  const yearMatch = title.match(/\b(20\d{2})\b/);
  const year = yearMatch ? parseInt(yearMatch[1]) : null;

  // Remove year from parts to get make/model
  const rest = title.replace(/\b20\d{2}\b/, "").trim().split(/\s+/);
  const make = rest[0] || null;
  const model = rest.slice(1).join(" ") || null;

  return { year, make, model };
}

async function scrapeCategory(categoryUrl: string): Promise<ScrapedListing[]> {
  console.log(`\nScraping: ${categoryUrl}`);
  const allListings: ScrapedListing[] = [];

  // Scrape up to 3 pages per category
  for (let page = 1; page <= 3; page++) {
    const url = page === 1 ? categoryUrl : `${categoryUrl}page/${page}/`;
    console.log(`  Page ${page}...`);

    try {
      const result = await callTinyFish(url, LISTINGS_GOAL);
      const listings = Array.isArray(result) ? result : [];

      if (listings.length === 0) {
        console.log(`  No more listings on page ${page}`);
        break;
      }

      console.log(`  Found ${listings.length} listings`);
      allListings.push(...listings);
    } catch (e: any) {
      console.error(`  Error on page ${page}: ${e.message}`);
      break;
    }
  }

  return allListings;
}

async function scrapeDetail(url: string): Promise<RVDetail | null> {
  try {
    const result = await callTinyFish(url, DETAIL_GOAL);
    return result;
  } catch (e: any) {
    console.error(`  Detail error for ${url}: ${e.message}`);
    return null;
  }
}

async function main() {
  console.log("=== Poulsbo RV Scraper (TinyFish) ===\n");

  // Step 1: Scrape all category pages for listings
  const allListings: ScrapedListing[] = [];
  for (const categoryUrl of POULSBO_INVENTORY_URLS) {
    const listings = await scrapeCategory(categoryUrl);
    allListings.push(...listings);
  }

  // Deduplicate by URL
  const uniqueListings = new Map<string, ScrapedListing>();
  for (const listing of allListings) {
    if (listing.detail_page_url) {
      uniqueListings.set(listing.detail_page_url, listing);
    }
  }

  console.log(`\nTotal unique listings: ${uniqueListings.size}`);

  // Step 2: Scrape detail pages (limit to avoid using too many API credits)
  const MAX_DETAILS = 50; // Scrape up to 50 detail pages
  const inventory: any[] = [];
  let detailCount = 0;

  for (const [url, listing] of uniqueListings) {
    if (detailCount >= MAX_DETAILS) {
      // For remaining listings, use card data only
      const parsed = parseTitle(listing.title || "");
      inventory.push({
        dealer_id: "poulsbo-rv",
        dealer_name: "Poulsbo RV",
        year: parsed.year,
        make: parsed.make,
        model: parsed.model,
        price: listing.price,
        stock_number: listing.stock_number,
        condition: listing.condition,
        location: listing.location || "Poulsbo, WA",
        photos: listing.photo_url ? [listing.photo_url] : [],
        features: [],
        url,
        is_active: true,
        scraped_at: new Date().toISOString(),
      });
      continue;
    }

    console.log(`\nDetail ${detailCount + 1}/${Math.min(uniqueListings.size, MAX_DETAILS)}: ${listing.title || url}`);
    const detail = await scrapeDetail(url);
    detailCount++;

    if (detail) {
      inventory.push({
        dealer_id: "poulsbo-rv",
        dealer_name: "Poulsbo RV",
        year: detail.year || parseTitle(listing.title || "").year,
        make: detail.make || parseTitle(listing.title || "").make,
        model: detail.model || parseTitle(listing.title || "").model,
        trim: detail.trim,
        type: detail.type,
        price: detail.price || listing.price,
        condition: detail.condition || listing.condition,
        vin: detail.vin,
        stock_number: detail.stock_number || listing.stock_number,
        location: listing.location || "Poulsbo, WA",
        length_ft: detail.length_ft,
        weight_lbs: detail.weight_lbs,
        sleeps: detail.sleeps,
        slides: detail.slides,
        fuel_type: detail.fuel_type,
        photos: detail.photos || (listing.photo_url ? [listing.photo_url] : []),
        features: detail.features || [],
        description: detail.description,
        url,
        is_active: true,
        scraped_at: new Date().toISOString(),
      });
    } else {
      // Fallback to card data
      const parsed = parseTitle(listing.title || "");
      inventory.push({
        dealer_id: "poulsbo-rv",
        dealer_name: "Poulsbo RV",
        year: parsed.year,
        make: parsed.make,
        model: parsed.model,
        price: listing.price,
        stock_number: listing.stock_number,
        condition: listing.condition,
        location: listing.location || "Poulsbo, WA",
        photos: listing.photo_url ? [listing.photo_url] : [],
        features: [],
        url,
        is_active: true,
        scraped_at: new Date().toISOString(),
      });
    }
  }

  // Step 3: Save results
  writeFileSync("poulsbo-rv-inventory.json", JSON.stringify(inventory, null, 2));
  console.log(`\n=== DONE ===`);
  console.log(`Scraped ${inventory.length} RV listings from Poulsbo RV`);
  console.log(`Saved to poulsbo-rv-inventory.json`);
  console.log(`Detail pages scraped: ${detailCount}`);
  console.log(`Card-only listings: ${inventory.length - detailCount}`);
}

main().catch(console.error);
