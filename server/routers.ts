import { z } from "zod";
import { publicProcedure, protectedProcedure, managerProcedure, adminProcedure, ownerProcedure, router } from "./trpc";
import * as db from "./db";
import bcrypt from "bcryptjs";
import crypto from "crypto";
import { runMatchingForNewInventory, runMatchingForNewLead, runMatchingForAllInventory, retryPendingNotifications } from "./matching-engine";
import { scrapeInventoryFromWebsite } from "./inventory-scraper";
import { askAboutInventory, isClaudeConfigured, extractLeadFromImage, extractLeadFromTranscript, extractLeadUpdatesFromTranscript, prepareCallTalkingPoints, generateMatchExplanation } from "./claude";
import { buildInventoryContext } from "./inventory-context";
import { sendPasswordResetEmail, sendDailyDigestEmail } from "./sendgrid";

const passwordSchema = z.string()
  .min(8, "Password must be at least 8 characters")
  .regex(/[a-zA-Z]/, "Password must contain at least one letter")
  .regex(/[0-9]/, "Password must contain at least one number");

const FREE_EMAIL_DOMAINS = [
  "gmail.com", "yahoo.com", "hotmail.com", "outlook.com",
  "aol.com", "icloud.com", "protonmail.com", "live.com", "msn.com",
];

