import bcrypt from "bcryptjs";
import { getDb, getDealershipByUsername, createDealership, isUsingJsonFallback, getUserByEmail, createUser } from "./db";

export async function seedDatabase() {
  if (isUsingJsonFallback()) {
    console.log("[Seed] Skipping seed (no database)");
    return;
  }

  try {
    // Seed dealership
    const demoPassword = process.env.SEED_DEMO_PASSWORD || "changeme123";
    let dealership = await getDealershipByUsername("test123");
    if (!dealership) {
      const passwordHash = await bcrypt.hash(demoPassword, 10);
      dealership = await createDealership({
        name: "Demo RV Dealership",
        username: "test123",
        passwordHash,
        emailDomain: "demo-rv.com",
        email: "demo@rvdealer.com",
        phone: "555-0100",
        address: "123 RV Boulevard, Dealership City, TX 75001",
        numberOfStores: 2,
        stores: ["Main Store", "North Location"],
      });
      console.log("[Seed] Test dealership created");
    } else {
      console.log("[Seed] Test dealership already exists");
    }

    // Seed admin user
    const adminPassword = process.env.SEED_ADMIN_PASSWORD || "changeme123";
    const existingUser = await getUserByEmail("admin@demo-rv.com");
    if (!existingUser) {
      const userPasswordHash = await bcrypt.hash(adminPassword, 10);
      await createUser({
        email: "admin@demo-rv.com",
        passwordHash: userPasswordHash,
        name: "Demo Admin",
        dealershipId: dealership!.id,
        role: "admin",
      });
      console.log("[Seed] Test admin user created");
    } else {
      console.log("[Seed] Test user already exists");
    }

    // Seed platform owner
    const ownerPassword = process.env.SEED_OWNER_PASSWORD;
    if (!ownerPassword) {
      console.log("[Seed] Skipping owner seed (SEED_OWNER_PASSWORD not set)");
      return;
    }
    const ownerPasswordHash = await bcrypt.hash(ownerPassword, 10);
    const existingOwner = await getUserByEmail("jonathan@lotlink.io");
    if (!existingOwner) {
      await createUser({
        email: "jonathan@lotlink.io",
        passwordHash: ownerPasswordHash,
        name: "Jonathan",
        dealershipId: dealership!.id,
        role: "owner",
      });
      console.log("[Seed] Owner account created");
    } else {
      // Always update password and link to dealership
      const db = getDb();
      const { users } = await import("../shared/schema");
      const { eq } = await import("drizzle-orm");
      await db.update(users).set({ passwordHash: ownerPasswordHash, role: "owner", dealershipId: dealership!.id }).where(eq(users.email, "jonathan@lotlink.io"));
      console.log("[Seed] Owner account updated");
    }
  } catch (error) {
    console.error("[Seed] Error seeding database:", error);
  }
}
