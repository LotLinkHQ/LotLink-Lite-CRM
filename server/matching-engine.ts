import * as db from "./db";
import { sendEmail } from "./sendgrid";

interface MatchResult {
  leadId: number;
  score: number;
  reasons: string[];
  explanation: string;
}

function normalizeString(s: string | null | undefined): string {
  return (s || "").toLowerCase().trim();
}

// RV type categories for category-level matching
const RV_TYPE_CATEGORIES: Record<string, string[]> = {
  "class a": ["class a", "diesel pusher", "gas motorhome"],
  "class b": ["class b", "camper van", "sprinter"],
  "class c": ["class c", "mini motorhome"],
  "travel trailer": ["travel trailer", "bumper pull"],
  "fifth wheel": ["fifth wheel", "5th wheel"],
  "toy hauler": ["toy hauler"],
  "pop-up": ["pop-up", "popup", "folding", "tent trailer"],
  "truck camper": ["truck camper", "slide-in"],
};

function getRvCategory(model: string): string | null {
  const lower = model.toLowerCase();
  for (const [category, terms] of Object.entries(RV_TYPE_CATEGORIES)) {
    if (terms.some(t => lower.includes(t))) return category;
  }
  return null;
}

function scoreLeadAgainstUnit(lead: any, unit: any): MatchResult {
  const reasons: string[] = [];
  let score = 0;

  const leadModel = normalizeString(lead.preferredModel);
  const unitModel = normalizeString(unit.model);
  const unitMake = normalizeString(unit.make);
  const unitFull = `${unitMake} ${unitModel}`;
  const prefs = lead.preferences as any;

  // ── RV Type / Model Match (up to 30pts) ──
  if (leadModel && unitModel) {
    const leadWords = leadModel.split(/\s+/).filter(Boolean);
    const unitWords = unitFull.split(/\s+/).filter(Boolean);

    let wordMatches = 0;
    for (const lw of leadWords) {
      for (const uw of unitWords) {
        if (uw.includes(lw) || lw.includes(uw)) {
          wordMatches++;
          break;
        }
      }
    }

    if (leadModel === unitModel || leadModel === unitFull) {
      score += 30;
      reasons.push(`Exact type match: ${unit.make} ${unit.model}`);
    } else if (wordMatches > 0) {
      const matchRatio = wordMatches / leadWords.length;
      if (matchRatio >= 0.6) {
        score += 30;
        reasons.push(`Strong type match: "${lead.preferredModel}" ≈ "${unit.make} ${unit.model}"`);
      } else {
        // Check category match
        const leadCat = getRvCategory(leadModel);
        const unitCat = getRvCategory(unitFull);
        if (leadCat && unitCat && leadCat === unitCat) {
          score += 15;
          reasons.push(`Same RV category (${leadCat})`);
        } else if (wordMatches > 0) {
          score += 15;
          reasons.push(`Partial type overlap: "${lead.preferredModel}" ~ "${unit.make} ${unit.model}"`);
        }
      }
    } else {
      const leadCat = getRvCategory(leadModel);
      const unitCat = getRvCategory(unitFull);
      if (leadCat && unitCat && leadCat === unitCat) {
        score += 15;
        reasons.push(`Same RV category (${leadCat})`);
      }
    }
  }

  // ── Budget Fit (up to 25pts) ──
  if (prefs && typeof prefs === "object" && unit.price) {
    const unitPrice = parseFloat(unit.price);
    const minPrice = prefs.minPrice ? parseFloat(prefs.minPrice) : 0;
    const maxPrice = prefs.maxPrice ? parseFloat(prefs.maxPrice) : 0;

    if (!isNaN(unitPrice) && maxPrice > 0) {
      if (unitPrice >= minPrice && unitPrice <= maxPrice) {
        score += 25;
        reasons.push(`Within budget: $${unitPrice.toLocaleString()} fits $${minPrice ? minPrice.toLocaleString() + '–' : ''}$${maxPrice.toLocaleString()}`);
      } else if (unitPrice <= maxPrice * 1.1) {
        score += 15;
        reasons.push(`Near budget: $${unitPrice.toLocaleString()} (budget up to $${maxPrice.toLocaleString()})`);
      }
    }
  }

  // ── Year Range Match (up to 20pts) ──
  if (lead.preferredYear && unit.year) {
    const yearDiff = Math.abs(lead.preferredYear - unit.year);
    if (yearDiff === 0) {
      score += 20;
      reasons.push(`Exact year match: ${unit.year}`);
    } else if (yearDiff <= 1) {
      score += 15;
      reasons.push(`Close year: wanted ${lead.preferredYear}, unit is ${unit.year}`);
    } else if (yearDiff <= 3) {
      score += 8;
      reasons.push(`Year within range: wanted ${lead.preferredYear}, unit is ${unit.year}`);
    }
  }

  // ── Feature Overlap (up to 15pts) ──
  let featurePoints = 0;
  if (prefs && typeof prefs === "object") {
    if (prefs.minLength && unit.length) {
      const minLen = parseFloat(prefs.minLength);
      const unitLen = parseFloat(unit.length);
      if (!isNaN(minLen) && !isNaN(unitLen) && unitLen >= minLen) {
        featurePoints += 4;
        reasons.push(`Length fits: ${unitLen}ft ≥ ${minLen}ft`);
      }
    }
    if (prefs.bedType && unit.bedType) {
      if (normalizeString(prefs.bedType) === normalizeString(unit.bedType)) {
        featurePoints += 4;
        reasons.push(`Bed type match: ${unit.bedType}`);
      }
    }
    if (prefs.minBeds && unit.bedCount) {
      if (unit.bedCount >= parseInt(prefs.minBeds)) {
        featurePoints += 3;
        reasons.push(`Bed count: ${unit.bedCount} beds ≥ ${prefs.minBeds}`);
      }
    }
    if (prefs.slideOuts && unit.slideOutCount) {
      if (unit.slideOutCount >= parseInt(prefs.slideOuts)) {
        featurePoints += 2;
        reasons.push(`Slide-outs: ${unit.slideOutCount}`);
      }
    }
    if (prefs.bathrooms && unit.bathrooms) {
      if (parseFloat(unit.bathrooms) >= parseFloat(prefs.bathrooms)) {
        featurePoints += 2;
        reasons.push(`Bathrooms: ${unit.bathrooms}`);
      }
    }
  }
  // Also check amenity overlap
  const leadAmenities = (prefs?.amenities || []) as string[];
  const unitAmenities = (unit.amenities || []) as string[];
  if (leadAmenities.length > 0 && unitAmenities.length > 0) {
    const unitAmenLower = unitAmenities.map((a: string) => normalizeString(a));
    let amenityHits = 0;
    for (const want of leadAmenities) {
      if (unitAmenLower.some((ua: string) => ua.includes(normalizeString(want)) || normalizeString(want).includes(ua))) {
        amenityHits++;
      }
    }
    if (amenityHits > 0) {
      featurePoints += Math.min(amenityHits * 2, 5);
      reasons.push(`${amenityHits} amenity match${amenityHits > 1 ? "es" : ""}`);
    }
  }
  score += Math.min(featurePoints, 15);

  // ── Make/Model Preference (up to 10pts) ──
  if (prefs && prefs.make && unit.make) {
    if (normalizeString(prefs.make) === normalizeString(unit.make)) {
      score += 10;
      reasons.push(`Preferred make: ${unit.make}`);
    }
  }

  // ── Notes keyword bonus (up to 3pts) ──
  if (lead.notes) {
    const notesLower = normalizeString(lead.notes);
    const unitTerms = [unitMake, unitModel, ...unitFull.split(/\s+/)].filter(Boolean);
    for (const term of unitTerms) {
      if (term.length > 2 && notesLower.includes(term)) {
        score += 3;
        reasons.push(`Notes mention "${term}"`);
        break;
      }
    }
  }

  // Cap at 100
  score = Math.min(score, 100);

  // ── Human-readable explanation ──
  const explanation = buildExplanation(lead, unit, score, reasons);

  return { leadId: lead.id, score, reasons, explanation };
}

