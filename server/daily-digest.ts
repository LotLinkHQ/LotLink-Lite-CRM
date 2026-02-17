import { getDb } from "./db";
import * as db from "./db";
import { sendDailyDigestEmail } from "./sendgrid";
import { dealerships, matches, leads, inventory } from "../shared/schema";
import { desc, gte, eq } from "drizzle-orm";

const TWENTY_FOUR_HOURS = 24 * 60 * 60 * 1000;

async function runDailyDigest() {
  console.log("[Digest] Running daily digest...");

  try {
    const database = getDb();

    // Get all dealerships
    const allDealerships = await database.select().from(dealerships);

    for (const dealership of allDealerships) {
      const managerEmail = dealership.email || process.env.MANAGER_EMAIL;
      if (!managerEmail) {
        console.log(`[Digest] Skipping ${dealership.name} — no email configured`);
        continue;
      }

      // Get matches from the last 24 hours
      const since = new Date(Date.now() - TWENTY_FOUR_HOURS);
      const recentMatches = await database
        .select({
          id: matches.id,
          match: matches,
          lead: leads,
          unit: inventory,
        })
        .from(matches)
        .innerJoin(leads, eq(matches.leadId, leads.id))
        .innerJoin(inventory, eq(matches.inventoryId, inventory.id))
        .where(gte(matches.createdAt, since))
        .orderBy(desc(matches.matchScore));

      // Filter to this dealership's leads
      const dealershipMatches = recentMatches.filter(
        (m: any) => m.lead.dealershipId === dealership.id
      );

      if (dealershipMatches.length === 0) {
        console.log(`[Digest] No matches in last 24h for ${dealership.name}`);
        continue;
      }

      const result = await sendDailyDigestEmail(
        managerEmail,
        dealershipMatches,
        dealership.name
      );

      if (result.success) {
        console.log(`[Digest] Sent digest to ${managerEmail} for ${dealership.name} (${dealershipMatches.length} matches)`);
      } else {
        console.error(`[Digest] Failed for ${dealership.name}: ${result.error}`);
      }
    }

    console.log("[Digest] Daily digest complete");
  } catch (error: any) {
    console.error("[Digest] Error:", error.message);
  }
}

export function startDailyDigest() {
  // Run first digest 24 hours from now, then every 24 hours
  console.log("[Digest] Daily digest scheduler started (runs every 24h)");
  setInterval(runDailyDigest, TWENTY_FOUR_HOURS);

  // Also expose for manual trigger
  return { runNow: runDailyDigest };
}