export const appRouter = router({
  auth: router({
    me: publicProcedure.query(({ ctx }) => {
      if (!ctx.user) return null;
      return {
        id: ctx.user.id,
        name: ctx.user.name,
        email: ctx.user.email,
        role: ctx.user.role,
        dealershipId: ctx.user.dealershipId,
        dealershipName: ctx.dealership?.name || null,
      };
    }),

    signup: publicProcedure
      .input(
        z.object({
          email: z.string().email(),
          password: passwordSchema,
          name: z.string().min(1).max(255),
        })
      )
      .mutation(async ({ ctx, input }) => {
        // Check if email already exists
        const existingUser = await db.getUserByEmail(input.email);
        if (existingUser) {
          return { success: false as const, error: "An account with this email already exists" };
        }

        const passwordHash = await bcrypt.hash(input.password, 10);
        const domain = input.email.split("@")[1].toLowerCase();

        let dealershipId: number | null = null;
        let role: "salesperson" | "manager" | "admin" = "admin"; // default: first user creates dealership
        let needsDealership = true;

        // Check for pending invite first
        const pendingInvite = await db.getPendingInviteByEmail(input.email);
        if (pendingInvite && new Date(pendingInvite.expiresAt) > new Date()) {
          dealershipId = pendingInvite.dealershipId;
          role = pendingInvite.role;
          needsDealership = false;
          await db.updateInvite(pendingInvite.id, { status: "accepted", acceptedAt: new Date() } as any);
        } else if (!FREE_EMAIL_DOMAINS.includes(domain)) {
          // Check for domain match
          const matchedDealership = await db.getDealershipByDomain(domain);
          if (matchedDealership) {
            dealershipId = matchedDealership.id;
            role = "salesperson";
            needsDealership = false;
          }
        }

        const user = await db.createUser({
          email: input.email,
          passwordHash,
          name: input.name,
          dealershipId,
          role,
        });

        if (!user) {
          return { success: false as const, error: "Failed to create account" };
        }

        // Enforce max 3 concurrent sessions — evict oldest if at limit
        const signupSessionCount = await db.countUserSessions(user.id);
        if (signupSessionCount >= 3) {
          await db.deleteOldestUserSession(user.id);
        }

        const sessionToken = crypto.randomBytes(32).toString("hex");
        const expiresAt = new Date(Date.now() + 30 * 24 * 60 * 60 * 1000);
        await db.createUserSession({ userId: user.id, sessionToken, expiresAt });

        await db.createActivityLog({
          userId: user.id,
          dealershipId: user.dealershipId || dealershipId,
          action: "signup_success",
        });

        ctx.res.cookie("session", sessionToken, {
          httpOnly: true,
          secure: process.env.NODE_ENV === "production",
          sameSite: "strict",
          maxAge: 30 * 24 * 60 * 60 * 1000,
          path: "/",
        });

        return {
          success: true as const,
          user: {
            id: user.id,
            name: user.name,
            email: user.email,
            role: user.role,
            dealershipId: user.dealershipId,
          },
          needsDealership,
        };
      }),

    login: publicProcedure
      .input(
        z.object({
          email: z.string().email(),
          password: z.string().min(1),
        })
      )
      .mutation(async ({ ctx, input }) => {
        const user = await db.getUserByEmail(input.email);
        if (!user || !user.isActive) {
          // Log failed attempt (no user context)
          return { success: false as const, error: "Invalid credentials" };
        }

        const valid = await bcrypt.compare(input.password, user.passwordHash);
        if (!valid) {
          await db.createActivityLog({
            userId: user.id,
            dealershipId: user.dealershipId,
            action: "login_failed",
          });
          return { success: false as const, error: "Invalid credentials" };
        }

        // Enforce max 3 concurrent sessions — evict oldest if at limit
        const sessionCount = await db.countUserSessions(user.id);
        if (sessionCount >= 3) {
          await db.deleteOldestUserSession(user.id);
        }

        const sessionToken = crypto.randomBytes(32).toString("hex");
        const expiresAt = new Date(Date.now() + 30 * 24 * 60 * 60 * 1000);

        await db.createUserSession({ userId: user.id, sessionToken, expiresAt });
        await db.updateUser(user.id, { lastSignedIn: new Date() } as any);

        await db.createActivityLog({
          userId: user.id,
          dealershipId: user.dealershipId,
          action: "login_success",
        });

        ctx.res.cookie("session", sessionToken, {
          httpOnly: true,
          secure: process.env.NODE_ENV === "production",
          sameSite: "strict",
          maxAge: 30 * 24 * 60 * 60 * 1000,
          path: "/",
        });

        return {
          success: true as const,
          user: {
            id: user.id,
            name: user.name,
            email: user.email,
            role: user.role,
            dealershipId: user.dealershipId,
          },
        };
      }),

    logout: publicProcedure.mutation(async ({ ctx }) => {
      if (ctx.user) {
        await db.createActivityLog({
          userId: ctx.user.id,
          dealershipId: ctx.user.dealershipId,
          action: "logout",
        });
      }
      const sessionToken = ctx.req.cookies?.session;
      if (sessionToken) {
        await db.deleteUserSession(sessionToken);
      }
      ctx.res.clearCookie("session", {
        path: "/",
        httpOnly: true,
        secure: process.env.NODE_ENV === "production",
        sameSite: "strict",
      });
      ctx.res.clearCookie("dealership_session", {
        path: "/",
        httpOnly: true,
        secure: process.env.NODE_ENV === "production",
        sameSite: "strict",
      });
      return { success: true };
    }),

    heartbeat: publicProcedure
      .input(z.object({ sessionDuration: z.number().min(0) }))
      .mutation(async ({ ctx, input }) => {
        if (!ctx.user) return { success: false };
        await db.createActivityLog({
          userId: ctx.user.id,
          dealershipId: ctx.user.dealershipId,
          action: "heartbeat",
          sessionDuration: input.sessionDuration,
        });
        return { success: true };
      }),

    requestPasswordReset: publicProcedure
      .input(z.object({ email: z.string().email() }))
      .mutation(async ({ input }) => {
        // Always return success to prevent email enumeration
        const user = await db.getUserByEmail(input.email);
        if (!user || !user.isActive) {
          return { success: true };
        }

        const token = crypto.randomBytes(32).toString("hex");
        const expiresAt = new Date(Date.now() + 60 * 60 * 1000); // 1 hour
        await db.createPasswordResetToken(user.id, token, expiresAt);

        const baseUrl = process.env.FRONTEND_URL || "https://lotlink.app";
        const resetUrl = `${baseUrl}/reset-password?token=${token}`;
        await sendPasswordResetEmail(user.email, resetUrl, user.name);

        await db.createActivityLog({
          userId: user.id,
          dealershipId: user.dealershipId,
          action: "password_reset_requested",
        });

        return { success: true };
      }),

    resetPassword: publicProcedure
      .input(z.object({
        token: z.string().min(1),
        newPassword: passwordSchema,
      }))
      .mutation(async ({ input }) => {
        const resetToken = await db.getPasswordResetToken(input.token);
        if (!resetToken) {
          return { success: false as const, error: "Invalid or expired reset link" };
        }
        if (resetToken.usedAt) {
          return { success: false as const, error: "This reset link has already been used" };
        }
        if (new Date(resetToken.expiresAt) < new Date()) {
          return { success: false as const, error: "This reset link has expired" };
        }

        const passwordHash = await bcrypt.hash(input.newPassword, 10);
        await db.updateUser(resetToken.userId, { passwordHash } as any);
        await db.markResetTokenUsed(resetToken.id);

        // Invalidate all existing sessions for security
        await db.deleteAllUserSessions(resetToken.userId);

        await db.createActivityLog({
          userId: resetToken.userId,
          dealershipId: null,
          action: "password_reset_completed",
        });

        return { success: true as const };
      }),
  }),

  dealership: router({
    get: protectedProcedure.query(async ({ ctx }) => {
      const d = await db.getDealershipById(ctx.dealership.id);
      if (!d) return null;
      return {
        id: d.id,
        name: d.name,
        email: d.email,
        phone: d.phone,
        address: d.address,
        websiteUrl: d.websiteUrl,
        emailDomain: d.emailDomain,
        lastScrapedAt: d.lastScrapedAt,
        branding: d.branding,
      };
    }),

    create: publicProcedure
      .input(
        z.object({
          name: z.string().min(1).max(255),
          email: z.string().email().optional(),
          phone: z.string().optional(),
          address: z.string().optional(),
          websiteUrl: z.string().optional(),
          registerDomain: z.boolean().default(true),
        })
      )
      .mutation(async ({ ctx, input }) => {
        if (!ctx.user) {
          throw new Error("Not authenticated");
        }
        if (ctx.user.dealershipId) {
          return { success: false as const, error: "Already linked to a dealership" };
        }

        const domain = ctx.user.email.split("@")[1].toLowerCase();

        // Check if domain is already claimed
        if (input.registerDomain && !FREE_EMAIL_DOMAINS.includes(domain)) {
          const existingDealership = await db.getDealershipByDomain(domain);
          if (existingDealership) {
            return {
              success: false as const,
              error: `Domain ${domain} is already registered to ${existingDealership.name}`,
            };
          }
        }

        const shouldRegisterDomain = input.registerDomain && !FREE_EMAIL_DOMAINS.includes(domain);

        const dealership = await db.createDealership({
          name: input.name,
          username: domain.split(".")[0] + "-" + Date.now().toString(36),
          passwordHash: "MIGRATED_TO_USER_AUTH",
          emailDomain: shouldRegisterDomain ? domain : null,
          email: input.email,
          phone: input.phone,
          address: input.address,
          websiteUrl: input.websiteUrl,
        });

        if (!dealership) {
          return { success: false as const, error: "Failed to create dealership" };
        }

        // Link user to dealership as admin
        await db.updateUser(ctx.user.id, {
          dealershipId: dealership.id,
          role: "admin",
        } as any);

        return { success: true as const, dealershipId: dealership.id };
      }),

    updateWebsite: adminProcedure
      .input(z.object({ websiteUrl: z.string().min(1).max(500) }))
      .mutation(async ({ ctx, input }) => {
        await db.updateDealership(ctx.dealership.id, {
          websiteUrl: input.websiteUrl,
        });
        return { success: true };
      }),

    updateDomain: adminProcedure
      .input(z.object({ emailDomain: z.string().min(1).max(255) }))
      .mutation(async ({ ctx, input }) => {
        const domain = input.emailDomain.toLowerCase();
        const existing = await db.getDealershipByDomain(domain);
        if (existing && existing.id !== ctx.dealership.id) {
          return { success: false as const, error: "Domain already claimed by another dealership" };
        }
        await db.updateDealership(ctx.dealership.id, { emailDomain: domain });
        return { success: true as const };
      }),

    updateBranding: adminProcedure
      .input(z.object({
        primaryColor: z.string().optional(),
        logoUrl: z.string().optional(),
        showPoweredBy: z.boolean().optional(),
      }))
      .mutation(async ({ ctx, input }) => {
        const dealership = await db.getDealershipById(ctx.dealership.id);
        const current = (dealership?.branding as any) || {};
        const branding = { ...current, ...input };
        await db.updateDealership(ctx.dealership.id, { branding } as any);
        return { success: true as const };
      }),

    syncInventory: adminProcedure
      .mutation(async ({ ctx }) => {
        const dealership = await db.getDealershipById(ctx.dealership.id);
        if (!dealership?.websiteUrl) {
          return { success: false, error: "No website URL configured" };
        }
        const result = await scrapeInventoryFromWebsite(
          ctx.dealership.id,
          dealership.websiteUrl
        );
        return result;
      }),
  }),

  // ─── User management (admin only) ───
  users: router({
    list: adminProcedure.query(async ({ ctx }) => {
      const members = await db.getUsersByDealershipId(ctx.dealership.id);
      return members.map((m) => ({
        id: m.id,
        name: m.name,
        email: m.email,
        role: m.role,
        isActive: m.isActive,
        lastSignedIn: m.lastSignedIn,
        createdAt: m.createdAt,
      }));
    }),

    updateRole: adminProcedure
      .input(
        z.object({
          userId: z.number(),
          role: z.enum(["salesperson", "manager", "admin"]),
        })
      )
      .mutation(async ({ ctx, input }) => {
        if (input.userId === ctx.user.id) {
          return { success: false as const, error: "Cannot change your own role" };
        }
        const targetUser = await db.getUserById(input.userId);
        if (!targetUser || targetUser.dealershipId !== ctx.dealership.id) {
          return { success: false as const, error: "User not found" };
        }
        await db.updateUser(input.userId, { role: input.role } as any);
        return { success: true as const };
      }),

    deactivate: adminProcedure
      .input(z.object({ userId: z.number() }))
      .mutation(async ({ ctx, input }) => {
        if (input.userId === ctx.user.id) {
          return { success: false as const, error: "Cannot deactivate yourself" };
        }
        const targetUser = await db.getUserById(input.userId);
        if (!targetUser || targetUser.dealershipId !== ctx.dealership.id) {
          return { success: false as const, error: "User not found" };
        }
        await db.updateUser(input.userId, { isActive: !targetUser.isActive } as any);
        return { success: true as const, isActive: !targetUser.isActive };
      }),
  }),

  // ─── Invite management ───
  invites: router({
    create: adminProcedure
      .input(
        z.object({
          email: z.string().email(),
          role: z.enum(["salesperson", "manager", "admin"]).default("salesperson"),
        })
      )
      .mutation(async ({ ctx, input }) => {
        const existingUser = await db.getUserByEmail(input.email);
        if (existingUser && existingUser.dealershipId === ctx.dealership.id) {
          return { success: false as const, error: "User already belongs to this dealership" };
        }

        const existingInvite = await db.getPendingInviteByEmail(input.email, ctx.dealership.id);
        if (existingInvite) {
          return { success: false as const, error: "Invite already pending for this email" };
        }

        const inviteToken = crypto.randomBytes(32).toString("hex");
        const expiresAt = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000);

        await db.createInvite({
          dealershipId: ctx.dealership.id,
          email: input.email.toLowerCase(),
          role: input.role,
          inviteToken,
          status: "pending",
          invitedByUserId: ctx.user.id,
          expiresAt,
        });

        return { success: true as const, inviteToken };
      }),

    list: adminProcedure.query(async ({ ctx }) => {
      return db.getInvitesByDealershipId(ctx.dealership.id);
    }),

    revoke: adminProcedure
      .input(z.object({ id: z.number() }))
      .mutation(async ({ ctx, input }) => {
        const invite = await db.getInviteById(input.id);
        if (!invite || invite.dealershipId !== ctx.dealership.id) {
          return { success: false as const, error: "Invite not found" };
        }
        await db.updateInvite(input.id, { status: "revoked" } as any);
        return { success: true as const };
      }),

    resend: adminProcedure
      .input(z.object({ id: z.number() }))
      .mutation(async ({ ctx, input }) => {
        const invite = await db.getInviteById(input.id);
        if (!invite || invite.dealershipId !== ctx.dealership.id) {
          return { success: false as const, error: "Invite not found" };
        }
        if (invite.status !== "pending") {
          return { success: false as const, error: "Invite is not pending" };
        }
        // Extend expiration by 7 days
        const newExpiry = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000);
        await db.updateInvite(input.id, { expiresAt: newExpiry } as any);
        return { success: true as const, inviteToken: invite.inviteToken };
      }),

    accept: publicProcedure
      .input(z.object({ inviteToken: z.string() }))
      .mutation(async ({ ctx, input }) => {
        if (!ctx.user) {
          return { success: false as const, error: "Please sign up or log in first" };
        }
        if (ctx.user.dealershipId) {
          return { success: false as const, error: "Already linked to a dealership" };
        }

        const invite = await db.getInviteByToken(input.inviteToken);
        if (!invite || invite.status !== "pending" || new Date(invite.expiresAt) < new Date()) {
          return { success: false as const, error: "Invalid or expired invite" };
        }

        await db.updateUser(ctx.user.id, {
          dealershipId: invite.dealershipId,
          role: invite.role,
        } as any);
        await db.updateInvite(invite.id, { status: "accepted", acceptedAt: new Date() } as any);

        return { success: true as const, dealershipId: invite.dealershipId };
      }),
  }),

  leads: router({
    list: protectedProcedure
      .input(
        z.object({
          cursor: z.number().nullish(),
          limit: z.number().min(1).max(100).default(50),
          status: z.string().optional(),
        })
      )
      .query(async ({ ctx, input }) => {
        const limit = input.limit ?? 50;
        const userId = ctx.user.role === "salesperson" ? ctx.user.id : undefined;
        const items = await db.getUserLeads(ctx.dealership.id, input.cursor ?? undefined, limit, userId, input.status);
        let nextCursor: typeof input.cursor | undefined = undefined;
        if (items.length > limit) {
          const nextItem = items.pop();
          nextCursor = nextItem!.id;
        }
        return {
          items,
          nextCursor,
        };
      }),
    getById: protectedProcedure
      .input(z.object({ id: z.number() }))
      .query(async ({ ctx, input }) => {
        const lead = await db.getLeadById(input.id);
        if (!lead || lead.dealershipId !== ctx.dealership.id) return null;
        if (ctx.user.role === "salesperson" && lead.userId !== ctx.user.id) return null;
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
          salespersonName: z.string().optional().nullable(),
        })
      )
      .mutation(async ({ ctx, input }) => {
        const lead = await db.createLead({
          dealershipId: ctx.dealership.id,
          userId: ctx.user.id,
          customerName: input.customerName,
          customerEmail: input.customerEmail,
          customerPhone: input.customerPhone,
          preferenceType: input.preferenceType,
          preferredModel: input.preferredModel,
          preferredYear: input.preferredYear,
          preferences: input.preferences,
          notes: input.notes,
          storeLocation: input.storeLocation,
          salespersonName: input.salespersonName || ctx.user.name,
          status: "new",
        });
        // Trigger matching for new lead (fire-and-forget)
        if (lead?.id) {
          runMatchingForNewLead(lead.id, ctx.dealership.id).catch(() => {});
        }
        return lead;
      }),
    update: protectedProcedure
      .input(
        z.object({
          id: z.number(),
          customerName: z.string().optional(),
          customerEmail: z.string().optional().nullable(),
          customerPhone: z.string().optional().nullable(),
          preferences: z.record(z.string(), z.any()).optional().nullable(),
          notes: z.string().optional().nullable(),
          status: z.enum(["new", "contacted", "working", "matched", "sold", "lost"]).optional(),
        })
      )
      .mutation(async ({ ctx, input }) => {
        const lead = await db.getLeadById(input.id);
        if (!lead || lead.dealershipId !== ctx.dealership.id) return null;
        if (ctx.user.role === "salesperson" && lead.userId !== ctx.user.id) return null;

        // Log status change to activity feed
        if (input.status && input.status !== lead.status) {
          await db.createActivityLog({
            userId: ctx.user.id,
            dealershipId: ctx.dealership.id,
            action: "lead_status_change",
            metadata: { leadId: input.id, from: lead.status, to: input.status, customerName: lead.customerName },
          });
        }

        const { id, ...data } = input;
        await db.updateLead(id, data);
        // Re-run matching if preferences changed
        if (input.preferences !== undefined) {
          runMatchingForNewLead(id, ctx.dealership.id).catch(() => {});
        }
        return;
      }),
    delete: protectedProcedure
      .input(z.object({ id: z.number() }))
      .mutation(async ({ ctx, input }) => {
        const lead = await db.getLeadById(input.id);
        if (!lead || lead.dealershipId !== ctx.dealership.id) return null;
        if (ctx.user.role === "salesperson" && lead.userId !== ctx.user.id) return null;
        return db.deleteLead(input.id);
      }),
    search: protectedProcedure
      .input(z.object({ query: z.string() }))
      .query(({ ctx, input }) =>
        db.searchLeads(ctx.dealership.id, input.query)
      ),

    importCsv: protectedProcedure
      .input(
        z.object({
          rows: z.array(
            z.object({
              customerName:   z.string().min(1),
              customerPhone:  z.string().optional().nullable(),
              customerEmail:  z.string().optional().nullable(),
              preferredMake:  z.string().optional().nullable(),
              preferredModel: z.string().optional().nullable(),
              preferredYear:  z.number().optional().nullable(),
              maxPrice:       z.string().optional().nullable(),
              notes:          z.string().optional().nullable(),
            })
          ).min(1).max(500),
        })
      )
      .mutation(async ({ ctx, input }) => {
        // Pre-fetch existing leads for duplicate detection
        const existingLeads = await db.getAllDealershipLeads(ctx.dealership.id);
        const existingPhones = new Set(existingLeads.map((l: any) => l.customerPhone?.replace(/\D/g, "")).filter(Boolean));
        const existingEmails = new Set(existingLeads.map((l: any) => l.customerEmail?.toLowerCase()).filter(Boolean));

        let imported = 0;
        let skipped = 0;
        let failed = 0;
        for (const row of input.rows) {
          try {
            // Duplicate check by phone or email
            const phone = row.customerPhone?.replace(/\D/g, "");
            const email = row.customerEmail?.toLowerCase();
            if ((phone && existingPhones.has(phone)) || (email && existingEmails.has(email))) {
              skipped++;
              continue;
            }

            const preferences: Record<string, any> = {};
            if (row.maxPrice)      preferences.maxPrice = row.maxPrice;
            if (row.preferredMake) preferences.make     = row.preferredMake;
            await db.createLead({
              dealershipId:   ctx.dealership.id,
              userId:         ctx.user.id,
              customerName:   row.customerName,
              customerEmail:  row.customerEmail || null,
              customerPhone:  row.customerPhone || null,
              preferenceType: row.preferredModel ? "model" : "features",
              preferredModel: row.preferredModel || null,
              preferredYear:  row.preferredYear  || null,
              preferences:    Object.keys(preferences).length ? preferences : null,
              notes:          row.notes          || null,
              salespersonName: ctx.user.name,
              status: "new",
            });
            // Track newly added for further dedup within batch
            if (phone) existingPhones.add(phone);
            if (email) existingEmails.add(email);
            imported++;
          } catch { failed++; }
        }
        return { success: true as const, imported, skipped, failed };
      }),

    extractFromPhoto: protectedProcedure
      .input(z.object({
        imageBase64: z.string().min(1),
        mediaType: z.enum(["image/jpeg", "image/png", "image/webp"]).default("image/jpeg"),
      }))
      .mutation(async ({ input }) => {
        const result = await extractLeadFromImage(input.imageBase64, input.mediaType);
        return result;
      }),

    extractFromVoice: protectedProcedure
      .input(z.object({
        transcript: z.string().min(1).max(10000),
      }))
      .mutation(async ({ input }) => {
        return extractLeadFromTranscript(input.transcript);
      }),

    appendVoiceNote: protectedProcedure
      .input(z.object({
        leadId: z.number(),
        transcript: z.string().min(1).max(10000),
      }))
      .mutation(async ({ ctx, input }) => {
        const lead = await db.getLeadById(input.leadId);
        if (!lead || lead.dealershipId !== ctx.dealership.id) return { error: "Lead not found" };

        const result = await extractLeadUpdatesFromTranscript(input.transcript, {
          customerName: lead.customerName,
          preferences: lead.preferences as any,
          notes: lead.notes || "",
        });

        if (result.error) return { error: result.error };

        const updates: any = {};
        if (result.updates.notes) {
          const timestamp = new Date().toLocaleString();
          updates.notes = (lead.notes || "") + `\n\n[Voice Note ${timestamp}]\n${result.updates.notes}`;
        }
        if (result.updates.preferences) {
          const existing = (lead.preferences || {}) as Record<string, any>;
          updates.preferences = { ...existing, ...result.updates.preferences };
        }
        if (result.updates.status) {
          updates.status = result.updates.status;
        }

        if (Object.keys(updates).length > 0) {
          await db.updateLead(input.leadId, updates);
          // Re-run matching if preferences changed
          if (updates.preferences) {
            runMatchingForNewLead(input.leadId, ctx.dealership.id).catch(() => {});
          }
        }

        await db.createActivityLog({
          userId: ctx.user.id,
          dealershipId: ctx.dealership.id,
          action: "voice_note_added",
          metadata: { leadId: input.leadId, customerName: lead.customerName, summary: result.summary },
        });

        return { summary: result.summary, updates: result.updates };
      }),

    reassign: managerProcedure
      .input(z.object({
        leadIds: z.array(z.number()).min(1).max(500),
        toUserId: z.number(),
      }))
      .mutation(async ({ ctx, input }) => {
        const toUser = await db.getUserById(input.toUserId);
        if (!toUser || toUser.dealershipId !== ctx.dealership.id) {
          return { success: false as const, error: "Target user not found in this dealership" };
        }
        let transferred = 0;
        for (const leadId of input.leadIds) {
          const lead = await db.getLeadById(leadId);
          if (!lead || lead.dealershipId !== ctx.dealership.id) continue;
          await db.updateLead(leadId, {
            userId: toUser.id,
            salespersonName: toUser.name,
          });
          await db.createActivityLog({
            userId: ctx.user.id,
            dealershipId: ctx.dealership.id,
            action: "lead_transferred",
            metadata: { leadId, customerName: lead.customerName, fromUserId: lead.userId, toUserId: toUser.id, toUserName: toUser.name },
          });
          transferred++;
        }
        return { success: true as const, transferred };
      }),
  }),

  inventory: router({
    list: protectedProcedure
      .input(
        z.object({
          cursor: z.number().nullish(),
          limit: z.number().min(1).max(100).default(50),
        })
      )
      .query(async ({ ctx, input }) => {
        const limit = input.limit ?? 50;
        const items = await db.getUserInventory(ctx.dealership.id, input.cursor ?? undefined, limit);
        let nextCursor: typeof input.cursor | undefined = undefined;
        if (items.length > limit) {
          const nextItem = items.pop();
          nextCursor = nextItem!.id;
        }
        return {
          items,
          nextCursor,
        };
      }),
    getById: protectedProcedure
      .input(z.object({ id: z.number() }))
      .query(async ({ ctx, input }) => {
        const item = await db.getInventoryById(input.id);
        if (item && item.dealershipId !== ctx.dealership.id) return null;
        return item;
      }),
    create: managerProcedure
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
    update: managerProcedure
      .input(
        z.object({
          id: z.number(),
          status: z.enum(["in_stock", "matched", "sold", "pending", "hold", "removed"]).optional(),
        })
      )
      .mutation(async ({ ctx, input }) => {
        const item = await db.getInventoryById(input.id);
        if (!item || item.dealershipId !== ctx.dealership.id) return null;
        const { id, ...data } = input;
        // Clear hold fields if moving out of hold
        if (data.status && data.status !== "hold" && item.status === "hold") {
          await db.updateInventory(id, { ...data, holdByUserId: null, holdCustomerName: null, holdExpiresAt: null } as any);
        } else {
          await db.updateInventory(id, data);
        }
        // Re-run matching if unit becomes available again
        if (data.status === "in_stock" && item.status !== "in_stock") {
          runMatchingForNewInventory(id, ctx.dealership.id).catch(() => {});
        }
        return db.getInventoryById(id);
      }),

    hold: protectedProcedure
      .input(z.object({
        id: z.number(),
        customerName: z.string().min(1),
        holdHours: z.number().min(1).max(168).default(48),
      }))
      .mutation(async ({ ctx, input }) => {
        const item = await db.getInventoryById(input.id);
        if (!item || item.dealershipId !== ctx.dealership.id) return null;
        if (item.status === "sold") return { error: "Cannot hold a sold unit" };
        await db.updateInventory(input.id, {
          status: "hold",
          holdByUserId: ctx.user.id,
          holdCustomerName: input.customerName,
          holdExpiresAt: new Date(Date.now() + input.holdHours * 60 * 60 * 1000),
        } as any);
        await db.createActivityLog({
          userId: ctx.user.id,
          dealershipId: ctx.dealership.id,
          action: "inventory_hold",
          metadata: { inventoryId: input.id, unitId: item.unitId, customerName: input.customerName, holdHours: input.holdHours },
        });
        return db.getInventoryById(input.id);
      }),

    releaseHold: protectedProcedure
      .input(z.object({ id: z.number() }))
      .mutation(async ({ ctx, input }) => {
        const item = await db.getInventoryById(input.id);
        if (!item || item.dealershipId !== ctx.dealership.id) return null;
        if (item.status !== "hold") return item;
        await db.updateInventory(input.id, {
          status: "in_stock",
          holdByUserId: null,
          holdCustomerName: null,
          holdExpiresAt: null,
        } as any);
        await db.createActivityLog({
          userId: ctx.user.id,
          dealershipId: ctx.dealership.id,
          action: "inventory_hold_released",
          metadata: { inventoryId: input.id, unitId: item.unitId },
        });
        return db.getInventoryById(input.id);
      }),

    delete: managerProcedure
      .input(z.object({ id: z.number() }))
      .mutation(async ({ ctx, input }) => {
        const item = await db.getInventoryById(input.id);
        if (!item || item.dealershipId !== ctx.dealership.id) return null;
        return db.deleteInventory(input.id);
      }),

    importCsv: managerProcedure
      .input(
        z.object({
          rows: z.array(
            z.object({
              unitId:        z.string().min(1),
              year:          z.number().min(1900).max(2100),
              make:          z.string().min(1),
              model:         z.string().min(1),
              length:        z.string().optional().nullable(),
              bedType:       z.string().optional().nullable(),
              price:         z.string().optional().nullable(),
              storeLocation: z.string().min(1),
            })
          ).min(1).max(500),
        })
      )
      .mutation(async ({ ctx, input }) => {
        const items = input.rows.map((row) => ({
          dealershipId:  ctx.dealership.id,
          unitId:        row.unitId,
          year:          row.year,
          make:          row.make,
          model:         row.model,
          length:        row.length  || null,
          bedType:       row.bedType || null,
          price:         row.price   || null,
          storeLocation: row.storeLocation,
          arrivalDate:   new Date(),
          status:        "in_stock" as const,
        }));
        const result = await db.bulkCreateInventory(items);
        // Run AI matching for all new units in the background
        runMatchingForAllInventory(ctx.dealership.id).catch(() => {});
        return { success: true as const, imported: result.length };
      }),
  }),

  matches: router({
    list: protectedProcedure
      .input(
        z.object({
          cursor: z.number().nullish(),
          limit: z.number().min(1).max(100).default(20),
        })
      )
      .query(async ({ ctx, input }) => {
        const limit = input.limit ?? 20;
        const items = await db.getAllDealershipMatches(ctx.dealership.id, input.cursor ?? undefined, limit);
        let nextCursor: typeof input.cursor | undefined = undefined;
        if (items.length > limit) {
          const nextItem = items.pop();
          nextCursor = nextItem!.id;
        }
        return {
          items,
          nextCursor,
        };
      }),
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
          status: z.enum(["new", "notified", "contacted", "appointment", "sold", "dismissed"]),
          contactNotes: z.string().optional().nullable(),
          dismissReason: z.enum(["customer_not_interested", "unit_sold", "budget_changed", "other"]).optional().nullable(),
        })
      )
      .mutation(async ({ ctx, input }) => {
        const match = await db.getMatchById(input.id);
        if (!match) return null;
        // Verify ownership
        const lead = await db.getLeadById(match.leadId);
        if (!lead || lead.dealershipId !== ctx.dealership.id) return null;

        const updateData: any = { status: input.status };
        if (input.status === "contacted") {
          updateData.customerContactedAt = new Date();
        }
        if (input.contactNotes) {
          updateData.contactNotes = input.contactNotes;
        }
        if (input.status === "dismissed" && input.dismissReason) {
          updateData.dismissReason = input.dismissReason;
        }
        if (input.status === "sold") {
          updateData.outcome = "sold";
        }

        await db.updateMatch(input.id, updateData);

        // Log status change
        await db.createActivityLog({
          userId: ctx.user.id,
          dealershipId: ctx.dealership.id,
          action: "match_status_change",
          metadata: { matchId: input.id, from: match.status, to: input.status, leadName: lead.customerName },
        });

        // Also log to match history
        await db.createMatchHistory({
          leadId: match.leadId,
          inventoryId: match.inventoryId,
          matchId: match.id,
          matchScore: match.matchScore,
          matchReason: match.matchReason || "",
          status: input.status,
          outcome: input.status === "sold" ? "sold" : input.status === "dismissed" ? "not_interested" : undefined,
        });

        return db.getMatchById(input.id);
      }),

    getStats: protectedProcedure
      .query(async ({ ctx }) => {
        const allMatches = await db.getAllDealershipMatches(ctx.dealership.id, undefined, 1000);
        const stats = { new: 0, notified: 0, contacted: 0, appointment: 0, sold: 0, dismissed: 0, total: allMatches.length };
        for (const entry of allMatches) {
          const s = (entry.match as any)?.status || "new";
          if (s in stats) (stats as any)[s]++;
        }
        return stats;
      }),
    runScan: managerProcedure
      .mutation(async ({ ctx }) => {
        const scanResult = await runMatchingForAllInventory(ctx.dealership.id);
        const retryResult = await retryPendingNotifications(ctx.dealership.id);
        return {
          ...scanResult,
          totalNotifications: scanResult.totalNotifications + retryResult.sent,
          retriedNotifications: retryResult.sent,
        };
      }),
    retryNotifications: managerProcedure
      .mutation(async ({ ctx }) => {
        return retryPendingNotifications(ctx.dealership.id);
      }),
    runScanForUnit: managerProcedure
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
    update: adminProcedure
      .input(
        z.object({
          emailNotifications: z.boolean().optional(),
          smsNotifications: z.boolean().optional(),
          inAppNotifications: z.boolean().optional(),
          matchingSensitivity: z.enum(["strict", "moderate", "loose"]).optional(),
          matchThreshold: z.number().min(10).max(100).optional(),
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

  ai: router({
    ask: protectedProcedure
      .input(
        z.object({
          question: z.string().min(1).max(2000),
          conversationHistory: z
            .array(
              z.object({
                role: z.enum(["user", "assistant"]),
                content: z.string(),
              })
            )
            .optional(),
        })
      )
      .mutation(async ({ ctx, input }) => {
        if (!isClaudeConfigured()) {
          return {
            answer: "",
            error: "AI assistant is not configured. Ask your admin to set the ANTHROPIC_API_KEY.",
          };
        }
        const context = await buildInventoryContext(ctx.dealership.id);
        return askAboutInventory(input.question, context, input.conversationHistory);
      }),

    prepareCall: protectedProcedure
      .input(z.object({ matchId: z.number() }))
      .mutation(async ({ ctx, input }) => {
        if (!isClaudeConfigured()) {
          return { talkingPoints: "", error: "AI not configured." };
        }
        const match = await db.getMatchById(input.matchId);
        if (!match) return { talkingPoints: "", error: "Match not found" };
        const lead = await db.getLeadById(match.leadId);
        if (!lead || lead.dealershipId !== ctx.dealership.id) return { talkingPoints: "", error: "Not found" };
        const unit = await db.getInventoryById(match.inventoryId);
        if (!unit) return { talkingPoints: "", error: "Unit not found" };

        return prepareCallTalkingPoints(
          { customerName: lead.customerName, preferences: lead.preferences, notes: lead.notes || undefined, preferredModel: lead.preferredModel || undefined },
          { year: unit.year, make: unit.make, model: unit.model, price: unit.price || undefined, amenities: unit.amenities, bedType: unit.bedType || undefined, length: unit.length || undefined },
          match.matchScore,
          match.matchReason || undefined
        );
      }),

    enhanceExplanation: protectedProcedure
      .input(z.object({ matchId: z.number() }))
      .mutation(async ({ ctx, input }) => {
        if (!isClaudeConfigured()) {
          return { explanation: "", error: "AI not configured." };
        }
        const match = await db.getMatchById(input.matchId);
        if (!match) return { explanation: "", error: "Match not found" };
        const lead = await db.getLeadById(match.leadId);
        if (!lead || lead.dealershipId !== ctx.dealership.id) return { explanation: "", error: "Not found" };
        const unit = await db.getInventoryById(match.inventoryId);
        if (!unit) return { explanation: "", error: "Unit not found" };

        const result = await generateMatchExplanation(
          { customerName: lead.customerName, preferences: lead.preferences, preferredModel: lead.preferredModel || undefined, notes: lead.notes || undefined },
          { year: unit.year, make: unit.make, model: unit.model, price: unit.price || undefined, amenities: unit.amenities, bedType: unit.bedType || undefined, length: unit.length || undefined },
          match.matchScore
        );

        // Store the enhanced explanation back
        if (result.explanation) {
          await db.updateMatch(match.id, { matchReason: result.explanation });
        }

        return result;
      }),
  }),

  notifications: router({
    list: protectedProcedure
      .input(z.object({ limit: z.number().min(1).max(100).default(20) }))
      .query(({ ctx, input }) =>
        db.getInAppNotifications(ctx.dealership.id, input.limit)
      ),
    getUnreadCount: protectedProcedure.query(({ ctx }) =>
      db.getUnreadNotificationCount(ctx.dealership.id)
    ),
    markAsRead: protectedProcedure
      .input(z.object({ id: z.number() }))
      .mutation(({ input }) => db.markNotificationAsRead(input.id)),

    markAllRead: protectedProcedure
      .mutation(async ({ ctx }) => {
        const notifications = await db.getInAppNotifications(ctx.dealership.id, 100);
        let marked = 0;
        for (const n of notifications) {
          if (!n.isRead) {
            await db.markNotificationAsRead(n.id);
            marked++;
          }
        }
        return { marked };
      }),

    sendDailyDigest: managerProcedure
      .mutation(async ({ ctx }) => {
        const dealership = await db.getDealershipById(ctx.dealership.id);
        if (!dealership?.email) return { error: "No dealership email configured" };

        // Get matches from last 24 hours
        const allMatches = await db.getAllDealershipMatches(ctx.dealership.id, undefined, 200);
        const oneDayAgo = Date.now() - 24 * 60 * 60 * 1000;
        const recentMatches = allMatches.filter((m: any) => {
          const created = new Date(m.match?.createdAt || 0).getTime();
          return created >= oneDayAgo;
        });

        const result = await sendDailyDigestEmail(
          dealership.email,
          recentMatches,
          dealership.name
        );
        return result;
      }),

    getPrefs: protectedProcedure
      .query(({ ctx }) => ({
        pushNotifications: (ctx.user as any).pushNotifications ?? true,
        emailNotifications: (ctx.user as any).emailNotifications ?? true,
        quietHoursStart: (ctx.user as any).quietHoursStart ?? null,
        quietHoursEnd: (ctx.user as any).quietHoursEnd ?? null,
      })),

    updatePrefs: protectedProcedure
      .input(z.object({
        pushNotifications: z.boolean().optional(),
        emailNotifications: z.boolean().optional(),
        quietHoursStart: z.number().min(0).max(23).nullable().optional(),
        quietHoursEnd: z.number().min(0).max(23).nullable().optional(),
      }))
      .mutation(async ({ ctx, input }) => {
        await db.updateUser(ctx.user.id, input as any);
        return { success: true };
      }),

    checkFollowUpTimers: managerProcedure
      .mutation(async ({ ctx }) => {
        const prefs = await db.getDealershipPreferences(ctx.dealership.id);
        const yellowHours = 1;  // 1 hour default
        const redHours = 4;     // 4 hours default
        const criticalHours = 24;

        const allMatches = await db.getAllDealershipMatches(ctx.dealership.id, undefined, 500);
        const now = Date.now();
        let yellowAlerts = 0, redAlerts = 0, criticalAlerts = 0;

        for (const entry of allMatches) {
          const match = entry.match as any;
          if (!match) continue;
          // Only check unacted matches (new or notified status)
          if (match.status !== "new" && match.status !== "notified" && match.status !== "pending") continue;

          const createdAt = new Date(match.createdAt).getTime();
          const ageHours = (now - createdAt) / (1000 * 60 * 60);
          const lead = entry.lead as any;

          if (ageHours >= criticalHours) {
            await db.createInAppNotification({
              dealershipId: ctx.dealership.id,
              leadId: match.leadId,
              inventoryId: match.inventoryId,
              matchId: match.id,
              title: "CRITICAL: Unacted Match",
              message: `Match for ${lead?.customerName || "Unknown"} has been unacted for ${Math.round(ageHours)} hours!`,
            });
            criticalAlerts++;
          } else if (ageHours >= redHours) {
            await db.createInAppNotification({
              dealershipId: ctx.dealership.id,
              leadId: match.leadId,
              inventoryId: match.inventoryId,
              matchId: match.id,
              title: "Escalation: Unacted Match",
              message: `${lead?.salespersonName || "Salesperson"} hasn't contacted ${lead?.customerName || "lead"} (${Math.round(ageHours)}h old)`,
            });
            redAlerts++;
          } else if (ageHours >= yellowHours) {
            await db.createInAppNotification({
              dealershipId: ctx.dealership.id,
              leadId: match.leadId,
              inventoryId: match.inventoryId,
              matchId: match.id,
              title: "Reminder: Match Waiting",
              message: `Match for ${lead?.customerName || "Unknown"} waiting ${Math.round(ageHours * 60)} minutes — follow up now!`,
            });
            yellowAlerts++;
          }
        }

        return { yellowAlerts, redAlerts, criticalAlerts };
      }),
  }),

  // ─── Manager Dashboard (E9) ───
  manager: router({
    teamOverview: managerProcedure.query(async ({ ctx }) => {
      const teamMembers = await db.getUsersByDealershipId(ctx.dealership.id);
      const allLeads = await db.getAllDealershipLeads(ctx.dealership.id);
      const allLeadIds = allLeads.map((l: any) => l.id);
      let allMatches: any[] = [];
      if (allLeadIds.length > 0) {
        const raw = await db.getAllDealershipMatches(ctx.dealership.id, undefined, 2000);
        allMatches = raw.map((r: any) => ({ ...r.match, lead: r.lead, unit: r.unit }));
      }

      const now = Date.now();
      const todayStart = new Date(); todayStart.setHours(0, 0, 0, 0);
      const weekStart = new Date(); weekStart.setDate(weekStart.getDate() - 7);

      // Get recent activity per user
      const logs = await db.getActivityLogs({ dealershipId: ctx.dealership.id, limit: 500 });

      return teamMembers.map((member: any) => {
        const memberLeads = allLeads.filter((l: any) => l.userId === member.id);
        const leadsToday = memberLeads.filter((l: any) => new Date(l.createdAt) >= todayStart).length;
        const leadsThisWeek = memberLeads.filter((l: any) => new Date(l.createdAt) >= weekStart).length;

        const memberLeadIds = new Set(memberLeads.map((l: any) => l.id));
        const memberMatches = allMatches.filter((m: any) => memberLeadIds.has(m.leadId));
        const activeMatches = memberMatches.filter((m: any) =>
          ["new", "notified", "contacted", "appointment"].includes(m.status)
        );
        const unactedMatches = memberMatches.filter((m: any) =>
          ["new", "notified", "pending"].includes(m.status)
        );
        const oldestUnacted = unactedMatches.reduce((oldest: number, m: any) => {
          const age = now - new Date(m.createdAt).getTime();
          return age > oldest ? age : oldest;
        }, 0);

        const lastActivity = logs.find((l: any) => l.userId === member.id);

        return {
          userId: member.id,
          name: member.name,
          role: member.role,
          isActive: member.isActive,
          leadsToday,
          leadsThisWeek,
          activeMatchCount: activeMatches.length,
          unactedMatchCount: unactedMatches.length,
          oldestUnactedHours: Math.round((oldestUnacted / (1000 * 60 * 60)) * 10) / 10,
          lastActivityAt: lastActivity?.createdAt || member.lastSignedIn || null,
        };
      });
    }),

    timerBoard: managerProcedure.query(async ({ ctx }) => {
      const raw = await db.getAllDealershipMatches(ctx.dealership.id, undefined, 1000);
      const now = Date.now();

      const buckets = { newMatches: [] as any[], overdue: [] as any[], critical: [] as any[], contacted: [] as any[] };

      for (const entry of raw) {
        const m = entry.match as any;
        if (!m) continue;
        const lead = entry.lead as any;
        const unit = entry.unit as any;
        const ageMs = now - new Date(m.createdAt).getTime();
        const ageHours = ageMs / (1000 * 60 * 60);

        const card = {
          matchId: m.id,
          leadName: lead?.customerName || "Unknown",
          unitName: unit ? `${unit.year} ${unit.make} ${unit.model}` : "Unknown",
          salesperson: lead?.salespersonName || "Unassigned",
          salespersonUserId: lead?.userId,
          matchScore: m.matchScore,
          status: m.status,
          ageHours: Math.round(ageHours * 10) / 10,
          createdAt: m.createdAt,
        };

        if (["contacted", "appointment"].includes(m.status)) {
          buckets.contacted.push(card);
        } else if (["new", "notified", "pending"].includes(m.status)) {
          if (ageHours >= 24) buckets.critical.push(card);
          else if (ageHours >= 4) buckets.overdue.push(card);
          else buckets.newMatches.push(card);
        }
      }

      return buckets;
    }),

    conversionFunnel: managerProcedure
      .input(z.object({
        days: z.number().min(1).max(365).default(30),
        userId: z.number().optional(),
      }).optional())
      .query(async ({ ctx, input }) => {
        const raw = await db.getAllDealershipMatches(ctx.dealership.id, undefined, 2000);
        const since = Date.now() - (input?.days || 30) * 24 * 60 * 60 * 1000;

        let filtered = raw.filter((entry: any) => {
          const m = entry.match as any;
          return m && new Date(m.createdAt).getTime() >= since;
        });

        if (input?.userId) {
          filtered = filtered.filter((entry: any) => (entry.lead as any)?.userId === input.userId);
        }

        const total = filtered.length;
        const contacted = filtered.filter((e: any) => ["contacted", "appointment", "sold"].includes((e.match as any).status)).length;
        const appointments = filtered.filter((e: any) => ["appointment", "sold"].includes((e.match as any).status)).length;
        const sold = filtered.filter((e: any) => (e.match as any).status === "sold").length;

        // Average time to contact
        const contactTimes = filtered
          .filter((e: any) => (e.match as any).customerContactedAt)
          .map((e: any) => {
            const m = e.match as any;
            return new Date(m.customerContactedAt).getTime() - new Date(m.createdAt).getTime();
          });
        const avgContactTimeMs = contactTimes.length > 0
          ? contactTimes.reduce((a: number, b: number) => a + b, 0) / contactTimes.length
          : 0;

        return {
          total,
          contacted,
          contactedPct: total > 0 ? Math.round((contacted / total) * 100) : 0,
          appointments,
          appointmentsPct: total > 0 ? Math.round((appointments / total) * 100) : 0,
          sold,
          soldPct: total > 0 ? Math.round((sold / total) * 100) : 0,
          avgContactTimeMinutes: Math.round(avgContactTimeMs / (1000 * 60)),
          days: input?.days || 30,
        };
      }),

    activityFeed: managerProcedure
      .input(z.object({
        limit: z.number().min(1).max(100).default(50),
        userId: z.number().optional(),
      }).optional())
      .query(async ({ ctx, input }) => {
        const logs = await db.getActivityLogs({
          dealershipId: ctx.dealership.id,
          userId: input?.userId,
          limit: input?.limit || 50,
        });
        const userCache: Record<number, string> = {};
        return Promise.all(
          logs.map(async (log: any) => {
            if (!userCache[log.userId]) {
              const u = await db.getUserById(log.userId);
              userCache[log.userId] = u?.name || "Unknown";
            }
            return { ...log, userName: userCache[log.userId] };
          })
        );
      }),

    reassignMatch: managerProcedure
      .input(z.object({
        matchId: z.number(),
        newUserId: z.number(),
      }))
      .mutation(async ({ ctx, input }) => {
        const match = await db.getMatchById(input.matchId);
        if (!match) return { success: false as const, error: "Match not found" };
        const lead = await db.getLeadById(match.leadId);
        if (!lead || lead.dealershipId !== ctx.dealership.id) return { success: false as const, error: "Lead not found" };
        const newUser = await db.getUserById(input.newUserId);
        if (!newUser || newUser.dealershipId !== ctx.dealership.id) return { success: false as const, error: "User not found" };

        await db.updateLead(lead.id, { userId: input.newUserId, salespersonName: newUser.name });

        await db.createActivityLog({
          userId: ctx.user.id,
          dealershipId: ctx.dealership.id,
          action: "match_reassigned",
          metadata: { matchId: input.matchId, leadName: lead.customerName, from: lead.salespersonName, to: newUser.name },
        });

        await db.createInAppNotification({
          dealershipId: ctx.dealership.id,
          leadId: lead.id,
          matchId: match.id,
          title: "Match Reassigned to You",
          message: `Your manager assigned you the match for ${lead.customerName}. Check it out!`,
        });

        return { success: true as const };
      }),

    nudge: managerProcedure
      .input(z.object({
        userId: z.number(),
        matchId: z.number().optional(),
        message: z.string().optional(),
      }))
      .mutation(async ({ ctx, input }) => {
        const targetUser = await db.getUserById(input.userId);
        if (!targetUser || targetUser.dealershipId !== ctx.dealership.id) {
          return { success: false as const, error: "User not found" };
        }

        let nudgeMessage = input.message || "Your manager wants you to check your matches!";
        if (input.matchId) {
          const match = await db.getMatchById(input.matchId);
          if (match) {
            const lead = await db.getLeadById(match.leadId);
            nudgeMessage = `Your manager wants you to check your match with ${lead?.customerName || "a customer"}`;
          }
        }

        await db.createInAppNotification({
          dealershipId: ctx.dealership.id,
          matchId: input.matchId || null,
          title: "Manager Nudge",
          message: nudgeMessage,
        });

        await db.createActivityLog({
          userId: ctx.user.id,
          dealershipId: ctx.dealership.id,
          action: "manager_nudge",
          metadata: { targetUserId: input.userId, targetName: targetUser.name, matchId: input.matchId },
        });

        return { success: true as const };
      }),

    escalate: managerProcedure
      .input(z.object({ matchId: z.number() }))
      .mutation(async ({ ctx, input }) => {
        const match = await db.getMatchById(input.matchId);
        if (!match) return { success: false as const, error: "Match not found" };
        const lead = await db.getLeadById(match.leadId);
        if (!lead || lead.dealershipId !== ctx.dealership.id) return { success: false as const, error: "Not found" };

        const ageHours = Math.round((Date.now() - new Date(match.createdAt).getTime()) / (1000 * 60 * 60));

        await db.createInAppNotification({
          dealershipId: ctx.dealership.id,
          leadId: lead.id,
          matchId: match.id,
          title: "CRITICAL: Manager Escalation",
          message: `Manager escalated: ${lead.customerName} match (${ageHours}h old). Respond immediately!`,
        });

        await db.createActivityLog({
          userId: ctx.user.id,
          dealershipId: ctx.dealership.id,
          action: "manager_escalation",
          metadata: { matchId: input.matchId, leadName: lead.customerName, ageHours },
        });

        return { success: true as const };
      }),
  }),

  // ─── Analytics & Reporting (E12) ───
  analytics: router({
    team: ownerProcedure.query(async ({ ctx }) => {
      return db.getTeamAnalytics(ctx.dealership.id);
    }),

    dealershipKpis: managerProcedure
      .input(z.object({ days: z.number().min(1).max(365).default(30) }).optional())
      .query(async ({ ctx, input }) => {
        const days = input?.days || 30;
        const since = Date.now() - days * 24 * 60 * 60 * 1000;
        const raw = await db.getAllDealershipMatches(ctx.dealership.id, undefined, 2000);
        const allLeads = await db.getAllDealershipLeads(ctx.dealership.id);
        const inventoryData = await db.getUserInventory(ctx.dealership.id, undefined, 1000);
        const allItems = inventoryData || [];

        const periodMatches = raw.filter((e: any) => new Date((e.match as any)?.createdAt || 0).getTime() >= since);
        const total = periodMatches.length;
        const contacted = periodMatches.filter((e: any) => ["contacted", "appointment", "sold"].includes((e.match as any)?.status)).length;
        const sold = periodMatches.filter((e: any) => (e.match as any)?.status === "sold").length;
        const activeLeadCount = allLeads.filter((l: any) => !["sold", "lost", "inactive"].includes(l.status)).length;
        const inStockCount = allItems.filter((i: any) => i.status === "in_stock").length;

        return {
          totalMatches: total,
          contactedCount: contacted,
          contactedPct: total > 0 ? Math.round((contacted / total) * 100) : 0,
          dealsClosed: sold,
          activeLeads: activeLeadCount,
          activeInventory: inStockCount,
          days,
        };
      }),

    roi: managerProcedure
      .input(z.object({
        days: z.number().min(1).max(365).default(30),
        avgGrossProfit: z.number().default(7500),
        monthlyCost: z.number().default(500),
      }).optional())
      .query(async ({ ctx, input }) => {
        const days = input?.days || 30;
        const avgGross = input?.avgGrossProfit || 7500;
        const cost = input?.monthlyCost || 500;
        const since = Date.now() - days * 24 * 60 * 60 * 1000;
        const raw = await db.getAllDealershipMatches(ctx.dealership.id, undefined, 2000);
        const sold = raw.filter((e: any) => {
          const m = e.match as any;
          return m?.status === "sold" && new Date(m.createdAt).getTime() >= since;
        }).length;

        const recoveredGross = sold * avgGross;
        const roiMultiple = cost > 0 ? Math.round((recoveredGross / cost) * 10) / 10 : 0;

        return {
          dealsClosed: sold,
          avgGrossProfit: avgGross,
          recoveredGross,
          monthlyCost: cost,
          roiMultiple,
          days,
        };
      }),

    leaderboard: managerProcedure
      .input(z.object({ days: z.number().min(1).max(365).default(30) }).optional())
      .query(async ({ ctx, input }) => {
        const days = input?.days || 30;
        const since = Date.now() - days * 24 * 60 * 60 * 1000;
        const teamMembers = await db.getUsersByDealershipId(ctx.dealership.id);
        const allLeads = await db.getAllDealershipLeads(ctx.dealership.id);
        const raw = await db.getAllDealershipMatches(ctx.dealership.id, undefined, 2000);
        const allMatches = raw.map((r: any) => ({ ...r.match, leadId: (r.match as any)?.leadId }));

        const board = teamMembers.map((member: any) => {
          const memberLeads = allLeads.filter((l: any) => l.userId === member.id);
          const recentLeads = memberLeads.filter((l: any) => new Date(l.createdAt).getTime() >= since);
          const memberLeadIds = new Set(memberLeads.map((l: any) => l.id));
          const memberMatches = allMatches.filter((m: any) => memberLeadIds.has(m.leadId));
          const recentMatches = memberMatches.filter((m: any) => new Date(m.createdAt).getTime() >= since);
          const acted = recentMatches.filter((m: any) => ["contacted", "appointment", "sold"].includes(m.status)).length;
          const deals = recentMatches.filter((m: any) => m.status === "sold").length;
          const responseRate = recentMatches.length > 0 ? Math.round((acted / recentMatches.length) * 100) : 0;

          return {
            userId: member.id,
            name: member.name,
            role: member.role,
            leadsCaptured: recentLeads.length,
            matchesReceived: recentMatches.length,
            matchesActed: acted,
            responseRate,
            deals,
          };
        }).sort((a: any, b: any) => b.deals - a.deals || b.responseRate - a.responseRate);

        return { board, days };
      }),
  }),

  // ─── Owner Portal Routes ───
  owner: router({
    dashboard: ownerProcedure.query(async () => {
      return db.getPlatformStats();
    }),

    churnRisk: ownerProcedure.query(async () => {
      const allDealerships = await db.getAllDealerships();
      const now = Date.now();
      const risks = [];

      for (const d of allDealerships) {
        const members = await db.getUsersByDealershipId(d.id);
        const logs = await db.getActivityLogs({ dealershipId: d.id, limit: 1 });
        const lastActivity = logs[0]?.createdAt ? new Date(logs[0].createdAt).getTime() : 0;
        const daysSinceActivity = lastActivity > 0 ? Math.round((now - lastActivity) / (1000 * 60 * 60 * 24)) : 999;

        const stats = await db.getDealershipStats(d.id);
        const activeUsers = members.filter((m: any) => m.isActive && m.lastSignedIn).length;
        const recentLogins = members.filter((m: any) => {
          if (!m.lastSignedIn) return false;
          return (now - new Date(m.lastSignedIn).getTime()) < 3 * 24 * 60 * 60 * 1000;
        }).length;

        let riskLevel: "low" | "medium" | "high" = "low";
        if (daysSinceActivity >= 7 || recentLogins === 0) riskLevel = "high";
        else if (daysSinceActivity >= 3) riskLevel = "medium";

        risks.push({
          dealershipId: d.id,
          name: d.name,
          activeUsers,
          recentLogins,
          daysSinceActivity,
          matchCount: (stats as any)?.inventory || 0,
          riskLevel,
        });
      }

      return risks.sort((a: any, b: any) => {
        const order: Record<string, number> = { high: 0, medium: 1, low: 2 };
        return (order[a.riskLevel] ?? 2) - (order[b.riskLevel] ?? 2);
      });
    }),

    dealerships: router({
      list: ownerProcedure.query(async () => {
        const allDealerships = await db.getAllDealerships();
        const result = await Promise.all(
          allDealerships.map(async (d: any) => {
            const stats = await db.getDealershipStats(d.id);
            return { ...d, stats };
          })
        );
        return result;
      }),

      create: ownerProcedure
        .input(
          z.object({
            name: z.string().min(1).max(255),
            email: z.string().email().optional(),
            phone: z.string().optional(),
            address: z.string().optional(),
            websiteUrl: z.string().optional(),
            emailDomain: z.string().optional(),
          })
        )
        .mutation(async ({ input }) => {
          if (input.emailDomain) {
            const existing = await db.getDealershipByDomain(input.emailDomain.toLowerCase());
            if (existing) {
              return { success: false as const, error: "Email domain already claimed" };
            }
          }
          const dealership = await db.createDealership({
            name: input.name,
            username: input.name.toLowerCase().replace(/\s+/g, "-") + "-" + Date.now().toString(36),
            passwordHash: "OWNER_CREATED",
            emailDomain: input.emailDomain?.toLowerCase() || null,
            email: input.email,
            phone: input.phone,
            address: input.address,
            websiteUrl: input.websiteUrl,
          });
          return { success: true as const, dealership };
        }),

      getById: ownerProcedure
        .input(z.object({ id: z.number() }))
        .query(async ({ input }) => {
          const dealership = await db.getDealershipById(input.id);
          if (!dealership) return null;
          const stats = await db.getDealershipStats(input.id);
          const members = await db.getAllUsers(input.id);
          return { ...dealership, stats, members };
        }),
    }),

    users: router({
      list: ownerProcedure
        .input(z.object({ dealershipId: z.number().optional() }).optional())
        .query(async ({ input }) => {
          const allUsers = await db.getAllUsers(input?.dealershipId);
          // Enrich with dealership name
          const dealershipCache: Record<number, string> = {};
          const result = await Promise.all(
            allUsers.map(async (u) => {
              let dealershipName: string | null = null;
              if (u.dealershipId) {
                if (!dealershipCache[u.dealershipId]) {
                  const d = await db.getDealershipById(u.dealershipId);
                  dealershipCache[u.dealershipId] = d?.name || "Unknown";
                }
                dealershipName = dealershipCache[u.dealershipId];
              }
              return {
                id: u.id,
                name: u.name,
                email: u.email,
                role: u.role,
                isActive: u.isActive,
                dealershipId: u.dealershipId,
                dealershipName,
                lastSignedIn: u.lastSignedIn,
                createdAt: u.createdAt,
              };
            })
          );
          return result;
        }),

      create: ownerProcedure
        .input(
          z.object({
            name: z.string().min(1).max(255),
            email: z.string().email(),
            password: passwordSchema,
            dealershipId: z.number(),
            role: z.enum(["salesperson", "manager", "admin"]),
          })
        )
        .mutation(async ({ input }) => {
          const existing = await db.getUserByEmail(input.email);
          if (existing) {
            return { success: false as const, error: "Email already in use" };
          }
          const passwordHash = await bcrypt.hash(input.password, 10);
          const user = await db.createUser({
            email: input.email,
            passwordHash,
            name: input.name,
            dealershipId: input.dealershipId,
            role: input.role,
          });
          return { success: true as const, user };
        }),

      updateRole: ownerProcedure
        .input(
          z.object({
            userId: z.number(),
            role: z.enum(["salesperson", "manager", "admin"]),
          })
        )
        .mutation(async ({ input }) => {
          await db.updateUser(input.userId, { role: input.role } as any);
          return { success: true as const };
        }),

      deactivate: ownerProcedure
        .input(z.object({ userId: z.number() }))
        .mutation(async ({ input }) => {
          const user = await db.getUserById(input.userId);
          if (!user) return { success: false as const, error: "User not found" };
          await db.updateUser(input.userId, { isActive: !user.isActive } as any);
          return { success: true as const, isActive: !user.isActive };
        }),
    }),

    inventory: router({
      import: ownerProcedure
        .input(
          z.object({
            dealershipId: z.number(),
            items: z.array(
              z.object({
                unitId: z.string().min(1),
                year: z.number().min(1900).max(2100),
                make: z.string().min(1),
                model: z.string().min(1),
                vin: z.string().optional().nullable(),
                length: z.string().optional().nullable(),
                weight: z.string().optional().nullable(),
                bedType: z.string().optional().nullable(),
                amenities: z.array(z.string()).optional().nullable(),
                bathrooms: z.string().optional().nullable(),
                price: z.string().optional().nullable(),
                storeLocation: z.string().min(1),
                arrivalDate: z.string(),
              })
            ),
          })
        )
        .mutation(async ({ input }) => {
          const items = input.items.map((item) => ({
            dealershipId: input.dealershipId,
            ...item,
            arrivalDate: new Date(item.arrivalDate),
            status: "in_stock" as const,
          }));
          const result = await db.bulkCreateInventory(items);
          return { success: true as const, imported: result.length };
        }),
    }),

    activity: router({
      list: ownerProcedure
        .input(
          z.object({
            userId: z.number().optional(),
            dealershipId: z.number().optional(),
            action: z.string().optional(),
            limit: z.number().min(1).max(100).default(50),
            offset: z.number().default(0),
          }).optional()
        )
        .query(async ({ input }) => {
          const logs = await db.getActivityLogs({
            userId: input?.userId,
            dealershipId: input?.dealershipId,
            action: input?.action,
            limit: input?.limit || 50,
            offset: input?.offset || 0,
          });
          // Enrich with user names
          const userCache: Record<number, string> = {};
          const enriched = await Promise.all(
            logs.map(async (log) => {
              if (!userCache[log.userId]) {
                const u = await db.getUserById(log.userId);
                userCache[log.userId] = u?.name || "Unknown";
              }
              return { ...log, userName: userCache[log.userId] };
            })
          );
          return enriched;
        }),

      sessions: ownerProcedure
        .input(
          z.object({
            dealershipId: z.number().optional(),
            days: z.number().min(1).max(90).default(7),
          }).optional()
        )
        .query(async ({ input }) => {
          const since = new Date();
          since.setDate(since.getDate() - (input?.days || 7));
          const stats = await db.getSessionStats({
            dealershipId: input?.dealershipId,
            since,
          });
          // Enrich with user names
          const userCache: Record<number, string> = {};
          const enriched = await Promise.all(
            stats.map(async (s) => {
              if (!userCache[s.userId]) {
                const u = await db.getUserById(s.userId);
                userCache[s.userId] = u?.name || "Unknown";
              }
              return { ...s, userName: userCache[s.userId] };
            })
          );
          return enriched;
        }),
    }),
  }),
});

export type AppRouter = typeof appRouter;