function buildExplanation(lead: any, unit: any, score: number, reasons: string[]): string {
  const name = lead.customerName || "This customer";
  const prefs = lead.preferences as any;
  const parts: string[] = [];

  // What the customer wanted
  const wants: string[] = [];
  if (lead.preferredModel) wants.push(lead.preferredModel);
  if (lead.preferredYear) wants.push(`${lead.preferredYear} or newer`);
  if (prefs?.maxPrice) wants.push(`under $${parseFloat(prefs.maxPrice).toLocaleString()}`);
  if (prefs?.minLength) wants.push(`${prefs.minLength}ft+`);

  if (wants.length > 0) {
    parts.push(`${name} wanted ${wants.join(", ")}.`);
  }

  // What the unit is
  const unitDesc = `This ${unit.year} ${unit.make} ${unit.model}`;
  const unitDetails: string[] = [];
  if (unit.length) unitDetails.push(`${unit.length}ft`);
  if (unit.price) unitDetails.push(`$${parseFloat(unit.price).toLocaleString()}`);

  if (unitDetails.length > 0) {
    parts.push(`${unitDesc} at ${unitDetails.join(", ")}`);
  } else {
    parts.push(unitDesc);
  }

  // How well it fits
  if (score >= 80) {
    parts.push("hits nearly every criteria.");
  } else if (score >= 60) {
    parts.push("is a strong fit on most criteria.");
  } else if (score >= 40) {
    parts.push("matches on several points.");
  } else {
    parts.push("has some overlap with their preferences.");
  }

  return parts.join(" ");
}

