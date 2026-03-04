import * as cheerio from "cheerio";
import { getDb } from "./db";
import * as db from "./db";
import { inventory, dealerships } from "../shared/schema";
import { eq } from "drizzle-orm";
import { runMatchingForNewInventory } from "./matching-engine";

const TWENTY_FOUR_HOURS = 24 * 60 * 60 * 1000;

// Common URL patterns where RV dealerships list inventory
const INVENTORY_PATH_PATTERNS = [
  "/inventory",
  "/rvs",
  "/rv-inventory",
  "/new-inventory",
  "/used-inventory",
  "/units-for-sale",
  "/vehicles",
  "/shop",
  "/our-inventory",
  "/motorhomes",
  "/travel-trailers",
  "/fifth-wheels",
  "/class-a",
  "/class-b",
  "/class-c",
  "/toy-haulers",
  "/browse",
];

// Patterns that indicate a link is a vehicle detail page
const VEHICLE_LINK_PATTERNS = [
  /stock[-_]?\w+/i,
  /vin[-_]?\w+/i,
  /unit[-_]?\w+/i,
  /\d{4}[-\s]+\w+[-\s]+\w+/,  // year-make-model pattern
  /inventory\/\d+/,
  /vehicle\/\d+/,
  /rv\/\d+/,
  /listing\/\d+/,
];

// RV makes for identification
const RV_MAKES = [
  "coachmen", "thor", "winnebago", "jayco", "forest river", "keystone",
  "heartland", "grand design", "dutchmen", "fleetwood", "tiffin",
  "newmar", "entegra", "airstream", "lance", "nucamp", "roadtrek",
  "pleasure-way", "leisure travel", "dynamax", "nexus", "renegade",
  "american coach", "holiday rambler", "cruiser", "crossroads",
  "palomino", "venture", "coleman", "starcraft", "gulf stream",
  "northwood", "outdoors rv", "braxton creek", "east to west",
  "alliance", "brinkley", "ember", "taxa", "intech", "happier camper",
  "oliver", "escape", "casita", "scamp", "cortes campers",
  "storyteller overland", "sanctuary", "chinook", "phoenix",
  "regency", "midwest", "pleasure way", "roadtrek", "xplorer",
  "coachhouse", "coach house", "leisure", "born free", "lazy daze",
];

interface ScrapedVehicle {
  unitId: string;
  year: number;
  make: string;
  model: string;
  price: string | null;
  vin: string | null;
  url: string;
  type: string | null;
}

interface ScrapeResult {
  success: boolean;
  newUnits: number;
  updatedUnits: number;
  totalFound: number;
  errors: string[];
}

