
import 'dotenv/config';
import fs from 'fs';
import path from 'path';
import { parse } from 'csv-parse/sync';
import { getDb, getDealershipByUsername } from "../server/db";
import { inventory, users } from "../shared/schema";
import { eq } from "drizzle-orm";

async function importInventory() {
    try {
        console.log("🚀 Starting Inventory Import...");

        // 1. Get the Dealership User (for dealershipId)
        // We'll use 'test123' as the default owner for imported items
        const username = "test123";
        const dealership = await getDealershipByUsername(username);

        if (!dealership) {
            console.error(`❌ Error: Dealership user '${username}' not found. Please run seed script first.`);
            process.exit(1);
        }

        console.log(`✅ Importing for Dealership: ${dealership.name} (ID: ${dealership.id})`);

        // 2. Read the CSV file
        const uploadDir = path.join(process.cwd());
        const csvFilePath = path.join(uploadDir, 'inventory.csv');

        if (!fs.existsSync(csvFilePath)) {
            console.error(`❌ Error: 'inventory.csv' not found in root directory.`);
            console.log(`👉 Please create 'inventory.csv' with columns: unit_id, year, make, model, price, vin, type`);
            process.exit(1);
        }

        const fileContent = fs.readFileSync(csvFilePath, 'utf-8');

        // 3. Parse CSV
        interface CsvRow {
            unit_id: string;
            year: string;
            make: string;
            model: string;
            vin?: string;
            price?: string;
            type?: string;
            length?: string;
            weight?: string;
            sleep_capacity?: string;
        }

        const records = parse(fileContent, {
            columns: true,
            skip_empty_lines: true,
            trim: true
        }) as CsvRow[];

        console.log(`📄 Found ${records.length} items to import.`);

        if (records.length === 0) {
            console.log("⚠️ CSV is empty.");
            process.exit(0);
        }

        // 4. Insert into Database
        const db = getDb();
        let count = 0;

        for (const row of records) {
            // Basic validation/mapping
            if (!row.unit_id || !row.year || !row.make || !row.model) {
                console.warn(`⚠️ Skipping invalid row (missing required fields):`, row);
                continue;
            }

            /* 
               Expected CSV Headers:
               unit_id, year, make, model, price, vin, type, length, weight, sleep_capacity
            */

            const newItem = {
                dealershipId: dealership.id,
                unitId: row.unit_id,
                year: parseInt(row.year),
                make: row.make,
                model: row.model,
                vin: row.vin || `MOCKVIN${Math.floor(Math.random() * 100000)}`, // Fallback VIN
                price: row.price ? row.price.replace(/[^0-9.]/g, '') : "0",
                status: "in_stock" as const,
                storeLocation: "Main Lot", // Default
                arrivalDate: new Date(),
                // Map other fields as needed based on schema
                length: row.length ? row.length : null,
                weight: row.weight ? row.weight : null,
                bedCount: row.sleep_capacity ? parseInt(row.sleep_capacity) : null,
                fuelType: row.type || "Gas", // Default for now
                address: "123 RV Way" // Dummy for now if needed? No, schema doesn't have address on inventory usually, let's check.
                // checking schema... schema has 'storeLocation'
            };

            // Remove 'address' from newItem if it's not in schema
            // Re-checking lines 86-109 of schema.ts...
            // valid fields: vin, unitId, year, make, model, length, weight, bedType, bedCount, amenities, bathrooms, slideOutCount, fuelType, horsepower, price, status, storeLocation, arrivalDate.

            await db.insert(inventory).values(newItem as any); // Type cast for safety during script dev
            count++;
            process.stdout.write("."); // Progress dot
        }

        console.log(`\n\n✅ Successfully imported ${count} inventory items!`);

    } catch (error) {
        console.error("\n❌ Import failed:", error);
    } finally {
        process.exit();
    }
}

importInventory();
