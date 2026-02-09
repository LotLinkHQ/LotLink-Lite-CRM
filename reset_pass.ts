import { getDb } from "./server/db";
import { dealerships } from "./shared/schema";
import { eq } from "drizzle-orm";
import bcrypt from "bcryptjs";

async function reset() {
    try {
        const db = getDb();
        const username = "test123";
        const password = "test123";
        const saltRounds = 10;

        console.log(`Resetting password for: ${username}`);

        const passwordHash = await bcrypt.hash(password, saltRounds);

        const result = await db.update(dealerships)
            .set({ passwordHash })
            .where(eq(dealerships.username, username))
            .returning();

        if (result.length > 0) {
            console.log("Success! Password reset to 'test123'.");
        } else {
            console.log("User 'test123' not found. Seeding new user...");
            await db.insert(dealerships).values({
                name: "Demo RV Dealership",
                username: "test123",
                passwordHash,
                email: "demo@rvdealer.com",
                phone: "555-0100",
                address: "123 RV Boulevard, Dealership City, TX 75001",
                numberOfStores: 2,
                stores: ["Main Store", "North Location"],
            });
            console.log("Success! Test user 'test123' created with password 'test123'.");
        }
    } catch (err) {
        console.error("Reset error:", err);
    } finally {
        process.exit();
    }
}

reset();
