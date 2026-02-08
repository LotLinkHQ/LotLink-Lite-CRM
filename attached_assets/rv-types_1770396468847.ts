/**
 * Shared types for RV Sales CRM
 */

export interface Lead {
  id: number;
  userId: number;
  customerName: string;
  customerEmail?: string;
  customerPhone?: string;
  preferenceType: "model" | "features";
  preferredModel?: string;
  preferredYear?: number;
  preferences?: Record<string, any>;
  notes?: string;
  status: "active" | "matched" | "sold" | "inactive";
  storeLocation?: string;
  createdAt: Date;
  updatedAt: Date;
}

export interface InventoryUnit {
  id: number;
  userId: number;
  vin?: string;
  unitId: string;
  year: number;
  make: string;
  model: string;
  length?: number;
  weight?: number;
  bedType?: string;
  bedCount?: number;
  amenities?: string[];
  bathrooms?: number;
  slideOutCount?: number;
  fuelType?: string;
  horsepower?: number;
  price?: number;
  status: "in_stock" | "matched" | "sold" | "pending";
  storeLocation: string;
  arrivalDate: Date;
  createdAt: Date;
  updatedAt: Date;
}

export interface Match {
  id: number;
  leadId: number;
  inventoryId: number;
  matchScore: number;
  matchReason?: string;
  status: "pending" | "notified" | "contacted" | "sold" | "dismissed";
  notificationSentAt?: Date;
  notificationMethod?: "email" | "sms" | "in_app";
  customerContactedAt?: Date;
  contactNotes?: string;
  outcome?: "sold" | "not_interested" | "pending" | "other";
  createdAt: Date;
  updatedAt: Date;
}

export interface UserPreferences {
  id: number;
  userId: number;
  primaryStore?: string;
  emailNotifications: boolean;
  smsNotifications: boolean;
  inAppNotifications: boolean;
  matchingSensitivity: "strict" | "moderate" | "loose";
  darkMode: boolean;
  createdAt: Date;
  updatedAt: Date;
}

// Form input types
export interface CreateLeadInput {
  customerName: string;
  customerEmail?: string;
  customerPhone?: string;
  preferenceType: "model" | "features";
  preferredModel?: string;
  preferredYear?: number;
  preferences?: Record<string, any>;
  notes?: string;
  storeLocation?: string;
}

export interface CreateInventoryInput {
  vin?: string;
  unitId: string;
  year: number;
  make: string;
  model: string;
  length?: number;
  weight?: number;
  bedType?: string;
  bedCount?: number;
  amenities?: string[];
  bathrooms?: number;
  slideOutCount?: number;
  fuelType?: string;
  horsepower?: number;
  price?: number;
  storeLocation: string;
  arrivalDate: Date;
}

// Feature preferences type
export interface FeaturePreferences {
  bedType?: string;
  amenities?: string[];
  lengthMin?: number;
  lengthMax?: number;
  bathrooms?: number;
  priceMax?: number;
  priceMin?: number;
  fuelType?: string;
  slideOutMin?: number;
}
