export interface LeadType {
  id: number;
  dealershipId: number;
  customerName: string;
  customerEmail?: string | null;
  customerPhone?: string | null;
  preferenceType: "model" | "features";
  preferredModel?: string | null;
  preferredYear?: number | null;
  preferences?: Record<string, any> | null;
  notes?: string | null;
  status: "active" | "matched" | "sold" | "inactive";
  storeLocation?: string | null;
  createdAt: Date;
  updatedAt: Date;
}

export interface InventoryUnit {
  id: number;
  dealershipId: number;
  vin?: string | null;
  unitId: string;
  year: number;
  make: string;
  model: string;
  length?: string | null;
  weight?: string | null;
  bedType?: string | null;
  bedCount?: number | null;
  amenities?: string[] | null;
  bathrooms?: string | null;
  slideOutCount?: number | null;
  fuelType?: string | null;
  horsepower?: number | null;
  price?: string | null;
  status: "in_stock" | "matched" | "sold" | "pending";
  storeLocation: string;
  arrivalDate: Date;
  createdAt: Date;
  updatedAt: Date;
}

export interface MatchType {
  id: number;
  leadId: number;
  inventoryId: number;
  matchScore: number;
  matchReason?: string | null;
  status: "pending" | "notified" | "contacted" | "sold" | "dismissed";
  notificationSentAt?: Date | null;
  notificationMethod?: "email" | "sms" | "in_app" | null;
  customerContactedAt?: Date | null;
  contactNotes?: string | null;
  outcome?: "sold" | "not_interested" | "pending" | "other" | null;
  createdAt: Date;
  updatedAt: Date;
}