// Score threshold for instant email alerts to manager
const HIGH_VALUE_THRESHOLD = 80;
// Default notification threshold
const DEFAULT_THRESHOLD = 60;

/**
 * Check if an existing match should be re-evaluated:
 * - Price changed >10% since last match
 * - Previous match was dismissed
 * - Lead preferences were recently updated (caller handles this)
 */
function shouldRematch(existing: any, unit: any): boolean {
  // Dismissed matches can be re-matched
  if (existing.status === "dismissed") return true;
  // Price changed significantly
  if (existing.lastMatchedPrice && unit.price) {
    const oldPrice = parseFloat(existing.lastMatchedPrice);
    const newPrice = parseFloat(unit.price);
    if (!isNaN(oldPrice) && !isNaN(newPrice) && oldPrice > 0) {
      const pctChange = Math.abs(newPrice - oldPrice) / oldPrice;
      if (pctChange > 0.1) return true;
    }
  }
  return false;
}

async function processMatch(
  lead: any,
  unit: any,
  matchResult: MatchResult,
  dealershipId: number,
  notifyThreshold: number,
  dealership: any,
  prefs: any,
  existingMatch: any | null,
): Promise<{ result: any | null; notified: boolean }> {
  const unitPrice = unit.price ? String(unit.price) : null;

  // If re-matching a dismissed match, update instead of create
  if (existingMatch && existingMatch.status === "dismissed") {
    await db.updateMatch(existingMatch.id, {
      matchScore: matchResult.score,
      matchReason: matchResult.reasons.join("; "),
      status: "new",
      lastMatchedPrice: unitPrice,
      dismissReason: null,
    } as any);
    await db.createMatchHistory({
      leadId: lead.id,
      inventoryId: unit.id,
      matchId: existingMatch.id,
      matchScore: matchResult.score,
      matchReason: matchResult.reasons.join("; "),
      status: "rematched",
    });
  } else if (existingMatch) {
    // Price change re-match — update score
    await db.updateMatch(existingMatch.id, {
      matchScore: matchResult.score,
      matchReason: matchResult.reasons.join("; "),
      lastMatchedPrice: unitPrice,
    } as any);
    // Don't re-notify for price updates
    return { result: null, notified: false };
  } else {
    // New match
    const match = await db.createMatch({
      leadId: lead.id,
      inventoryId: unit.id,
      matchScore: matchResult.score,
      matchReason: matchResult.reasons.join("; "),
      status: "new",
      lastMatchedPrice: unitPrice,
    } as any);

    await db.createMatchHistory({
      leadId: lead.id,
      inventoryId: unit.id,
      matchId: match.id,
      matchScore: matchResult.score,
      matchReason: matchResult.reasons.join("; "),
      status: "matched",
    });

    existingMatch = match;
  }

  // Only notify above threshold
  let emailSent = false;
  let emailError: string | undefined;
  let notified = false;

  if (matchResult.score >= notifyThreshold) {
    const managerEmail = dealership?.email || process.env.MANAGER_EMAIL || "";
    const emailEnabled = prefs?.emailNotifications !== false;

    // High-value matches get instant email
    if (emailEnabled && matchResult.score >= HIGH_VALUE_THRESHOLD && managerEmail) {
      const emailResult = await sendEmail(managerEmail, lead, unit, matchResult.score, matchResult.reasons);
      if (emailResult.success) {
        emailSent = true;
        notified = true;
        await db.updateMatch(existingMatch.id, {
          status: "notified",
          notificationSentAt: new Date(),
          notificationMethod: "email",
        });
      } else {
        emailError = emailResult.error;
      }
    }

    // In-app notification for all above-threshold matches
    const salesperson = lead.salespersonName || "a salesperson";
    await db.createInAppNotification({
      dealershipId: dealershipId,
      leadId: lead.id,
      inventoryId: unit.id,
      matchId: existingMatch.id,
      title: "New Match Found!",
      message: `${matchResult.explanation} (Score: ${matchResult.score}/100, Entered by: ${salesperson})`,
    });

    await db.updateLead(lead.id, { status: "matched" });
  }

  return {
    result: {
      matchId: existingMatch.id,
      leadId: lead.id,
      customerName: lead.customerName,
      score: matchResult.score,
      reasons: matchResult.reasons,
      explanation: matchResult.explanation,
      emailSent,
      emailError,
      belowThreshold: matchResult.score < notifyThreshold,
    },
    notified,
  };
}

