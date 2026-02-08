import { z } from "zod";
import { publicProcedure, protectedProcedure, router } from "./trpc";
import * as db from "./db";
import bcrypt from "bcryptjs";
import crypto from "crypto";
import { runMatchingForNewInventory, runMatchingForAllInventory, retryPendingNotifications } from "./matching-engine";

export const appRouter = router({
  auth: router({
    me: publicProcedure.query(({ ctx }) => ctx.dealership),
    login: publicProcedure
      .input(
        z.object({
          username: z.string().min(1),
          password: z.string().min(1),
        })
      )
      .mutation(async ({ ctx, input }) => {
        const dealership = await db.getDealershipByUsername(input.username);
        if (!dealership) {
          return { success: false as const, error: "Invalid credentials" };
        }

        const valid = await bcrypt.compare(input.password, dealership.passwordHash);
        if (!valid) {
          return { success: false as const, error: "Invalid credentials" };
        }

        const sessionToken = crypto.randomBytes(32).toString("hex");
        const expiresAt = new Date(Date.now() + 30 * 24 * 60 * 60 * 1000);

        await db.createDealershipSession({
          dealershipId: dealership.id,
          sessionToken,
          expiresAt,
        });

        ctx.res.cookie("dealership_session", sessionToken, {
          httpOnly: true,
          secure: process.env.NODE_ENV === "production", // HTTPS only in production
          sameSite: "lax",
          maxAge: 30 * 24 * 60 * 60 * 1000,
          path: "/",
        });

        return {
          success: true as const,
          dealership: {
            id: dealership.id,
            name: dealership.name,
            username: dealership.username,
          },
        };
      }),
    logout: publicProcedure.mutation(async ({ ctx }) => {
      const sessionToken = ctx.req.cookies?.dealership_session;
      if (sessionToken) {
        await db.deleteDealershipSession(sessionToken);
      }
      ctx.res.clearCookie("dealership_session", { path: "/" });
      return { success: true };
    }),
  }),

  leads: router({
    list: protectedProcedure.query(({ ctx }) =>
      db.getUserLeads(ctx.dealership.id)
    ),
    getById: protectedProcedure
      .input(z.object({ id: z.number() }))
      .query(async ({ ctx, input }) => {
        const lead = await db.getLeadById(input.id);
        if (lead && lead.dealershipId !== ctx.dealership.id) return null;
        return lead;
      }),
    create: protectedProcedure
      .input(
        z.object({
          customerName: z.string().min(1).max(255),
          customerEmail: z.string().email().optional().nullable(),
          customerPhone: z.string().optional().nullable(),
          preferenceType: z.enum(["model", "features"]),
          preferredModel: z.string().optional().nullable(),
          preferredYear: z.number().optional().nullable(),
          preferences: z.record(z.string(), z.any()).optional().nullable(),
          notes: z.string().optional().nullable(),
          storeLocation: z.string().optional().nullable(),
        })
      )
      .mutation(({ ctx, input }) =>
        db.createLead({
          dealershipId: ctx.dealership.id,
          customerName: input.customerName,
          customerEmail: input.customerEmail,
          customerPhone: input.customerPhone,
          preferenceType: input.preferenceType,
          preferredModel: input.preferredModel,
          preferredYear: input.preferredYear,
          preferences: input.preferences,
          notes: input.notes,
          storeLocation: input.storeLocation,
          status: "active",
        })
      ),
    update: protectedProcedure
      .input(
        z.object({
          id: z.number(),
          customerName: z.string().optional(),
          customerEmail: z.string().optional().nullable(),
          customerPhone: z.string().optional().nullable(),
          preferences: z.record(z.string(), z.any()).optional().nullable(),
          notes: z.string().optional().nullable(),
          status: z.enum(["active", "matched", "sold", "inactive"]).optional(),
        })
      )
      .mutation(async ({ ctx, input }) => {
        const lead = await db.getLeadById(input.id);
        if (!lead || lead.dealershipId !== ctx.dealership.id) return null;
        const { id, ...data } = input;
        return db.updateLead(id, data);
      }),
    delete: protectedProcedure
      .input(z.object({ id: z.number() }))
      .mutation(async ({ ctx, input }) => {
        const lead = await db.getLeadById(input.id);
        if (!lead || lead.dealershipId !== ctx.dealership.id) return null;
        return db.deleteLead(input.id);
      }),
    search: protectedProcedure
      .input(z.object({ query: z.string() }))
      .query(({ ctx, input }) =>
        db.searchLeads(ctx.dealership.id, input.query)
      ),
  }),

  inventory: router({
    list: protectedProcedure.query(({ ctx }) =>
      db.getUserInventory(ctx.dealership.id)
    ),
    getById: protectedProcedure
      .input(z.object({ id: z.number() }))
      .query(async ({ ctx, input }) => {
        const item = await db.getInventoryById(input.id);
        if (item && item.dealershipId !== ctx.dealership.id) return null;
        return item;
      }),
    create: protectedProcedure
      .input(
        z.object({
          vin: z.string().optional().nullable(),
          unitId: z.string().min(1),
          year: z.number().min(1900).max(2100),
          make: z.string().min(1),
          model: z.string().min(1),
          length: z.string().optional().nullable(),
          weight: z.string().optional().nullable(),
          bedType: z.string().optional().nullable(),
          amenities: z.array(z.string()).optional().nullable(),
          bathrooms: z.string().optional().nullable(),
          price: z.string().optional().nullable(),
          storeLocation: z.string().min(1),
          arrivalDate: z.string(),
        })
      )
      .mutation(async ({ ctx, input }) => {
        const newUnit = await db.createInventory({
          dealershipId: ctx.dealership.id,
          vin: input.vin,
          unitId: input.unitId,
          year: input.year,
          make: input.make,
          model: input.model,
          length: input.length,
          weight: input.weight,
          bedType: input.bedType,
          amenities: input.amenities,
          bathrooms: input.bathrooms,
          price: input.price,
          storeLocation: input.storeLocation,
          arrivalDate: new Date(input.arrivalDate),
          status: "in_stock",
        });

        runMatchingForNewInventory(newUnit.id, ctx.dealership.id).catch((err) =>
          console.error("[Matching] Background matching failed:", err)
        );

        return newUnit;
      }),
    update: protectedProcedure
      .input(
        z.object({
          id: z.number(),
          status: z.enum(["in_stock", "matched", "sold", "pending"]).optional(),
        })
      )
      .mutation(async ({ ctx, input }) => {
        const item = await db.getInventoryById(input.id);
        if (!item || item.dealershipId !== ctx.dealership.id) return null;
        const { id, ...data } = input;
        return db.updateInventory(id, data);
      }),
    delete: protectedProcedure
      .input(z.object({ id: z.number() }))
      .mutation(async ({ ctx, input }) => {
        const item = await db.getInventoryById(input.id);
        if (!item || item.dealershipId !== ctx.dealership.id) return null;
        return db.deleteInventory(input.id);
      }),
  }),

  matches: router({
    list: protectedProcedure.query(({ ctx }) =>
      db.getAllDealershipMatches(ctx.dealership.id)
    ),
    getByInventoryId: protectedProcedure
      .input(z.object({ inventoryId: z.number() }))
      .query(async ({ ctx, input }) => {
        const item = await db.getInventoryById(input.inventoryId);
        if (!item || item.dealershipId !== ctx.dealership.id) return [];
        return db.getMatchesByInventoryId(input.inventoryId);
      }),
    getByLeadId: protectedProcedure
      .input(z.object({ leadId: z.number() }))
      .query(async ({ ctx, input }) => {
        const lead = await db.getLeadById(input.leadId);
        if (!lead || lead.dealershipId !== ctx.dealership.id) return [];
        return db.getMatchesByLeadId(input.leadId);
      }),
    updateStatus: protectedProcedure
      .input(
        z.object({
          id: z.number(),
          status: z.enum(["pending", "notified", "contacted", "sold", "dismissed"]),
          contactNotes: z.string().optional().nullable(),
        })
      )
      .mutation(async ({ ctx, input }) => {
        const allMatches = await db.getAllDealershipMatches(ctx.dealership.id);
        const match = allMatches.find((m: any) => m.match?.id === input.id || m.id === input.id);
        if (!match) return null;
        const updateData: any = { status: input.status };
        if (input.status === "contacted") {
          updateData.customerContactedAt = new Date();
        }
        if (input.contactNotes) {
          updateData.contactNotes = input.contactNotes;
        }
        return db.updateMatch(input.id, updateData);
      }),
    runScan: protectedProcedure
      .mutation(async ({ ctx }) => {
        const scanResult = await runMatchingForAllInventory(ctx.dealership.id);
        const retryResult = await retryPendingNotifications(ctx.dealership.id);
        return {
          ...scanResult,
          totalNotifications: scanResult.totalNotifications + retryResult.sent,
          retriedNotifications: retryResult.sent,
        };
      }),
    retryNotifications: protectedProcedure
      .mutation(async ({ ctx }) => {
        return retryPendingNotifications(ctx.dealership.id);
      }),
    runScanForUnit: protectedProcedure
      .input(z.object({ inventoryId: z.number() }))
      .mutation(async ({ ctx, input }) => {
        const item = await db.getInventoryById(input.inventoryId);
        if (!item || item.dealershipId !== ctx.dealership.id) return null;
        return runMatchingForNewInventory(input.inventoryId, ctx.dealership.id);
      }),
  }),

  preferences: router({
    get: protectedProcedure.query(({ ctx }) =>
      db.getDealershipPreferences(ctx.dealership.id)
    ),
    update: protectedProcedure
      .input(
        z.object({
          emailNotifications: z.boolean().optional(),
          smsNotifications: z.boolean().optional(),
          inAppNotifications: z.boolean().optional(),
          matchingSensitivity: z.enum(["strict", "moderate", "loose"]).optional(),
          darkMode: z.boolean().optional(),
        })
      )
      .mutation(async ({ ctx, input }) => {
        const existing = await db.getDealershipPreferences(ctx.dealership.id);
        if (existing) {
          await db.updateDealershipPreferences(ctx.dealership.id, input);
        } else {
          await db.createDealershipPreferences({
            dealershipId: ctx.dealership.id,
            emailNotifications: input.emailNotifications ?? true,
            smsNotifications: input.smsNotifications ?? false,
            inAppNotifications: input.inAppNotifications ?? true,
            matchingSensitivity: input.matchingSensitivity ?? "moderate",
            darkMode: input.darkMode ?? false,
          });
        }
        return db.getDealershipPreferences(ctx.dealership.id);
      }),
  }),
});

export type AppRouter = typeof appRouter;
