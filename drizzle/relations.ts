import { relations } from "drizzle-orm";
import { passwordCredentials, photoHistory, users } from "./schema";

export const usersRelations = relations(users, ({ many, one }) => ({
  passwordCredential: one(passwordCredentials, {
    fields: [users.id],
    references: [passwordCredentials.userId],
  }),
  photoHistory: many(photoHistory),
}));

export const passwordCredentialsRelations = relations(
  passwordCredentials,
  ({ one }) => ({
    user: one(users, {
      fields: [passwordCredentials.userId],
      references: [users.id],
    }),
  })
);

export const photoHistoryRelations = relations(photoHistory, ({ one }) => ({
  owner: one(users, {
    fields: [photoHistory.userId],
    references: [users.id],
  }),
}));