export async function scrapeInventoryFromWebsite(
  dealershipId: number,
  websiteUrl: string
): Promise<ScrapeResult> {
  const result: ScrapeResult = {
    success: false,
    newUnits: 0,
    updatedUnits: 0,
    totalFound: 0,
    errors: [],
  };

  try {
    console.log(`[Scraper] Starting scrape for dealership #${dealershipId}: ${websiteUrl}`);

    // Normalize the base URL
    let baseUrl = websiteUrl.trim();
    if (!baseUrl.startsWith("http")) {
      baseUrl = "https://" + baseUrl;
    }
    baseUrl = baseUrl.replace(/\/+$/, "");

    // Step 1: Discover inventory pages
    const inventoryPages = await discoverInventoryPages(baseUrl);
    console.log(`[Scraper] Found ${inventoryPages.length} inventory pages to crawl`);

    if (inventoryPages.length === 0) {
      // Fall back to scraping the homepage directly
      inventoryPages.push(baseUrl);
      console.log("[Scraper] No inventory pages found, falling back to homepage");
    }

    // Step 2: Collect all vehicle links from inventory pages
    const vehicleLinks = new Set<string>();
    for (const pageUrl of inventoryPages) {
      try {
        const links = await findVehicleLinks(pageUrl, baseUrl);
        links.forEach(l => vehicleLinks.add(l));
        console.log(`[Scraper] Found ${links.length} vehicle links on ${pageUrl}`);

        // Also check for pagination
        const nextPages = await findPaginationLinks(pageUrl, baseUrl);
        for (const nextPage of nextPages.slice(0, 5)) {
          const moreLinks = await findVehicleLinks(nextPage, baseUrl);
          moreLinks.forEach(l => vehicleLinks.add(l));
        }
      } catch (err: any) {
        result.errors.push(`Failed to crawl ${pageUrl}: ${err.message}`);
      }
    }

    console.log(`[Scraper] Total unique vehicle links: ${vehicleLinks.size}`);
    result.totalFound = vehicleLinks.size;

    // Step 3: Scrape each vehicle page
    const database = getDb();
    let processed = 0;

    for (const vehicleUrl of vehicleLinks) {
      try {
        const vehicle = await scrapeVehiclePage(vehicleUrl, baseUrl);
        if (!vehicle || !vehicle.year || !vehicle.make || vehicle.make === "Unknown") {
          continue;
        }

        // Check if this unit already exists
        const existing = await database
          .select()
          .from(inventory)
          .where(eq(inventory.unitId, vehicle.unitId))
          .limit(1);

        if (existing.length > 0) {
          // Update price and status if changed
          const updates: any = { updatedAt: new Date() };
          if (vehicle.price) updates.price = vehicle.price;
          updates.status = "in_stock";

          await database
            .update(inventory)
            .set(updates)
            .where(eq(inventory.id, existing[0].id));

          result.updatedUnits++;
          console.log(`[Scraper] Updated: ${vehicle.year} ${vehicle.make} ${vehicle.model}`);
        } else {
          // Insert new unit
          const newUnit = await db.createInventory({
            dealershipId,
            unitId: vehicle.unitId,
            vin: vehicle.vin,
            year: vehicle.year,
            make: vehicle.make,
            model: vehicle.model,
            price: vehicle.price,
            status: "in_stock",
            storeLocation: "Website Import",
            arrivalDate: new Date(),
          });

          result.newUnits++;
          console.log(`[Scraper] New: ${vehicle.year} ${vehicle.make} ${vehicle.model}`);

          // Run matching for new units
          runMatchingForNewInventory(newUnit.id, dealershipId).catch((err) =>
            console.error(`[Scraper] Matching failed for unit ${newUnit.id}:`, err)
          );
        }

        processed++;
      } catch (err: any) {
        result.errors.push(`Failed to scrape ${vehicleUrl}: ${err.message}`);
      }
    }

    // Flag units not found in this scrape as "removed" (only website-imported ones)
    if (processed > 0) {
      const allUnits = await database.select().from(inventory)
        .where(eq(inventory.dealershipId, dealershipId));
      const scrapedUnitIds = new Set(
        Array.from(vehicleLinks).map(url => {
          // Best-effort: we can't reliably map URL→unitId here, so we track processed IDs
          return null;
        }).filter(Boolean)
      );
      // Mark stale website imports that weren't seen in the current scrape
      const staleThreshold = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000); // 7 days
      for (const unit of allUnits) {
        if (
          unit.storeLocation === "Website Import" &&
          unit.status === "in_stock" &&
          unit.updatedAt < staleThreshold
        ) {
          await database.update(inventory)
            .set({ status: "removed" as any, updatedAt: new Date() })
            .where(eq(inventory.id, unit.id));
          console.log(`[Scraper] Flagged stale: ${unit.year} ${unit.make} ${unit.model} (not updated in 7+ days)`);
        }
      }
    }

    // Update last scraped timestamp
    await database
      .update(dealerships)
      .set({ lastScrapedAt: new Date(), updatedAt: new Date() })
      .where(eq(dealerships.id, dealershipId));

    result.success = true;
    console.log(
      `[Scraper] Complete: ${result.newUnits} new, ${result.updatedUnits} updated, ${result.errors.length} errors`
    );
  } catch (err: any) {
    result.errors.push(`Scrape failed: ${err.message}`);
    console.error("[Scraper] Fatal error:", err.message);
  }

  return result;
}

async function fetchPage(url: string): Promise<string> {
  const response = await fetch(url, {
    headers: {
      "User-Agent":
        "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
      Accept: "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
    },
    signal: AbortSignal.timeout(15000),
  });

  if (!response.ok) {
    throw new Error(`HTTP ${response.status}: ${response.statusText}`);
  }

  return response.text();
}

