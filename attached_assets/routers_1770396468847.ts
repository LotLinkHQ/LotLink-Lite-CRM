import { z } from "zod";
import { COOKIE_NAME } from "../shared/const.js";
import { getSessionCookieOptions } from "./_core/cookies";
import { systemRouter } from "./_core/systemRouter";
import { publicProcedure, protectedProcedure, router } from "./_core/trpc";
import * as db from "./db";
import { invokeLLM } from "./_core/llm";

export const appRouter = router({
  system: systemRouter,
  auth: router({
    me: publicProcedure.query((opts) => opts.ctx.user),
    logout: publicProcedure.mutation(({ ctx }) => {
      const cookieOptions = getSessionCookieOptions(ctx.req);
      ctx.res.clearCookie(COOKIE_NAME, { ...cookieOptions, maxAge: -1 });
      return { success: true } as const;
    }),
  }),

  leads: router({
    list: protectedProcedure.query(({ ctx }) => db.getUserLeads(ctx.user.id)),
    getById: protectedProcedure
      .input(z.object({ id: z.number() }))
      .query(({ input }) => db.getLeadById(input.id)),
    create: protectedProcedure
      .input(
        z.object({
          customerName: z.string().min(1).max(255),
          customerEmail: z.string().email().optional(),
          customerPhone: z.string().optional(),
          preferenceType: z.enum(["model", "features"]),
          preferredModel: z.string().optional(),
          preferredYear: z.number().optional(),
          preferences: z.record(z.string(), z.any()).optional(),
          notes: z.string().optional(),
          storeLocation: z.string().optional(),
        })
      )
      .mutation(({ ctx, input }) =>
        db.createLead({
          dealershipId: ctx.user.id,
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
          customerEmail: z.string().optional(),
          customerPhone: z.string().optional(),
          preferences: z.record(z.string(), z.any()).optional(),
          notes: z.string().optional(),
          status: z.enum(["active", "matched", "sold", "inactive"]).optional(),
        })
      )
      .mutation(({ input }) => {
        const { id, ...data } = input;
        return db.updateLead(id, data);
      }),
    delete: protectedProcedure
      .input(z.object({ id: z.number() }))
      .mutation(({ input }) => db.deleteLead(input.id)),
    search: protectedProcedure
      .input(z.object({ query: z.string() }))
      .query(({ ctx, input }) => db.searchLeads(ctx.user.id, input.query)),
  }),

  inventory: router({
    list: protectedProcedure.query(({ ctx }) => db.getUserInventory(ctx.user.id)),
    getById: protectedProcedure
      .input(z.object({ id: z.number() }))
      .query(({ input }) => db.getInventoryById(input.id)),
    create: protectedProcedure
      .input(
        z.object({
          vin: z.string().optional(),
          unitId: z.string().min(1),
          year: z.number().min(1900).max(2100),
          make: z.string().min(1),
          model: z.string().min(1),
          length: z.number().optional(),
          weight: z.number().optional(),
          bedType: z.string().optional(),
          amenities: z.array(z.string()).optional(),
          bathrooms: z.number().optional(),
          price: z.number().optional(),
          storeLocation: z.string().min(1),
          arrivalDate: z.date(),
        })
      )
      .mutation(({ ctx, input }) =>
        db.createInventory({
          dealershipId: ctx.user.id,
          vin: input.vin,
          unitId: input.unitId,
          year: input.year,
          make: input.make,
          model: input.model,
          length: input.length ? input.length.toString() : undefined,
          weight: input.weight ? input.weight.toString() : undefined,
          bedType: input.bedType,
          amenities: input.amenities,
          bathrooms: input.bathrooms ? input.bathrooms.toString() : undefined,
          price: input.price ? input.price.toString() : undefined,
          storeLocation: input.storeLocation,
          arrivalDate: input.arrivalDate,
          status: "in_stock",
        })
      ),
    update: protectedProcedure
      .input(
        z.object({
          id: z.number(),
          status: z.enum(["in_stock", "matched", "sold", "pending"]).optional(),
        })
      )
      .mutation(({ input }) => {
        const { id, ...data } = input;
        return db.updateInventory(id, data);
      }),
    delete: protectedProcedure
      .input(z.object({ id: z.number() }))
      .mutation(({ input }) => db.deleteInventory(input.id)),
  }),

  matches: router({
    getByInventoryId: protectedProcedure
      .input(z.object({ inventoryId: z.number() }))
      .query(({ input }) => db.getMatchesByInventoryId(input.inventoryId)),
    updateStatus: protectedProcedure
      .input(
        z.object({
          id: z.number(),
          status: z.enum(["pending", "notified", "contacted", "sold", "dismissed"]),
        })
      )
      .mutation(({ input }) => db.updateMatch(input.id, { status: input.status })),
  }),
});

export type AppRouter = typeof appRouter;
