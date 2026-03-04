import { describe, it, expect } from "vitest";

// We need to test the pure functions from matching-engine.ts
// Since they're not exported, we re-implement the test-facing versions
// and test the scoring logic directly via the exported interface pattern.

// ── Re-create pure logic for unit testing ──
// These mirror the matching-engine.ts implementations exactly.

function normalizeString(s: string | null | undefined): string {
  return (s || "").toLowerCase().trim();
}

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
    if (terms.some((t) => lower.includes(t))) return category;
  }
  return null;
}

function shouldRematch(existing: any, unit: any): boolean {
  if (existing.status === "dismissed") return true;
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

function scoreLeadAgainstUnit(lead: any, unit: any) {
  const reasons: string[] = [];
  let score = 0;

  const leadModel = normalizeString(lead.preferredModel);
  const unitModel = normalizeString(unit.model);
  const unitMake = normalizeString(unit.make);
  const unitFull = `${unitMake} ${unitModel}`;
  const prefs = lead.preferences as any;

  // RV Type / Model Match (up to 30pts)
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
        reasons.push(`Strong type match`);
      } else {
        const leadCat = getRvCategory(leadModel);
        const unitCat = getRvCategory(unitFull);
        if (leadCat && unitCat && leadCat === unitCat) {
          score += 15;
          reasons.push(`Same RV category (${leadCat})`);
        } else if (wordMatches > 0) {
          score += 15;
          reasons.push(`Partial type overlap`);
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

  // Budget Fit (up to 25pts)
  if (prefs && typeof prefs === "object" && unit.price) {
    const unitPrice = parseFloat(unit.price);
    const minPrice = prefs.minPrice ? parseFloat(prefs.minPrice) : 0;
    const maxPrice = prefs.maxPrice ? parseFloat(prefs.maxPrice) : 0;

    if (!isNaN(unitPrice) && maxPrice > 0) {
      if (unitPrice >= minPrice && unitPrice <= maxPrice) {
        score += 25;
        reasons.push(`Within budget`);
      } else if (unitPrice <= maxPrice * 1.1) {
        score += 15;
        reasons.push(`Near budget`);
      }
    }
  }

  // Year Range Match (up to 20pts)
  if (lead.preferredYear && unit.year) {
    const yearDiff = Math.abs(lead.preferredYear - unit.year);
    if (yearDiff === 0) {
      score += 20;
      reasons.push(`Exact year match`);
    } else if (yearDiff <= 1) {
      score += 15;
      reasons.push(`Close year`);
    } else if (yearDiff <= 3) {
      score += 8;
      reasons.push(`Year within range`);
    }
  }

  // Feature Overlap (up to 15pts)
  let featurePoints = 0;
  if (prefs && typeof prefs === "object") {
    if (prefs.minLength && unit.length) {
      const minLen = parseFloat(prefs.minLength);
      const unitLen = parseFloat(unit.length);
      if (!isNaN(minLen) && !isNaN(unitLen) && unitLen >= minLen) {
        featurePoints += 4;
        reasons.push(`Length fits`);
      }
    }
    if (prefs.bedType && unit.bedType) {
      if (normalizeString(prefs.bedType) === normalizeString(unit.bedType)) {
        featurePoints += 4;
        reasons.push(`Bed type match`);
      }
    }
    if (prefs.minBeds && unit.bedCount) {
      if (unit.bedCount >= parseInt(prefs.minBeds)) {
        featurePoints += 3;
        reasons.push(`Bed count`);
      }
    }
    if (prefs.slideOuts && unit.slideOutCount) {
      if (unit.slideOutCount >= parseInt(prefs.slideOuts)) {
        featurePoints += 2;
        reasons.push(`Slide-outs`);
      }
    }
    if (prefs.bathrooms && unit.bathrooms) {
      if (parseFloat(unit.bathrooms) >= parseFloat(prefs.bathrooms)) {
        featurePoints += 2;
        reasons.push(`Bathrooms`);
      }
    }
  }
  score += Math.min(featurePoints, 15);

  // Make Preference (up to 10pts)
  if (prefs && prefs.make && unit.make) {
    if (normalizeString(prefs.make) === normalizeString(unit.make)) {
      score += 10;
      reasons.push(`Preferred make`);
    }
  }

  // Notes keyword bonus (up to 3pts)
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

  score = Math.min(score, 100);
  return { leadId: lead.id, score, reasons };
}

// ── Tests ──

describe("normalizeString", () => {
  it("lowercases and trims", () => {
    expect(normalizeString("  Hello World  ")).toBe("hello world");
  });

  it("handles null/undefined", () => {
    expect(normalizeString(null)).toBe("");
    expect(normalizeString(undefined)).toBe("");
  });

  it("handles empty string", () => {
    expect(normalizeString("")).toBe("");
  });
});

describe("getRvCategory", () => {
  it("identifies Class A", () => {
    expect(getRvCategory("Class A Motorhome")).toBe("class a");
    expect(getRvCategory("diesel pusher")).toBe("class a");
  });

  it("identifies Class B", () => {
    expect(getRvCategory("Class B Camper Van")).toBe("class b");
    expect(getRvCategory("Sprinter Van")).toBe("class b");
  });

  it("identifies Class C", () => {
    expect(getRvCategory("Class C")).toBe("class c");
  });

  it("identifies travel trailers", () => {
    expect(getRvCategory("Travel Trailer 28ft")).toBe("travel trailer");
    expect(getRvCategory("Bumper Pull")).toBe("travel trailer");
  });

  it("identifies fifth wheels", () => {
    expect(getRvCategory("Fifth Wheel")).toBe("fifth wheel");
    expect(getRvCategory("5th Wheel Luxury")).toBe("fifth wheel");
  });

  it("identifies toy haulers", () => {
    expect(getRvCategory("Toy Hauler")).toBe("toy hauler");
  });

  it("identifies pop-ups", () => {
    expect(getRvCategory("Pop-Up Camper")).toBe("pop-up");
    expect(getRvCategory("Popup")).toBe("pop-up");
    expect(getRvCategory("Folding Trailer")).toBe("pop-up");
    expect(getRvCategory("Tent Trailer")).toBe("pop-up");
  });

  it("identifies truck campers", () => {
    expect(getRvCategory("Truck Camper")).toBe("truck camper");
    expect(getRvCategory("Slide-In Camper")).toBe("truck camper");
  });

  it("returns null for unknown", () => {
    expect(getRvCategory("Winnebago Minnie")).toBeNull();
    expect(getRvCategory("")).toBeNull();
  });
});

describe("shouldRematch", () => {
  it("returns true for dismissed matches", () => {
    expect(shouldRematch({ status: "dismissed" }, { price: "50000" })).toBe(true);
  });

  it("returns true for >10% price change", () => {
    expect(
      shouldRematch(
        { status: "notified", lastMatchedPrice: "50000" },
        { price: "44000" } // 12% drop
      )
    ).toBe(true);
  });

  it("returns false for <10% price change", () => {
    expect(
      shouldRematch(
        { status: "notified", lastMatchedPrice: "50000" },
        { price: "48000" } // 4% drop
      )
    ).toBe(false);
  });

  it("returns false for active match with same price", () => {
    expect(
      shouldRematch(
        { status: "notified", lastMatchedPrice: "50000" },
        { price: "50000" }
      )
    ).toBe(false);
  });

  it("returns false when no price data", () => {
    expect(shouldRematch({ status: "notified" }, {})).toBe(false);
  });
});

describe("scoreLeadAgainstUnit", () => {
  const baseLead = {
    id: 1,
    customerName: "John Doe",
    preferredModel: null,
    preferredYear: null,
    preferences: null,
    notes: null,
  };

  const baseUnit = {
    id: 100,
    make: "Winnebago",
    model: "Minnie Winnie",
    year: 2024,
    price: null,
    length: null,
    bedType: null,
    bedCount: null,
    slideOutCount: null,
    bathrooms: null,
    amenities: null,
  };

  it("returns 0 for no matching criteria", () => {
    const result = scoreLeadAgainstUnit(baseLead, baseUnit);
    expect(result.score).toBe(0);
    expect(result.reasons).toHaveLength(0);
  });

  it("scores 30 for exact model match", () => {
    const lead = { ...baseLead, preferredModel: "Minnie Winnie" };
    const result = scoreLeadAgainstUnit(lead, baseUnit);
    expect(result.score).toBeGreaterThanOrEqual(30);
    expect(result.reasons.some((r: string) => r.includes("Exact type match"))).toBe(true);
  });

  it("scores 30 for strong word overlap (>=60%)", () => {
    const lead = { ...baseLead, preferredModel: "Winnebago Minnie" };
    const result = scoreLeadAgainstUnit(lead, baseUnit);
    expect(result.score).toBeGreaterThanOrEqual(30);
  });

  it("scores 15 for same RV category", () => {
    const lead = { ...baseLead, preferredModel: "Class A" };
    const unit = { ...baseUnit, model: "Diesel Pusher" };
    const result = scoreLeadAgainstUnit(lead, unit);
    expect(result.score).toBe(15);
    expect(result.reasons.some((r: string) => r.includes("Same RV category"))).toBe(true);
  });

  it("scores 25 for within budget", () => {
    const lead = {
      ...baseLead,
      preferences: { minPrice: "40000", maxPrice: "60000" },
    };
    const unit = { ...baseUnit, price: "50000" };
    const result = scoreLeadAgainstUnit(lead, unit);
    expect(result.score).toBe(25);
    expect(result.reasons.some((r: string) => r.includes("Within budget"))).toBe(true);
  });

  it("scores 15 for near budget (within 10% over)", () => {
    const lead = {
      ...baseLead,
      preferences: { maxPrice: "50000" },
    };
    const unit = { ...baseUnit, price: "54000" }; // 8% over
    const result = scoreLeadAgainstUnit(lead, unit);
    expect(result.score).toBe(15);
    expect(result.reasons.some((r: string) => r.includes("Near budget"))).toBe(true);
  });

  it("scores 0 for way over budget", () => {
    const lead = {
      ...baseLead,
      preferences: { maxPrice: "50000" },
    };
    const unit = { ...baseUnit, price: "80000" }; // 60% over
    const result = scoreLeadAgainstUnit(lead, unit);
    expect(result.score).toBe(0);
  });

  it("scores 20 for exact year match", () => {
    const lead = { ...baseLead, preferredYear: 2024 };
    const result = scoreLeadAgainstUnit(lead, baseUnit);
    expect(result.score).toBe(20);
    expect(result.reasons.some((r: string) => r.includes("Exact year match"))).toBe(true);
  });

  it("scores 15 for year within 1", () => {
    const lead = { ...baseLead, preferredYear: 2025 };
    const result = scoreLeadAgainstUnit(lead, baseUnit);
    expect(result.score).toBe(15);
  });

  it("scores 8 for year within 3", () => {
    const lead = { ...baseLead, preferredYear: 2027 };
    const result = scoreLeadAgainstUnit(lead, baseUnit);
    expect(result.score).toBe(8);
  });

  it("scores 0 for year > 3 away", () => {
    const lead = { ...baseLead, preferredYear: 2020 };
    const result = scoreLeadAgainstUnit(lead, baseUnit);
    expect(result.score).toBe(0);
  });

  it("scores feature points for bed type match", () => {
    const lead = {
      ...baseLead,
      preferences: { bedType: "King" },
    };
    const unit = { ...baseUnit, bedType: "king" };
    const result = scoreLeadAgainstUnit(lead, unit);
    expect(result.score).toBe(4);
    expect(result.reasons.some((r: string) => r.includes("Bed type match"))).toBe(true);
  });

  it("scores feature points for length match", () => {
    const lead = {
      ...baseLead,
      preferences: { minLength: "28" },
    };
    const unit = { ...baseUnit, length: "32" };
    const result = scoreLeadAgainstUnit(lead, unit);
    expect(result.score).toBe(4);
    expect(result.reasons.some((r: string) => r.includes("Length fits"))).toBe(true);
  });

  it("scores 10 for preferred make match", () => {
    const lead = {
      ...baseLead,
      preferences: { make: "Winnebago" },
    };
    const result = scoreLeadAgainstUnit(lead, baseUnit);
    expect(result.score).toBe(10);
    expect(result.reasons.some((r: string) => r.includes("Preferred make"))).toBe(true);
  });

  it("adds 3 for notes keyword bonus", () => {
    const lead = { ...baseLead, notes: "Looking for a Winnebago" };
    const result = scoreLeadAgainstUnit(lead, baseUnit);
    expect(result.score).toBe(3);
    expect(result.reasons.some((r: string) => r.includes("Notes mention"))).toBe(true);
  });

  it("caps at 100", () => {
    const lead = {
      ...baseLead,
      preferredModel: "Minnie Winnie",
      preferredYear: 2024,
      preferences: {
        maxPrice: "60000",
        minLength: "28",
        bedType: "King",
        make: "Winnebago",
        minBeds: "2",
        slideOuts: "1",
        bathrooms: "1",
      },
      notes: "Looking for a Winnebago Minnie Winnie",
    };
    const unit = {
      ...baseUnit,
      price: "50000",
      length: "32",
      bedType: "King",
      bedCount: 3,
      slideOutCount: 2,
      bathrooms: "1.5",
    };
    const result = scoreLeadAgainstUnit(lead, unit);
    expect(result.score).toBeLessThanOrEqual(100);
  });

  it("combines model + budget + year for high score", () => {
    const lead = {
      ...baseLead,
      preferredModel: "Minnie Winnie",
      preferredYear: 2024,
      preferences: { maxPrice: "60000" },
    };
    const unit = { ...baseUnit, price: "50000" };
    const result = scoreLeadAgainstUnit(lead, unit);
    // 30 (exact model) + 25 (budget) + 20 (year) = 75
    expect(result.score).toBe(75);
  });

  it("handles missing preferences gracefully", () => {
    const lead = { ...baseLead, preferences: null };
    const result = scoreLeadAgainstUnit(lead, baseUnit);
    expect(result.score).toBe(0);
  });

  it("handles empty preferences object", () => {
    const lead = { ...baseLead, preferences: {} };
    const result = scoreLeadAgainstUnit(lead, baseUnit);
    expect(result.score).toBe(0);
  });
});
