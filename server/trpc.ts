import { initTRPC, TRPCError } from "@trpc/server";
import type { Request, Response } from "express";
import superjson from "superjson";
import * as db from "./db";

export interface Context {
  req: Request;
  res: Response;
  dealership: { id: number; username: string; name: string } | null;
}

export async function createContext(req: Request, res: Response): Promise<Context> {
  // In demo mode (no database), auto-login as Poulsbo RV
  if (db.isUsingJsonFallback()) {
    return { req, res, dealership: { id: 1, username: "demo", name: "Poulsbo RV" } };
  }

  const sessionToken = req.cookies?.dealership_session;
  let dealership = null;

  if (sessionToken) {
    const session = await db.getDealershipSessionByToken(sessionToken);
    if (session && new Date(session.expiresAt) > new Date()) {
      const d = await db.getDealershipById(session.dealershipId);
      if (d) {
        dealership = { id: d.id, username: d.username, name: d.name };
      }
    }
  }

  return { req, res, dealership };
}

const t = initTRPC.context<Context>().create({
  transformer: superjson,
});

export const router = t.router;
export const publicProcedure = t.procedure;

export const protectedProcedure = t.procedure.use(async ({ ctx, next }) => {
  if (!ctx.dealership) {
    throw new TRPCError({ code: "UNAUTHORIZED", message: "Not authenticated" });
  }
  return next({
    ctx: {
      ...ctx,
      dealership: ctx.dealership,
    },
  });
});
