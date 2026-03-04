import { initTRPC, TRPCError } from "@trpc/server";
import type { Request, Response } from "express";
import superjson from "superjson";
import * as db from "./db";

export interface UserContext {
  id: number;
  name: string;
  email: string;
  role: "salesperson" | "manager" | "admin" | "owner";
  dealershipId: number | null;
}

export interface DealershipContext {
  id: number;
  name: string;
}

export interface Context {
  req: Request;
  res: Response;
  user: UserContext | null;
  dealership: DealershipContext | null;
}

export async function createContext(req: Request, res: Response): Promise<Context> {
  // In demo mode (no database), auto-login as demo user
  if (db.isUsingJsonFallback()) {
    return {
      req,
      res,
      user: { id: 1, name: "Demo User", email: "demo@demo.com", role: "admin", dealershipId: 1 },
      dealership: { id: 1, name: "Poulsbo RV" },
    };
  }

  const sessionToken = req.cookies?.session;
  let user: UserContext | null = null;
  let dealership: DealershipContext | null = null;

  if (sessionToken) {
    const session = await db.getUserSessionByToken(sessionToken);
    if (session && new Date(session.expiresAt) > new Date()) {
      const u = await db.getUserById(session.userId);
      if (u && u.isActive) {
        user = {
          id: u.id,
          name: u.name,
          email: u.email,
          role: u.role,
          dealershipId: u.dealershipId,
        };
        if (u.dealershipId) {
          const d = await db.getDealershipById(u.dealershipId);
          if (d) {
            dealership = { id: d.id, name: d.name };
          }
        }
        // Extend session on activity (sliding window)
        db.extendSession(sessionToken).catch(() => {});
      }
    }
  }

  // Clear legacy dealership_session cookie if present
  if (req.cookies?.dealership_session) {
    res.clearCookie("dealership_session", { path: "/" });
  }

  return { req, res, user, dealership };
}

const t = initTRPC.context<Context>().create({
  transformer: superjson,
});

export const router = t.router;
export const publicProcedure = t.procedure;

// Requires authenticated user linked to a dealership
export const protectedProcedure = t.procedure.use(async ({ ctx, next }) => {
  if (!ctx.user) {
    throw new TRPCError({ code: "UNAUTHORIZED", message: "Not authenticated" });
  }
  if (!ctx.user.dealershipId || !ctx.dealership) {
    throw new TRPCError({ code: "FORBIDDEN", message: "Not linked to a dealership" });
  }
  return next({
    ctx: {
      ...ctx,
      user: ctx.user as UserContext & { dealershipId: number },
      dealership: ctx.dealership as DealershipContext,
    },
  });
});

// Requires manager, admin, or owner role
export const managerProcedure = protectedProcedure.use(async ({ ctx, next }) => {
  if (!["manager", "admin", "owner"].includes(ctx.user.role)) {
    throw new TRPCError({ code: "FORBIDDEN", message: "Manager access required" });
  }
  return next({ ctx });
});

// Requires admin or owner role
export const adminProcedure = protectedProcedure.use(async ({ ctx, next }) => {
  if (!["admin", "owner"].includes(ctx.user.role)) {
    throw new TRPCError({ code: "FORBIDDEN", message: "Admin access required" });
  }
  return next({ ctx });
});

// Requires owner role — now also requires dealership linkage (owner is a salesperson too)
export const ownerProcedure = protectedProcedure.use(async ({ ctx, next }) => {
  if (ctx.user.role !== "owner") {
    throw new TRPCError({ code: "FORBIDDEN", message: "Owner access required" });
  }
  return next({ ctx });
});
