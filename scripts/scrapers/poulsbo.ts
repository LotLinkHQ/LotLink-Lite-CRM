import * as cheerio from "cheerio";
import { getDb } from "../../server/db";
import { inventory, users, dealerships } from "../../shared/schema";
import { eq } from "drizzle-orm";
import "dotenv/config";

const BASE_URL = "https://www.poulsborv.com";
const CATEGORIES = [
    "/shop/rvs/class-a/",
    "/shop/rvs/class-c/",
    "/shop/rvs/travel-trailer/",
    "/shop/rvs/fifth-wheel/"
];

async function scrape() {
    console.log("Starting Poulsbo RV scraper...");

    // 1. Get Dealership ID
    const db = getDb();
    // For the pilot, we'll look for a dealership with username 'poulsborv' or ID 1 if default
    const dealers = await db.select().from(dealerships).where(eq(dealerships.username, "poulsborv")).limit(1);
    const dealershipId = dealers[0] ? dealers[0].id : 1; // Fallback to 1 for dev

    console.log(`Scraping for Dealership ID: ${dealershipId}`);

    // 2. Iterate Categories
    for (const catPath of CATEGORIES) {
        const url = `${BASE_URL}${catPath}`;
        console.log(`Scraping Category: ${url}`);

        try {
            const response = await fetch(url);
            const html = await response.text();
            const $ = cheerio.load(html);

            // 3. Find Product Links
            // Strategy: Look for links containing "stock-"
            // The URLs are like: /rvs/2024-coachmen-encore-375rb-class-a-for-sale-stock-m3441/
            const vehicleLinks = new Set<string>();

            $("a").each((_, element) => {
                const href = $(element).attr("href");
                if (href && href.includes("/rvs/") && href.includes("stock-")) {
                    // Normalize URL
                    const fullLink = href.startsWith("http") ? href : `${BASE_URL}${href}`;
                    vehicleLinks.add(fullLink);
                }
            });

            console.log(`Found ${vehicleLinks.size} vehicles in category ${catPath}`);

            // 4. Process a few vehicles (Pilot Mode: Limit to 5 per category to be polite)
            let count = 0;
            for (const link of vehicleLinks) {
                if (count >= 5) break;
                await scrapeVehicle(link, dealershipId, db);
                count++;
            }

        } catch (e) {
            console.error(`Error scraping category ${catPath}:`, e);
        }
    }
}

async function scrapeVehicle(url: string, dealershipId: number, db: any) {
    try {
        // console.log(`Processing: ${url}`);
        const stockMatch = url.match(/stock-([a-zA-Z0-9]+)/);
        const unitId = stockMatch ? stockMatch[1].toUpperCase() : "UNKNOWN";

        if (unitId === "UNKNOWN") return;

        // Fetch Details
        const response = await fetch(url);
        const html = await response.text();
        const $ = cheerio.load(html);

        // Extract Data
        // Title is usually h1
        const title = $("h1").first().text().trim();

        // Price - tough one. Look for '$'
        // Common classes: .price, .sale-price, .final-price
        // Or just search body text for "$XXX,XXX"
        let price = "Call for Price";

        // Try to find a price text
        const bodyText = $("body").text();
        const priceMatch = bodyText.match(/\$[0-9]{1,3}(,[0-9]{3})*/);
        if (priceMatch) {
            price = priceMatch[0];
        }

        // Parse Year/Make/Model from Title
        // "2024 Coachmen Encore 375RB"
        const titleParts = title.split(" ");
        const year = parseInt(titleParts[0]) || 2024;
        const make = titleParts[1] || "Unknown";
        const model = titleParts.slice(2).join(" ") || "Unknown";

        // Upsert to DB
        // Check if exists
        const existingItems = await db.select().from(inventory).where(eq(inventory.unitId, unitId)).limit(1);
        const existing = existingItems[0];

        if (existing) {
            // Update Price?
            console.log(`[UPDATE] ${unitId}: ${title} - ${price}`);
            await db.update(inventory).set({ price, updatedAt: new Date() }).where(eq(inventory.id, existing.id));
        } else {
            console.log(`[NEW] ${unitId}: ${title} - ${price}`);
            await db.insert(inventory).values({
                dealershipId,
                unitId,
                year,
                make,
                model,
                price,
                status: "in_stock",
                storeLocation: "Poulsbo Scraped",
                arrivalDate: new Date(),
            });
        }

    } catch (e) {
        console.error(`Error scraping vehicle ${url}:`, e);
    }
}

scrape().then(() => console.log("Done")).catch(console.error);
