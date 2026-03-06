import "dotenv/config";
import express from "express";
import path from "path";
import cors from "cors";
import cookieParser from "cookie-parser";
import rateLimit from "express-rate-limit";
import * as trpcExpress from "@trpc/server/adapters/express";
import { sql } from "drizzle-orm";
import { appRouter } from "./routers";
import { createContext } from "./trpc";
import { seedDatabase } from "./seed";
import { startDailyDigest } from "./daily-digest";
import { startInventorySyncScheduler } from "./inventory-scraper";
import { createTablesIfNeeded } from "./create-tables";
import * as db from "./db";
import { dealerships } from "../shared/schema";
import { getDb } from "./db";

const app = express();
const PORT = process.env.PORT || 5000;

// Allowed origins for CORS (add your app domains)
const allowedOrigins = [
  "http://localhost:5000",
  "http://localhost:8081",
  "https://rv-sales-crm-api-production-0183.up.railway.app",
  "https://lotlink-lite-crm-production.up.railway.app",
  "https://lotlink.app",
  "https://www.lotlink.app",
  "https://lotlink.org",
  "https://www.lotlink.org",
  process.env.RAILWAY_PUBLIC_DOMAIN ? `https://${process.env.RAILWAY_PUBLIC_DOMAIN}` : "",
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
    // Allow requests with no origin (mobile apps, curl, etc.)
    if (!origin) return callback(null, true);
    if (allowedOrigins.includes(origin)) return callback(null, true);
    // Allow Railway's own domain
    if (origin && origin.endsWith(".up.railway.app")) return callback(null, true);
    callback(new Error("Not allowed by CORS"));
  },
  credentials: true,
}));

app.use(cookieParser());
app.use(express.json());

// Health check endpoint with real status
app.get("/api/health", async (_req, res) => {
  const checks: Record<string, string> = {};
  let healthy = true;

  // Check database connectivity
  try {
    const database = getDb();
    if (database) {
      await database.execute(sql`SELECT 1`);
      checks.database = "ok";
    } else {
      checks.database = "unavailable";
      healthy = false;
    }
  } catch {
    checks.database = "error";
    healthy = false;
  }

  res.status(healthy ? 200 : 503).json({
    status: healthy ? "ok" : "degraded",
    checks,
    timestamp: new Date().toISOString(),
  });
});

// Apply strict rate limiting only to auth endpoints
app.use("/api/trpc/auth.login", authLimiter);
app.use("/api/trpc/auth.signup", authLimiter);
app.use("/api/trpc/auth.logout", authLimiter);
app.use("/api/trpc/auth.requestPasswordReset", authLimiter);
app.use("/api/trpc/auth.resetPassword", authLimiter);

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
      status: "new",
    });

    console.log(`[Opt-In] New lead created: ${customerName} (${formattedPhone}), SMS consent recorded at ${serverTimestamp} from ${preferences.consentIp}`);

    res.json({ success: true, message: "You're signed up for notifications!" });
  } catch (error: any) {
    console.error("[Opt-In] Error:", error.message);
    res.status(500).json({ success: false, error: "Something went wrong. Please try again." });
  }
});

// Serve Expo web build (static files)
const distPath = path.join(__dirname, "../dist");
app.use(express.static(distPath));

// SPA fallback — serve index.html for all non-API routes
app.get("*", (req, res) => {
  res.sendFile(path.join(distPath, "index.html"));
});

async function boot() {
  // Create or fix database tables BEFORE accepting requests
  try {
    await createTablesIfNeeded();
  } catch (error: any) {
    console.error("[DB] Table creation error:", error.message);
    process.exit(1);
  }

  // Seed default data after tables are ready
  await seedDatabase();

  const server = app.listen(PORT, () => {
    console.log(`[Server] Production server running on port ${PORT}`);

    // Start daily digest email scheduler
    startDailyDigest();

    // Start inventory sync scheduler (scrapes dealership websites every 24h)
    startInventorySyncScheduler();
  });
}

boot();

export default app;
