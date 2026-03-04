import "dotenv/config";
import express from "express";
import cors from "cors";
import cookieParser from "cookie-parser";
import * as trpcExpress from "@trpc/server/adapters/express";
import { appRouter } from "../server/routers";
import { createContext } from "../server/trpc";
import * as db from "../server/db";
import { dealerships } from "../shared/schema";
import { getDb } from "../server/db";

const app = express();

const allowedOrigins = [
  "http://localhost:5000",
  "http://localhost:8081",
  "https://lotlink.app",
  "https://www.lotlink.app",
  "https://lotlink.org",
  "https://www.lotlink.org",
  process.env.FRONTEND_URL,
].filter(Boolean) as string[];

app.use(cors({
  origin: (origin, callback) => {
    // Allow requests with no origin (mobile apps, curl, etc.)
    if (!origin) return callback(null, true);
    if (allowedOrigins.includes(origin)) return callback(null, true);
    callback(new Error("Not allowed by CORS"));
  },
  credentials: true,
}));
app.use(cookieParser());

// tRPC handles its own body parsing — mount BEFORE express.json()
app.use(
  "/api/trpc",
  trpcExpress.createExpressMiddleware({
    router: appRouter,
    createContext: ({ req, res }) => createContext(req, res),
  })
);

app.use(express.json());

app.get("/api/health", (_req, res) => {
  res.json({ status: "ok", timestamp: new Date().toISOString() });
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

    await db.createLead({
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

    console.log(`[Opt-In] New lead created: ${customerName} (${formattedPhone})`);
    res.json({ success: true, message: "You're signed up for notifications!" });
  } catch (error: any) {
    console.error("[Opt-In] Error:", error.message);
    res.status(500).json({ success: false, error: "Something went wrong. Please try again." });
  }
});

export default app;