async function discoverInventoryPages(baseUrl: string): Promise<string[]> {
  const found: string[] = [];

  try {
    const html = await fetchPage(baseUrl);
    const $ = cheerio.load(html);
    const allLinks = new Set<string>();

    $("a[href]").each((_, el) => {
      const href = $(el).attr("href");
      if (!href) return;

      const fullUrl = href.startsWith("http") ? href : `${baseUrl}${href.startsWith("/") ? "" : "/"}${href}`;

      // Only follow links on the same domain
      try {
        const linkHost = new URL(fullUrl).hostname;
        const baseHost = new URL(baseUrl).hostname;
        if (linkHost !== baseHost) return;
      } catch {
        return;
      }

      const lowerHref = href.toLowerCase();
      for (const pattern of INVENTORY_PATH_PATTERNS) {
        if (lowerHref.includes(pattern)) {
          allLinks.add(fullUrl.split("?")[0].split("#")[0]);
          break;
        }
      }
    });

    found.push(...allLinks);
  } catch (err: any) {
    console.warn(`[Scraper] Could not discover inventory pages: ${err.message}`);
  }

  // Always try common paths directly too
  for (const path of ["/inventory", "/rvs", "/rv-inventory", "/shop/rvs"]) {
    try {
      const testUrl = `${baseUrl}${path}`;
      const response = await fetch(testUrl, {
        method: "HEAD",
        headers: { "User-Agent": "Mozilla/5.0" },
        signal: AbortSignal.timeout(5000),
      });
      if (response.ok && !found.includes(testUrl)) {
        found.push(testUrl);
      }
    } catch {
      // Ignore - page doesn't exist
    }
  }

  return [...new Set(found)].slice(0, 20);
}

async function findVehicleLinks(pageUrl: string, baseUrl: string): Promise<string[]> {
  const links: string[] = [];

  try {
    const html = await fetchPage(pageUrl);
    const $ = cheerio.load(html);

    $("a[href]").each((_, el) => {
      const href = $(el).attr("href") || "";
      const fullUrl = href.startsWith("http")
        ? href
        : `${baseUrl}${href.startsWith("/") ? "" : "/"}${href}`;

      // Only follow same-domain links
      try {
        const linkHost = new URL(fullUrl).hostname;
        const baseHost = new URL(baseUrl).hostname;
        if (linkHost !== baseHost) return;
      } catch {
        return;
      }

      const lowerHref = fullUrl.toLowerCase();

      // Check if it looks like a vehicle detail page
      for (const pattern of VEHICLE_LINK_PATTERNS) {
        if (pattern.test(lowerHref)) {
          links.push(fullUrl.split("#")[0]);
          return;
        }
      }

      // Check if the link text contains a year + make pattern
      const linkText = $(el).text().trim();
      if (/\b20[0-2]\d\b/.test(linkText)) {
        const lowerText = linkText.toLowerCase();
        for (const make of RV_MAKES) {
          if (lowerText.includes(make)) {
            links.push(fullUrl.split("#")[0]);
            return;
          }
        }
      }
    });
  } catch (err: any) {
    console.warn(`[Scraper] Could not find vehicle links on ${pageUrl}: ${err.message}`);
  }

  return [...new Set(links)];
}

async function findPaginationLinks(pageUrl: string, baseUrl: string): Promise<string[]> {
  const links: string[] = [];

  try {
    const html = await fetchPage(pageUrl);
    const $ = cheerio.load(html);

    $("a[href]").each((_, el) => {
      const href = $(el).attr("href") || "";
      const fullUrl = href.startsWith("http")
        ? href
        : `${baseUrl}${href.startsWith("/") ? "" : "/"}${href}`;

      const lowerHref = href.toLowerCase();
      const text = $(el).text().trim().toLowerCase();

      // Look for pagination links
      if (
        text === "next" ||
        text === ">" ||
        text === ">>" ||
        text.includes("next page") ||
        /page[=\/]\d+/.test(lowerHref) ||
        /p=\d+/.test(lowerHref) ||
        /offset=\d+/.test(lowerHref)
      ) {
        links.push(fullUrl);
      }
    });
  } catch {
    // Ignore
  }

  return [...new Set(links)].slice(0, 10);
}

