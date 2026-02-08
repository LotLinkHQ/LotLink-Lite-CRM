import bcrypt from "bcryptjs";
import { getDb, getDealershipByUsername, createDealership } from "./db";

export async function seedDatabase() {
  try {
    const existing = await getDealershipByUsername("test123");
    if (existing) {
      console.log("[Seed] Test dealership already exists");
      return;
    }

    const passwordHash = await bcrypt.hash("test123", 10);
    await createDealership({
      name: "Demo RV Dealership",
      username: "test123",
      passwordHash,
      email: "demo@rvdealer.com",
      phone: "555-0100",
      address: "123 RV Boulevard, Dealership City, TX 75001",
      numberOfStores: 2,
      stores: ["Main Store", "North Location"],
    });

    console.log("[Seed] Test dealership created (username: test123, password: test123)");
  } catch (error) {
    console.error("[Seed] Error seeding database:", error);
  }
}
