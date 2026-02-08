import express from "express";
import path from "path";
import cors from "cors";
import cookieParser from "cookie-parser";
import * as trpcExpress from "@trpc/server/adapters/express";
import { createProxyMiddleware } from "http-proxy-middleware";
import { appRouter } from "./routers";
import { createContext } from "./trpc";
import { seedDatabase } from "./seed";
import * as db from "./db";
import { dealerships } from "../shared/schema";
import { getDb } from "./db";

const app = express();
const PORT = 5000;
const EXPO_PORT = 8081;

app.use(cors({
  origin: true,
  credentials: true,
}));
app.use(cookieParser());
app.use(express.json());

app.use(
  "/api/trpc",
  trpcExpress.createExpressMiddleware({
    router: appRouter,
    createContext: ({ req, res }) => createContext(req, res),
  })
);

app.get("/api/health", (_req, res) => {
  res.json({ status: "ok", timestamp: new Date().toISOString() });
});

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

const proxyMiddleware = createProxyMiddleware({
  target: `http://localhost:${EXPO_PORT}`,
  changeOrigin: true,
  ws: true,
} as any);

app.use("/", proxyMiddleware);

const server = app.listen(PORT, "0.0.0.0", async () => {
  console.log(`[Server] Running on http://0.0.0.0:${PORT}`);
  console.log(`[Server] Proxying frontend from Expo on port ${EXPO_PORT}`);
  await seedDatabase();
});

server.on("upgrade", (req, socket, head) => {
  (proxyMiddleware as any).upgrade(req, socket, head);
});