async function scrapeVehiclePage(
  url: string,
  baseUrl: string
): Promise<ScrapedVehicle | null> {
  try {
    const html = await fetchPage(url);
    const $ = cheerio.load(html);

    // Extract title - usually in h1 or title tag
    const h1Text = $("h1").first().text().trim();
    const titleText = $("title").first().text().trim();
    const text = h1Text || titleText;

    if (!text) return null;

    // Try to extract from structured data (JSON-LD)
    const jsonLd = extractJsonLd($);
    if (jsonLd) {
      return {
        ...jsonLd,
        url,
      };
    }

    // Parse year/make/model from title text
    const parsed = parseYearMakeModel(text);
    if (!parsed) return null;

    // Extract price
    const price = extractPrice($);

    // Extract VIN
    const vin = extractVin($, html);

    // Generate unit ID from URL or stock number
    const unitId = extractUnitId(url) || `WEB-${hashString(url)}`;

    return {
      unitId,
      year: parsed.year,
      make: parsed.make,
      model: parsed.model,
      price,
      vin,
      url,
      type: parsed.type || null,
    };
  } catch (err: any) {
    console.warn(`[Scraper] Failed to scrape ${url}: ${err.message}`);
    return null;
  }
}

function extractJsonLd($: cheerio.CheerioAPI): Omit<ScrapedVehicle, "url"> | null {
  try {
    const scripts = $('script[type="application/ld+json"]');
    for (let i = 0; i < scripts.length; i++) {
      const content = $(scripts[i]).html();
      if (!content) continue;

      const data = JSON.parse(content);
      const item = Array.isArray(data) ? data[0] : data;

      if (
        item["@type"] === "Vehicle" ||
        item["@type"] === "Car" ||
        item["@type"] === "Product" ||
        item["@type"] === "IndividualProduct"
      ) {
        const name = item.name || item.model?.name || "";
        const parsed = parseYearMakeModel(name);

        return {
          unitId: item.sku || item.productID || item.vehicleIdentificationNumber || `WEB-${hashString(name)}`,
          year: parseInt(item.modelDate || item.vehicleModelDate) || parsed?.year || 0,
          make: item.brand?.name || item.manufacturer?.name || parsed?.make || "Unknown",
          model: item.model?.name || item.model || parsed?.model || name,
          price: item.offers?.price?.toString() || item.offers?.lowPrice?.toString() || null,
          vin: item.vehicleIdentificationNumber || null,
          type: item.vehicleConfiguration || null,
        };
      }
    }
  } catch {
    // JSON-LD parsing failed, fall back to HTML parsing
  }
  return null;
}

function parseYearMakeModel(
  text: string
): { year: number; make: string; model: string; type?: string } | null {
  // Clean the text
  const cleaned = text
    .replace(/\s+/g, " ")
    .replace(/[–—]/g, "-")
    .trim();

  // Try to find a year (2000-2029)
  const yearMatch = cleaned.match(/\b(20[0-2]\d)\b/);
  if (!yearMatch) return null;

  const year = parseInt(yearMatch[1]);
  const afterYear = cleaned.substring(cleaned.indexOf(yearMatch[1]) + 4).trim();

  if (!afterYear) return null;

  // Try to match known RV makes
  const lowerAfterYear = afterYear.toLowerCase();
  let matchedMake = "";
  let makeEndIndex = 0;

  for (const make of RV_MAKES) {
    if (lowerAfterYear.startsWith(make)) {
      if (make.length > matchedMake.length) {
        matchedMake = make;
        makeEndIndex = make.length;
      }
    }
  }

  if (matchedMake) {
    // Capitalize make properly
    const originalMake = afterYear.substring(0, makeEndIndex).trim();
    const model = afterYear.substring(makeEndIndex).trim()
      .replace(/^[-\s]+/, "")
      .replace(/\s+(for\s+sale|new|used|in\s+stock).*$/i, "")
      .trim();

    return {
      year,
      make: capitalizeWords(originalMake),
      model: model || "Unknown",
    };
  }

  // If no known make found, take first word as make, rest as model
  const parts = afterYear.split(/\s+/);
  if (parts.length >= 2) {
    const make = parts[0];
    const model = parts
      .slice(1)
      .join(" ")
      .replace(/\s+(for\s+sale|new|used|in\s+stock).*$/i, "")
      .trim();

    return {
      year,
      make: capitalizeWords(make),
      model: model || "Unknown",
    };
  }

  return null;
}

