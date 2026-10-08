import { z } from "zod";
import {
  clearSessionCookie,
  changePassword,
  createEmailAccount,
  signInWithPassword,
} from "./auth/emailPassword";
import {
  listPhotoHistory,
  renamePhoto,
  setPhotoFavorite,
  softRemovePhoto,
} from "./library";
import { publicProcedure, protectedProcedure, router } from "./_core/trpc";
import { systemRouter } from "./_core/systemRouter";

const credentials = z.object({
  email: z.string().email().max(320),
  password: z.string().min(12).max(128),
});

export const appRouter = router({
  system: systemRouter,
  auth: router({
    me: publicProcedure.query(({ ctx }) =>
      ctx.user
        ? {
            id: ctx.user.id,
            email: ctx.user.email,
            name: ctx.user.name,
            role: ctx.user.role,
          }
        : null
    ),
    register: publicProcedure
      .input(credentials)
      .mutation(({ ctx, input }) =>
        createEmailAccount(ctx.req, ctx.res, input.email, input.password)
      ),
    login: publicProcedure
      .input(credentials)
      .mutation(({ ctx, input }) =>
        signInWithPassword(ctx.req, ctx.res, input.email, input.password)
      ),
    changePassword: protectedProcedure
      .input(
        z.object({
          currentPassword: z.string().min(1).max(128),
          newPassword: z.string().min(12).max(128),
        })
      )
      .mutation(({ ctx, input }) =>
        changePassword(
          ctx.req,
          ctx.res,
          ctx.user,
          input.currentPassword,
          input.newPassword
        )
      ),
    logout: publicProcedure.mutation(({ ctx }) => {
      clearSessionCookie(ctx.req, ctx.res);
      return { success: true as const };
    }),
  }),
  library: router({
    list: protectedProcedure
      .input(
        z.object({
          search: z.string().max(100).optional(),
          sort: z.enum(["newest", "oldest"]).default("newest"),
          favoritesOnly: z.boolean().default(false),
        })
      )
      .query(({ ctx, input }) => listPhotoHistory(ctx.user.id, input)),
    rename: protectedProcedure
      .input(
        z.object({ id: z.string().uuid(), title: z.string().min(1).max(160) })
      )
      .mutation(({ ctx, input }) =>
        renamePhoto(ctx.user.id, input.id, input.title)
      ),
    favorite: protectedProcedure
      .input(z.object({ id: z.string().uuid(), favorite: z.boolean() }))
      .mutation(({ ctx, input }) =>
        setPhotoFavorite(ctx.user.id, input.id, input.favorite)
      ),
    remove: protectedProcedure
      .input(z.object({ id: z.string().uuid() }))
      .mutation(({ ctx, input }) => softRemovePhoto(ctx.user.id, input.id)),
  }),
});

export type AppRouter = typeof appRouter;
