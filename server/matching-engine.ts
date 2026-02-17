import * as db from "./db";
import { sendSMS } from "./twilio";
import { sendEmail } from "./sendgrid";

interface MatchResult {
  leadId: number;
  score: number;
  reasons: string[];
}

function normalizeString(s: string | null | undefined): string {
  return (s || "").toLowerCase().trim();
}

function scoreLeadAgainstUnit(lead: any, unit: any): MatchResult {
  const reasons: string[] = [];
  let score = 0;

  const leadModel = normalizeString(lead.preferredModel);
  const unitModel = normalizeString(unit.model);
  const unitMake = normalizeString(unit.make);
  const unitFull = `${unitMake} ${unitModel}`;

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

    if (wordMatches > 0) {
      const matchRatio = wordMatches / leadWords.length;
      if (matchRatio >= 0.8) {
        score += 50;
        reasons.push(`Strong model match: "${lead.preferredModel}" matches "${unit.make} ${unit.model}"`);
      } else if (matchRatio >= 0.5) {
        score += 35;
        reasons.push(`Partial model match: "${lead.preferredModel}" partially matches "${unit.make} ${unit.model}"`);
      } else if (matchRatio > 0) {
        score += 20;
        reasons.push(`Keyword overlap: "${lead.preferredModel}" has common terms with "${unit.make} ${unit.model}"`);
      }
    }

    if (leadModel === unitModel || leadModel === unitFull) {
      score += 15;
      reasons.push("Exact model name match");
    }
  }

  if (lead.preferredYear && unit.year) {
    const yearDiff = Math.abs(lead.preferredYear - unit.year);
    if (yearDiff === 0) {
      score += 20;
      reasons.push(`Exact year match: ${unit.year}`);
    } else if (yearDiff <= 1) {
      score += 12;
      reasons.push(`Close year match: wanted ${lead.preferredYear}, unit is ${unit.year}`);
    } else if (yearDiff <= 3) {
      score += 5;
      reasons.push(`Year within range: wanted ${lead.preferredYear}, unit is ${unit.year}`);
    }
  }

  const prefs = lead.preferences as any;
  if (prefs && typeof prefs === "object") {
    if (prefs.maxPrice && unit.price) {
      const maxPrice = parseFloat(prefs.maxPrice);
      const unitPrice = parseFloat(unit.price);
      if (!isNaN(maxPrice) && !isNaN(unitPrice)) {
        if (unitPrice <= maxPrice) {
          score += 10;
          reasons.push(`Within budget: $${unitPrice.toLocaleString()} <= $${maxPrice.toLocaleString()}`);
        } else if (unitPrice <= maxPrice * 1.1) {
          score += 5;
          reasons.push(`Slightly over budget: $${unitPrice.toLocaleString()} (budget $${maxPrice.toLocaleString()})`);
        }
      }
    }

    if (prefs.minLength && unit.length) {
      const minLen = parseFloat(prefs.minLength);
      const unitLen = parseFloat(unit.length);
      if (!isNaN(minLen) && !isNaN(unitLen) && unitLen >= minLen) {
        score += 5;
        reasons.push(`Meets length requirement: ${unitLen}ft >= ${minLen}ft`);
      }
    }

    if (prefs.bedType && unit.bedType) {
      if (normalizeString(prefs.bedType) === normalizeString(unit.bedType)) {
        score += 5;
        reasons.push(`Bed type match: ${unit.bedType}`);
      }
    }

    if (prefs.make && unit.make) {
      if (normalizeString(prefs.make) === normalizeString(unit.make)) {
        score += 10;
        reasons.push(`Make/brand match: ${unit.make}`);
      }
    }
  }

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

  return { leadId: lead.id, score, reasons };
}

function getMatchThreshold(sensitivity: string): number {
  switch (sensitivity) {
    case "strict":
      return 50;
    case "moderate":
      return 30;
    case "loose":
      return 15;
    default:
      return 30;
  }
}

