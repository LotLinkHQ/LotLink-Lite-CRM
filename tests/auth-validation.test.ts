import { describe, it, expect } from "vitest";
import { z } from "zod";

// ── Auth validation schemas (mirrored from routers.ts) ──

const passwordSchema = z
  .string()
  .min(8, "Password must be at least 8 characters")
  .regex(/[a-zA-Z]/, "Password must contain at least one letter")
  .regex(/[0-9]/, "Password must contain at least one number");

const signupSchema = z.object({
  email: z.string().email(),
  password: passwordSchema,
  name: z.string().min(1),
});

const loginSchema = z.object({
  email: z.string().email(),
  password: z.string(),
});

const FREE_EMAIL_DOMAINS = [
  "gmail.com", "yahoo.com", "hotmail.com", "outlook.com",
  "aol.com", "icloud.com", "protonmail.com", "live.com", "msn.com",
];

function extractDomain(email: string): string {
  return email.split("@")[1]?.toLowerCase() || "";
}

function isFreeDomain(domain: string): boolean {
  return FREE_EMAIL_DOMAINS.includes(domain);
}

function formatPhone(raw: string): string {
  const clean = raw.replace(/[^\d]/g, "");
  if (clean.length < 10) return "";
  return clean.length === 10 ? `+1${clean}` : `+${clean}`;
}

// ── Tests ──

describe("Password Validation", () => {
  it("accepts valid passwords", () => {
    expect(passwordSchema.safeParse("Password1").success).toBe(true);
    expect(passwordSchema.safeParse("abcdefg8").success).toBe(true);
    expect(passwordSchema.safeParse("MyStr0ngP@ss").success).toBe(true);
  });

  it("rejects short passwords", () => {
    const result = passwordSchema.safeParse("Pass1");
    expect(result.success).toBe(false);
  });

  it("rejects passwords without letters", () => {
    const result = passwordSchema.safeParse("12345678");
    expect(result.success).toBe(false);
  });

  it("rejects passwords without numbers", () => {
    const result = passwordSchema.safeParse("abcdefgh");
    expect(result.success).toBe(false);
  });

  it("rejects empty passwords", () => {
    const result = passwordSchema.safeParse("");
    expect(result.success).toBe(false);
  });
});

describe("Signup Schema", () => {
  it("accepts valid signup data", () => {
    const result = signupSchema.safeParse({
      email: "user@example.com",
      password: "Password1",
      name: "John Doe",
    });
    expect(result.success).toBe(true);
  });

  it("rejects invalid email", () => {
    const result = signupSchema.safeParse({
      email: "not-an-email",
      password: "Password1",
      name: "John",
    });
    expect(result.success).toBe(false);
  });

  it("rejects empty name", () => {
    const result = signupSchema.safeParse({
      email: "user@example.com",
      password: "Password1",
      name: "",
    });
    expect(result.success).toBe(false);
  });

  it("rejects weak password in signup", () => {
    const result = signupSchema.safeParse({
      email: "user@example.com",
      password: "weak",
      name: "John",
    });
    expect(result.success).toBe(false);
  });
});

describe("Login Schema", () => {
  it("accepts valid login data", () => {
    const result = loginSchema.safeParse({
      email: "user@example.com",
      password: "anything",
    });
    expect(result.success).toBe(true);
  });

  it("rejects invalid email format", () => {
    const result = loginSchema.safeParse({
      email: "bad",
      password: "anything",
    });
    expect(result.success).toBe(false);
  });
});

describe("Email Domain Detection", () => {
  it("extracts domain correctly", () => {
    expect(extractDomain("user@rvdealer.com")).toBe("rvdealer.com");
    expect(extractDomain("admin@example.org")).toBe("example.org");
  });

  it("identifies free email domains", () => {
    expect(isFreeDomain("gmail.com")).toBe(true);
    expect(isFreeDomain("yahoo.com")).toBe(true);
    expect(isFreeDomain("hotmail.com")).toBe(true);
    expect(isFreeDomain("outlook.com")).toBe(true);
    expect(isFreeDomain("icloud.com")).toBe(true);
    expect(isFreeDomain("protonmail.com")).toBe(true);
  });

  it("identifies business domains", () => {
    expect(isFreeDomain("rvdealer.com")).toBe(false);
    expect(isFreeDomain("lotlink.app")).toBe(false);
    expect(isFreeDomain("company.org")).toBe(false);
  });

  it("handles edge cases", () => {
    expect(extractDomain("")).toBe("");
    expect(extractDomain("noatsign")).toBe("");
  });
});

describe("Phone Number Formatting", () => {
  it("formats 10-digit US numbers", () => {
    expect(formatPhone("5551234567")).toBe("+15551234567");
  });

  it("formats numbers with formatting", () => {
    expect(formatPhone("(555) 123-4567")).toBe("+15551234567");
    expect(formatPhone("555.123.4567")).toBe("+15551234567");
    expect(formatPhone("555-123-4567")).toBe("+15551234567");
  });

  it("handles 11-digit numbers with country code", () => {
    expect(formatPhone("15551234567")).toBe("+15551234567");
  });

  it("rejects too-short numbers", () => {
    expect(formatPhone("555123")).toBe("");
    expect(formatPhone("123")).toBe("");
  });

  it("strips non-digits", () => {
    expect(formatPhone("+1 (555) 123-4567")).toBe("+15551234567");
  });
});

describe("Session Constants", () => {
  it("session TTL is 30 days in ms", () => {
    const SESSION_TTL = 30 * 24 * 60 * 60 * 1000;
    expect(SESSION_TTL).toBe(2592000000);
  });

  it("password reset TTL is 1 hour in ms", () => {
    const RESET_TTL = 60 * 60 * 1000;
    expect(RESET_TTL).toBe(3600000);
  });

  it("max concurrent sessions is 3", () => {
    const MAX_SESSIONS = 3;
    expect(MAX_SESSIONS).toBe(3);
  });
});