export async function runMatchingForNewInventory(
  inventoryId: number,
  dealershipId: number
): Promise<{ matchesFound: number; notificationsSent: number; results: any[] }> {
  console.log(`[Matching] Starting match scan for inventory #${inventoryId}, dealership #${dealershipId}`);

  const unit = await db.getInventoryById(inventoryId);
  if (!unit) {
    console.log(`[Matching] Unit #${inventoryId} not found`);
    return { matchesFound: 0, notificationsSent: 0, results: [] };
  }

  const activeLeads = await db.getAllDealershipLeads(dealershipId);
  console.log(`[Matching] Scanning ${activeLeads.length} active leads against ${unit.year} ${unit.make} ${unit.model}`);

  const dealership = await db.getDealershipById(dealershipId);
  const prefs = await db.getDealershipPreferences(dealershipId);
  const notifyThreshold = (prefs as any)?.matchThreshold || DEFAULT_THRESHOLD;
  // Store matches at a lower bar (half of notify threshold, min 20)
  const storeThreshold = Math.max(Math.floor(notifyThreshold / 2), 20);

  console.log(`[Matching] Notify threshold: ${notifyThreshold}, Store threshold: ${storeThreshold}`);

  // Batch fetch existing matches
  const leadIds = activeLeads.map((lead: any) => lead.id);
  const allExistingMatches = await db.getMatchesByLeadIds(leadIds);
  const matchesByLeadId = new Map<number, any[]>();
  for (const match of allExistingMatches) {
    if (!matchesByLeadId.has(match.leadId)) {
      matchesByLeadId.set(match.leadId, []);
    }
    matchesByLeadId.get(match.leadId)!.push(match);
  }

  const results: any[] = [];
  let notificationsSent = 0;

  for (const lead of activeLeads) {
    const matchResult = scoreLeadAgainstUnit(lead, unit);

    if (matchResult.score >= storeThreshold) {
      const existingMatches = matchesByLeadId.get(lead.id) || [];
      const existing = existingMatches.find((m: any) => m.inventoryId === inventoryId);

      // Dedup: skip if already matched and no reason to re-match
      if (existing && !shouldRematch(existing, unit)) {
        continue;
      }

      console.log(`[Matching] Match found! Lead "${lead.customerName}" (score: ${matchResult.score})`);
      const { result, notified } = await processMatch(
        lead, unit, matchResult, dealershipId, notifyThreshold, dealership, prefs, existing || null,
      );

      if (result) results.push(result);
      if (notified) notificationsSent++;
    }
  }

  if (results.some(r => !r.belowThreshold)) {
    await db.updateInventory(inventoryId, { status: "matched" });
  }

  console.log(`[Matching] Complete. ${results.length} matches found, ${notificationsSent} notifications sent`);
  return { matchesFound: results.length, notificationsSent, results };
}

/**
 * Run matching for a new/updated lead against all in-stock inventory.
 */