function buildNotificationMessage(lead: any, unit: any, score: number, reasons: string[]): string {
  const unitName = `${unit.year} ${unit.make} ${unit.model}`;
  const priceStr = unit.price ? ` - $${parseFloat(unit.price).toLocaleString()}` : "";
  const locationStr = unit.storeLocation ? ` at ${unit.storeLocation}` : "";

  return (
    `Hi ${lead.customerName}! Great news from your dealership! ` +
    `A ${unitName}${priceStr} just arrived${locationStr}. ` +
    `Based on your preferences, we think this could be a great fit for you. ` +
    `Reply or call us to schedule a viewing. We'd love to help you find your perfect RV!`
  );
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

  // Get dealership info for manager contact details
  const dealership = await db.getDealershipById(dealershipId);
  const prefs = await db.getDealershipPreferences(dealershipId);
  const sensitivity = prefs?.matchingSensitivity || "moderate";
  const threshold = getMatchThreshold(sensitivity);
  const smsEnabled = prefs?.smsNotifications !== false;

  console.log(`[Matching] Sensitivity: ${sensitivity}, Threshold: ${threshold}, SMS enabled: ${smsEnabled}`);

  // PERFORMANCE FIX: Batch fetch all existing matches to avoid N+1 query problem
  const leadIds = activeLeads.map(lead => lead.id);
  const allExistingMatches = await db.getMatchesByLeadIds(leadIds);

  // Create a lookup map for O(1) access
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

    if (matchResult.score >= threshold) {
      console.log(`[Matching] Match found! Lead "${lead.customerName}" (score: ${matchResult.score})`);

      // Use pre-fetched matches from the lookup map
      const existingMatches = matchesByLeadId.get(lead.id) || [];
      const alreadyMatched = existingMatches.some(
        (m: any) => m.inventoryId === inventoryId && m.status !== "dismissed"
      );

      if (alreadyMatched) {
        console.log(`[Matching] Lead "${lead.customerName}" already matched to this unit, skipping`);
        continue;
      }

      const match = await db.createMatch({
        leadId: lead.id,
        inventoryId: inventoryId,
        matchScore: matchResult.score,
        matchReason: matchResult.reasons.join("; "),
        status: "pending",
      });

      await db.createMatchHistory({
        leadId: lead.id,
        inventoryId: inventoryId,
        matchId: match.id,
        matchScore: matchResult.score,
        matchReason: matchResult.reasons.join("; "),
        status: "matched",
      });

      let smsSent = false;
      let emailSent = false;
      let smsError: string | undefined;
      let emailError: string | undefined;
      const managerEmail = dealership?.email || process.env.MANAGER_EMAIL || "";
      const managerPhone = dealership?.phone || process.env.MANAGER_PHONE || "";

      const emailEnabled = prefs?.emailNotifications !== false;
      const smsEnabled = prefs?.smsNotifications !== false;

      if (emailEnabled) {
        const emailResult = await sendEmail(
          managerEmail,
          lead,
          unit,
          matchResult.score,
          matchResult.reasons
        );
        if (emailResult.success) {
          emailSent = true;
          notificationsSent++;
          console.log(`[Matching] Manager Alert Email sent to ${managerEmail} regarding lead ${lead.customerName}`);

          await db.updateMatch(match.id, {
            status: "notified",
            notificationSentAt: new Date(),
            notificationMethod: "email",
          });

          await db.updateLead(lead.id, { status: "matched" });

          // In-App Notification for the person who entered the lead
          const salesperson = lead.salespersonName || "a salesperson";
          await db.createInAppNotification({
            dealershipId: dealershipId,
            leadId: lead.id,
            inventoryId: inventoryId,
            matchId: match.id,
            title: "New Match Found!",
            message: `A potential match has been found for your lead ${lead.customerName} with unit ${unit.year} ${unit.make} ${unit.model}. (Entered by: ${salesperson})`,
          });
        } else {
          emailError = emailResult.error;
          console.log(`[Matching] Manager Email failed: ${emailError}`);
        }
      }

      if (smsEnabled && !emailSent) {
        const unitName = `${unit.year} ${unit.make} ${unit.model}`;
        const smsBody = `🚐 Lead Match Alert: ${lead.customerName} matches a new ${unitName} (Score: ${matchResult.score}/100). Check CRM for details!`;
        const smsResult = await sendSMS(managerPhone, smsBody);

        if (smsResult.success) {
          smsSent = true;
          notificationsSent++;
          console.log(`[Matching] Manager Alert SMS sent to ${managerPhone} regarding lead ${lead.customerName}`);

          await db.updateMatch(match.id, {
            status: "notified",
            notificationSentAt: new Date(),
            notificationMethod: "sms",
          });
          await db.updateLead(lead.id, { status: "matched" });
        } else {
          smsError = smsResult.error;
          console.log(`[Matching] Manager SMS failed: ${smsError}`);
        }
      }

      results.push({
        matchId: match.id,
        leadId: lead.id,
        customerName: lead.customerName,
        customerPhone: lead.customerPhone,
        customerEmail: lead.customerEmail,
        score: matchResult.score,
        reasons: matchResult.reasons,
        smsSent,
        emailSent,
        smsError,
        emailError,
      });
    }
  }

  if (results.length > 0) {
    await db.updateInventory(inventoryId, { status: "matched" });
  }

  console.log(
    `[Matching] Complete. ${results.length} matches found, ${notificationsSent} notifications sent (email + SMS)`
  );

  return { matchesFound: results.length, notificationsSent, results };
}

