import { getDb, getDealershipByUsername } from "./server/db";
import bcrypt from "bcryptjs";

async function check() {
    try {
        const username = "test123";
        console.log(`Checking user: ${username}`);
        const user = await getDealershipByUsername(username);

        if (!user) {
            console.log("User NOT found in database.");
            return;
        }

        console.log("User found!");
        console.log("Password hash in DB:", user.passwordHash);

        const isValid = await bcrypt.compare("test123", user.passwordHash);
        console.log("Testing password 'test123':", isValid ? "VALID" : "INVALID");

        if (!isValid) {
            console.log("Re-hashing password and updating...");
            const newHash = await bcrypt.hash("test123", 10);
            const db = getDb();
            const { dealerships } = await import("./shared/schema");
            const { eq } = await import("drizzle-orm");
            await db.update(dealerships).set({ passwordHash: newHash }).where(eq(dealerships.id, user.id));
            console.log("Password updated to 'test123'!");
        }
    } catch (err) {
        console.error("Diagnostic error:", err);
    } finally {
        process.exit();
    }
}

check();