export async function runMatchingForNewLead(
  leadId: number,
  dealershipId: number
): Promise<{ matchesFound: number; notificationsSent: number }> {
  console.log(`[Matching] Starting match scan for lead #${leadId}, dealership #${dealershipId}`);

  const lead = await db.getLeadById(leadId);
  if (!lead) return { matchesFound: 0, notificationsSent: 0 };

  const allInventory = await db.getUserInventory(dealershipId);
  const inStockUnits = allInventory.filter((u: any) => u.status === "in_stock" || u.status === "matched");

  const dealership = await db.getDealershipById(dealershipId);
  const prefs = await db.getDealershipPreferences(dealershipId);
  const notifyThreshold = (prefs as any)?.matchThreshold || DEFAULT_THRESHOLD;
  const storeThreshold = Math.max(Math.floor(notifyThreshold / 2), 20);

  // Fetch existing matches for this lead
  const existingMatches = await db.getMatchesByLeadId(leadId);
  const existingByUnitId = new Map(existingMatches.map((m: any) => [m.inventoryId, m]));

  let matchesFound = 0;
  let notificationsSent = 0;

  for (const unit of inStockUnits) {
    const matchResult = scoreLeadAgainstUnit(lead, unit);

    if (matchResult.score >= storeThreshold) {
      const existing = existingByUnitId.get(unit.id);
      if (existing && !shouldRematch(existing, unit)) continue;

      const { result, notified } = await processMatch(
        lead, unit, matchResult, dealershipId, notifyThreshold, dealership, prefs, existing || null,
      );

      if (result) matchesFound++;
      if (notified) notificationsSent++;
    }
  }

  console.log(`[Matching] Lead scan complete. ${matchesFound} matches, ${notificationsSent} notifications`);
  return { matchesFound, notificationsSent };
}

export async function retryPendingNotifications(dealershipId: number) {
  console.log(`[Matching] Retrying pending notifications for dealership #${dealershipId}`);

  const allMatches = await db.getAllDealershipMatches(dealershipId);
  const pendingMatches = allMatches.filter(
    (m: any) => (m.match?.status === "new" || m.match?.status === "pending") && !m.match?.notificationSentAt
  );

  console.log(`[Matching] Found ${pendingMatches.length} pending matches to retry`);

  const dealership = await db.getDealershipById(dealershipId);
  const prefs = await db.getDealershipPreferences(dealershipId);
  const emailEnabled = prefs?.emailNotifications !== false;
  const managerEmail = dealership?.email || process.env.MANAGER_EMAIL || "";

  let sent = 0;
  for (const entry of pendingMatches) {
    const lead = entry.lead;
    const unit = entry.unit;
    const matchRecord = entry.match;

    if (emailEnabled && matchRecord.matchScore >= HIGH_VALUE_THRESHOLD && managerEmail) {
      const reasons = [matchRecord.matchReason || ""];
      const emailResult = await sendEmail(managerEmail, lead, unit, matchRecord.matchScore, reasons);
      if (emailResult.success) {
        sent++;
        await db.updateMatch(matchRecord.id, {
          status: "notified",
          notificationSentAt: new Date(),
          notificationMethod: "email",
        });
        await db.updateLead(lead.id, { status: "matched" });
      }
    }
  }

  console.log(`[Matching] Retry complete. ${sent}/${pendingMatches.length} emails sent`);
  return { retried: pendingMatches.length, sent };
}

export async function runMatchingForAllInventory(dealershipId: number) {
  const allInventory = await db.getUserInventory(dealershipId);
  const inStockUnits = allInventory.filter((u: any) => u.status === "in_stock");

  console.log(`[Matching] Starting parallel scan of ${inStockUnits.length} units`);

  const CONCURRENCY_LIMIT = 10;
  let totalMatches = 0;
  let totalNotifications = 0;

  for (let i = 0; i < inStockUnits.length; i += CONCURRENCY_LIMIT) {
    const batch = inStockUnits.slice(i, i + CONCURRENCY_LIMIT);
    const results = await Promise.all(
      batch.map((unit: any) => runMatchingForNewInventory(unit.id, dealershipId))
    );

    for (const result of results) {
      totalMatches += result.matchesFound;
      totalNotifications += result.notificationsSent;
    }

    console.log(`[Matching] Processed ${Math.min(i + CONCURRENCY_LIMIT, inStockUnits.length)}/${inStockUnits.length} units`);
  }

  console.log(`[Matching] Parallel scan complete: ${totalMatches} matches, ${totalNotifications} emails`);
  return { totalMatches, totalNotifications, unitsScanned: inStockUnits.length };
}
