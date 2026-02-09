
import 'dotenv/config';
import { getDb, getDealershipByUsername } from "../server/db";
import { inventory } from "../shared/schema";
import { eq, sql } from "drizzle-orm";

async function checkInventory() {
    try {
        const username = "test123";
        const dealership = await getDealershipByUsername(username);

        if (!dealership) {
            console.log("Dealership not found");
            return;
        }

        const db = getDb();
        const result = await db.select({ count: sql<number>`count(*)` })
            .from(inventory)
            .where(eq(inventory.dealershipId, dealership.id));

        console.log(`Inventory count for ${username}: ${result[0].count}`);
    } catch (e) {
        console.error("Error checking inventory:", e);
    } finally {
        process.exit();
    }
}

checkInventory();