export async function retryPendingNotifications(dealershipId: number) {
  console.log(`[Matching] Retrying pending notifications for dealership #${dealershipId}`);

  const allMatches = await db.getAllDealershipMatches(dealershipId);
  const pendingMatches = allMatches.filter(
    (m: any) => m.match?.status === "pending" && !m.match?.notificationSentAt
  );

  console.log(`[Matching] Found ${pendingMatches.length} pending matches to retry`);

  // Get dealership info for manager contact details
  const dealership = await db.getDealershipById(dealershipId);
  const prefs = await db.getDealershipPreferences(dealershipId);
  const emailEnabled = prefs?.emailNotifications !== false;
  const smsEnabled = prefs?.smsNotifications !== false;

  let sent = 0;
  for (const entry of pendingMatches) {
    const lead = entry.lead;
    const unit = entry.unit;
    const matchRecord = entry.match;

    const managerEmail = dealership?.email || process.env.MANAGER_EMAIL || "";
    const managerPhone = dealership?.phone || process.env.MANAGER_PHONE || "";

    let notified = false;
    const reasons = [matchRecord.matchReason || ""];

    if (emailEnabled) {
      const emailResult = await sendEmail(managerEmail, lead, unit, matchRecord.matchScore, reasons);
      if (emailResult.success) {
        notified = true;
        console.log(`[Matching] Retry manager email alert sent to ${managerEmail} for lead ${lead.customerName}`);
      }
    }

    if (smsEnabled && !notified) {
      const unitName = `${unit.year} ${unit.make} ${unit.model}`;
      const message = `🚐 Retry Alert: Lead match found for ${lead.customerName} - ${unitName} (${matchRecord.matchScore}/100). Check CRM.`;
      const smsResult = await sendSMS(managerPhone, message);
      if (smsResult.success) {
        notified = true;
        console.log(`[Matching] Retry manager SMS alert sent to ${managerPhone} for lead ${lead.customerName}`);
      }
    }

    if (notified) {
      sent++;
      let method: "email" | "sms" = "sms";
      if (emailEnabled && lead.customerEmail) {
        method = "email";
      }
      await db.updateMatch(matchRecord.id, {
        status: "notified",
        notificationSentAt: new Date(),
        notificationMethod: method,
      });
      await db.updateLead(lead.id, { status: "matched" });
    }
  }

  console.log(`[Matching] Retry complete. ${sent}/${pendingMatches.length} notifications sent`);
  return { retried: pendingMatches.length, sent };
}

export async function runMatchingForAllInventory(dealershipId: number) {
  const allInventory = await db.getUserInventory(dealershipId);
  const inStockUnits = allInventory.filter((u: any) => u.status === "in_stock");

  console.log(`[Matching] Starting parallel scan of ${inStockUnits.length} units`);

  // PERFORMANCE FIX: Process units in parallel with concurrency limiting
  const CONCURRENCY_LIMIT = 10;
  let totalMatches = 0;
  let totalNotifications = 0;

  // Process in batches to avoid overwhelming the database
  for (let i = 0; i < inStockUnits.length; i += CONCURRENCY_LIMIT) {
    const batch = inStockUnits.slice(i, i + CONCURRENCY_LIMIT);
    const results = await Promise.all(
      batch.map(unit => runMatchingForNewInventory(unit.id, dealershipId))
    );

    for (const result of results) {
      totalMatches += result.matchesFound;
      totalNotifications += result.notificationsSent;
    }

    console.log(`[Matching] Processed ${Math.min(i + CONCURRENCY_LIMIT, inStockUnits.length)}/${inStockUnits.length} units`);
  }

  console.log(`[Matching] Parallel scan complete: ${totalMatches} matches, ${totalNotifications} notifications`);
  return { totalMatches, totalNotifications, unitsScanned: inStockUnits.length };
}