function extractPrice($: cheerio.CheerioAPI): string | null {
  // Strategy 1: Look for common price selectors
  const priceSelectors = [
    ".price",
    ".sale-price",
    ".final-price",
    ".vehicle-price",
    ".listing-price",
    '[data-price]',
    '.our-price',
    '.internet-price',
    '.msrp',
    '.sticker-price',
  ];

  for (const selector of priceSelectors) {
    const el = $(selector).first();
    if (el.length) {
      const text = el.text().trim();
      const priceMatch = text.match(/\$[\d,]+(\.\d{2})?/);
      if (priceMatch) {
        return priceMatch[0].replace(/[$,]/g, "");
      }
      // Check data-price attribute
      const dataPrice = el.attr("data-price");
      if (dataPrice) return dataPrice;
    }
  }

  // Strategy 2: Search body text for price patterns
  const bodyText = $("body").text();
  const prices: number[] = [];
  const priceRegex = /\$\s*([\d,]+)(?:\.\d{2})?/g;
  let match;
  while ((match = priceRegex.exec(bodyText)) !== null) {
    const value = parseInt(match[1].replace(/,/g, ""));
    // RV prices are typically between $5,000 and $2,000,000
    if (value >= 5000 && value <= 2000000) {
      prices.push(value);
    }
  }

  if (prices.length > 0) {
    // Return the most reasonable price (often the lowest non-trivial one)
    prices.sort((a, b) => a - b);
    return prices[0].toString();
  }

  return null;
}

function extractVin($: cheerio.CheerioAPI, html: string): string | null {
  // VIN is 17 alphanumeric characters
  const vinRegex = /\b([A-HJ-NPR-Z0-9]{17})\b/g;

  // Check common selectors first
  const vinSelectors = ['.vin', '[data-vin]', '.vehicle-vin', '#vin'];
  for (const selector of vinSelectors) {
    const el = $(selector).first();
    if (el.length) {
      const text = el.text().trim() || el.attr("data-vin") || "";
      const match = text.match(vinRegex);
      if (match) return match[0];
    }
  }

  // Search page text near "VIN" label
  const bodyText = $("body").text();
  const vinLabelMatch = bodyText.match(/VIN[:\s#]*([A-HJ-NPR-Z0-9]{17})/i);
  if (vinLabelMatch) return vinLabelMatch[1];

  return null;
}

function extractUnitId(url: string): string | null {
  // Try stock number from URL
  const stockMatch = url.match(/stock[-_]?#?(\w+)/i);
  if (stockMatch) return stockMatch[1].toUpperCase();

  // Try unit/item ID from URL
  const idMatch = url.match(/(?:unit|item|vehicle|listing|inventory)[/-](\w+)/i);
  if (idMatch) return idMatch[1].toUpperCase();

  return null;
}

function hashString(str: string): string {
  let hash = 0;
  for (let i = 0; i < str.length; i++) {
    const char = str.charCodeAt(i);
    hash = (hash << 5) - hash + char;
    hash |= 0;
  }
  return Math.abs(hash).toString(36).toUpperCase().substring(0, 8);
}

function capitalizeWords(str: string): string {
  return str
    .split(/\s+/)
    .map((w) => w.charAt(0).toUpperCase() + w.slice(1).toLowerCase())
    .join(" ");
}

// ---- Scheduled Auto-Sync ----

export async function runScheduledScrape() {
  console.log("[Scraper] Running scheduled inventory sync...");

  try {
    const database = getDb();
    const allDealerships = await database.select().from(dealerships);

    for (const dealership of allDealerships) {
      if (!dealership.websiteUrl) {
        console.log(`[Scraper] Skipping ${dealership.name} — no website URL configured`);
        continue;
      }

      console.log(`[Scraper] Syncing inventory for ${dealership.name}: ${dealership.websiteUrl}`);
      const result = await scrapeInventoryFromWebsite(dealership.id, dealership.websiteUrl);

      if (result.success) {
        console.log(
          `[Scraper] ${dealership.name}: ${result.newUnits} new, ${result.updatedUnits} updated`
        );
      } else {
        console.error(`[Scraper] ${dealership.name} failed: ${result.errors.join(", ")}`);
      }
    }

    console.log("[Scraper] Scheduled sync complete");
  } catch (error: any) {
    console.error("[Scraper] Scheduled sync error:", error.message);
  }
}

export function startInventorySyncScheduler() {
  console.log("[Scraper] Inventory sync scheduler started (runs every 24h)");
  setInterval(runScheduledScrape, TWENTY_FOUR_HOURS);
  return { runNow: runScheduledScrape };
}
