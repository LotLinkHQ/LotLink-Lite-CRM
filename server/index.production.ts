import express from "express";
import path from "path";
import cors from "cors";
import cookieParser from "cookie-parser";
import rateLimit from "express-rate-limit";
import * as trpcExpress from "@trpc/server/adapters/express";
import { migrate } from "drizzle-orm/postgres-js/migrator";
import { appRouter } from "./routers";
import { createContext } from "./trpc";
import { seedDatabase } from "./seed";
import { startDailyDigest } from "./daily-digest";
import * as db from "./db";
import { dealerships } from "../shared/schema";
import { getDb } from "./db";

const app = express();
const PORT = process.env.PORT || 5000;

// Allowed origins for CORS (add your app domains)
const allowedOrigins = [
  "http://localhost:5000",
  "http://localhost:8081",
  "https://lotlink.app",
  "https://www.lotlink.app",
  process.env.FRONTEND_URL,
].filter(Boolean) as string[];

// Rate limiting for authentication endpoints only (strict)
const authLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 10, // 10 login attempts per 15 min per IP
  message: "Too many login attempts, please try again later.",
  standardHeaders: true,
  legacyHeaders: false,
});

// General API rate limiting (generous for normal app usage)
const apiLimiter = rateLimit({
  windowMs: 1 * 60 * 1000, // 1 minute
  max: 200, // 200 requests per minute per IP
  message: "Too many requests, please slow down.",
  standardHeaders: true,
  legacyHeaders: false,
});

app.use(cors({
  origin: (origin, callback) => {
    // Allow requests with no origin (mobile apps, Postman, etc.)
    if (!origin) return callback(null, true);
    if (allowedOrigins.includes(origin)) {
      return callback(null, true);
    }
    // For mobile apps, allow all origins (they don't send origin header typically)
    return callback(null, true);
  },
  credentials: true,
}));

app.use(cookieParser());
app.use(express.json());

// Health check endpoint
app.get("/api/health", (_req, res) => {
  res.json({ status: "ok", timestamp: new Date().toISOString() });
});

// Apply strict rate limiting only to auth endpoints
app.use("/api/trpc/auth.login", authLimiter);
app.use("/api/trpc/auth.logout", authLimiter);

// Apply general rate limiting to all tRPC endpoints
app.use("/api/trpc", apiLimiter);

app.use(
  "/api/trpc",
  trpcExpress.createExpressMiddleware({
    router: appRouter,
    createContext: ({ req, res }) => createContext(req, res),
  })
);

// Opt-in page (static HTML)
app.get("/opt-in", (_req, res) => {
  res.setHeader("Cache-Control", "no-cache, no-store, must-revalidate");
  res.sendFile(path.join(__dirname, "../public/opt-in.html"));
});

app.post("/api/opt-in", async (req, res) => {
  try {
    const {
      customerName,
      customerPhone,
      customerEmail,
      preferredMake,
      preferredModel,
      preferredYear,
      maxBudget,
      bedType,
      minLength,
      notes,
      smsConsent,
    } = req.body;

    if (!customerName || !customerPhone || !smsConsent) {
      return res.status(400).json({ success: false, error: "Name, phone, and SMS consent are required." });
    }

    const cleanPhone = customerPhone.replace(/[^\d]/g, "");
    if (cleanPhone.length < 10) {
      return res.status(400).json({ success: false, error: "Please enter a valid phone number." });
    }

    const formattedPhone = cleanPhone.length === 10 ? `+1${cleanPhone}` : `+${cleanPhone}`;

    const serverTimestamp = new Date().toISOString();
    const clientIp = req.headers["x-forwarded-for"] || req.socket.remoteAddress || "unknown";
    const userAgent = req.headers["user-agent"] || "unknown";

    const preferences: Record<string, any> = {};
    if (maxBudget) preferences.maxPrice = maxBudget;
    if (preferredMake) preferences.make = preferredMake;
    if (bedType) preferences.bedType = bedType;
    if (minLength) preferences.minLength = minLength;
    preferences.smsConsent = true;
    preferences.consentTimestamp = serverTimestamp;
    preferences.consentSource = "public_opt_in";
    preferences.consentIp = typeof clientIp === "string" ? clientIp : (clientIp as string[])[0];
    preferences.consentUserAgent = userAgent;
    preferences.consentVersion = "1.0";

    const database = getDb();
    const allDealerships = await database.select().from(dealerships).limit(1);
    const dealership = allDealerships[0];
    if (!dealership) {
      return res.status(500).json({ success: false, error: "No dealership configured." });
    }

    const lead = await db.createLead({
      dealershipId: dealership.id,
      customerName,
      customerEmail: customerEmail || null,
      customerPhone: formattedPhone,
      preferenceType: preferredModel ? "model" : "features",
      preferredModel: preferredModel || preferredMake || null,
      preferredYear: preferredYear || null,
      preferences,
      notes: notes || null,
      status: "active",
    });

    console.log(`[Opt-In] New lead created: ${customerName} (${formattedPhone}), SMS consent recorded at ${serverTimestamp} from ${preferences.consentIp}`);

    res.json({ success: true, message: "You're signed up for notifications!" });
  } catch (error: any) {
    console.error("[Opt-In] Error:", error.message);
    res.status(500).json({ success: false, error: "Something went wrong. Please try again." });
  }
});

const server = app.listen(PORT, async () => {
  console.log(`[Server] Production server running on port ${PORT}`);

  // Run database migrations to create tables if they don't exist
  try {
    console.log("[DB] Running migrations...");
    const migrationsPath = path.join(__dirname, "../drizzle");
    const fs = await import("fs");
    if (fs.existsSync(migrationsPath)) {
      const database = getDb();
      await migrate(database, { migrationsFolder: migrationsPath });
      console.log("[DB] Migrations complete");
    } else {
      console.warn("[DB] Migrations folder not found at:", migrationsPath);
      console.warn("[DB] Skipping migrations — tables should already exist");
    }
  } catch (error: any) {
    // Don't crash if tables already exist
    if (error.message?.includes("already exists")) {
      console.log("[DB] Tables already exist, skipping migrations");
    } else {
      console.error("[DB] Migration error:", error.message);
      process.exit(1);
    }
  }

  // Seed default data after tables are ready
  await seedDatabase();

  // Start daily digest email scheduler
  startDailyDigest();
});

export default app;
