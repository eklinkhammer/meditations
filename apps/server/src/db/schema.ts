import {
  pgTable,
  uuid,
  varchar,
  text,
  integer,
  boolean,
  timestamp,
  jsonb,
  index,
} from 'drizzle-orm/pg-core';
import { relations } from 'drizzle-orm';

// ---------------------------------------------------------------------------
// users
// ---------------------------------------------------------------------------
export const users = pgTable(
  'users',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    email: varchar('email', { length: 255 }).notNull().unique(),
    displayName: varchar('display_name', { length: 100 }),
    role: varchar('role', { length: 20 }).notNull().default('user'),
    authProvider: varchar('auth_provider', { length: 50 }).notNull(),
    creditsBalance: integer('credits_balance').notNull().default(0),
    isPremium: boolean('is_premium').notNull().default(false),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    index('users_email_idx').on(table.email),
  ],
);

// ---------------------------------------------------------------------------
// creditTransactions
// ---------------------------------------------------------------------------
export const creditTransactions = pgTable(
  'credit_transactions',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    userId: uuid('user_id')
      .notNull()
      .references(() => users.id),
    amount: integer('amount').notNull(),
    type: varchar('type', { length: 30 }).notNull(),
    stripePaymentId: varchar('stripe_payment_id', { length: 255 }),
    iapReceiptId: varchar('iap_receipt_id', { length: 255 }),
    description: text('description'),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    index('credit_transactions_user_id_idx').on(table.userId),
    index('credit_transactions_type_idx').on(table.type),
  ],
);

// ---------------------------------------------------------------------------
// ambientSounds
// ---------------------------------------------------------------------------
export const ambientSounds = pgTable('ambient_sounds', {
  id: uuid('id').primaryKey().defaultRandom(),
  name: varchar('name', { length: 100 }).notNull(),
  storageKey: varchar('storage_key', { length: 500 }).notNull(),
  category: varchar('category', { length: 50 }).notNull(),
  isLoopable: boolean('is_loopable').notNull().default(true),
});

// ---------------------------------------------------------------------------
// musicTracks
// ---------------------------------------------------------------------------
export const musicTracks = pgTable('music_tracks', {
  id: uuid('id').primaryKey().defaultRandom(),
  name: varchar('name', { length: 100 }).notNull(),
  storageKey: varchar('storage_key', { length: 500 }).notNull(),
  mood: varchar('mood', { length: 50 }).notNull(),
  licenseType: varchar('license_type', { length: 50 }).notNull(),
});

// ---------------------------------------------------------------------------
// videos
// ---------------------------------------------------------------------------
export const videos = pgTable(
  'videos',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    userId: uuid('user_id')
      .notNull()
      .references(() => users.id),
    title: varchar('title', { length: 200 }).notNull(),
    storageKey: varchar('storage_key', { length: 500 }).notNull(),
    thumbnailKey: varchar('thumbnail_key', { length: 500 }),
    durationSeconds: integer('duration_seconds').notNull(),
    visibility: varchar('visibility', { length: 20 }).notNull().default('pending_review'),
    moderationStatus: varchar('moderation_status', { length: 20 }).notNull().default('pending'),
    visualPrompt: text('visual_prompt'),
    tags: text('tags').array().default([]),
    viewCount: integer('view_count').notNull().default(0),
    likeCount: integer('like_count').notNull().default(0),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    index('videos_user_id_idx').on(table.userId),
    index('videos_visibility_idx').on(table.visibility),
    index('videos_moderation_status_idx').on(table.moderationStatus),
  ],
);

// ---------------------------------------------------------------------------
// generationRequests
// ---------------------------------------------------------------------------
export const generationRequests = pgTable(
  'generation_requests',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    userId: uuid('user_id')
      .notNull()
      .references(() => users.id),
    status: varchar('status', { length: 30 }).notNull().default('pending'),
    visualPrompt: text('visual_prompt').notNull(),
    scriptType: varchar('script_type', { length: 20 }).notNull(),
    scriptContent: text('script_content'),
    durationSeconds: integer('duration_seconds').notNull(),
    ambientSoundId: uuid('ambient_sound_id').references(() => ambientSounds.id),
    musicTrackId: uuid('music_track_id').references(() => musicTracks.id),
    videoProvider: varchar('video_provider', { length: 50 }),
    voiceProvider: varchar('voice_provider', { length: 50 }),
    creditsCharged: integer('credits_charged').notNull().default(0),
    progress: integer('progress').notNull().default(0),
    videoId: uuid('video_id').references(() => videos.id),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    index('generation_requests_user_id_idx').on(table.userId),
    index('generation_requests_status_idx').on(table.status),
    index('generation_requests_video_id_idx').on(table.videoId),
  ],
);

// ---------------------------------------------------------------------------
// scriptTemplates
// ---------------------------------------------------------------------------
export const scriptTemplates = pgTable('script_templates', {
  id: uuid('id').primaryKey().defaultRandom(),
  title: varchar('title', { length: 200 }).notNull(),
  category: varchar('category', { length: 50 }).notNull(),
  scriptText: text('script_text').notNull(),
  durationHint: integer('duration_hint').notNull(),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
});

// ---------------------------------------------------------------------------
// pricingConfig
// ---------------------------------------------------------------------------
export const pricingConfig = pgTable('pricing_config', {
  id: uuid('id').primaryKey().defaultRandom(),
  key: varchar('key', { length: 100 }).notNull().unique(),
  value: jsonb('value').notNull(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
});

// ---------------------------------------------------------------------------
// pushTokens
// ---------------------------------------------------------------------------
export const pushTokens = pgTable(
  'push_tokens',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    userId: uuid('user_id')
      .notNull()
      .references(() => users.id),
    token: varchar('token', { length: 500 }).notNull().unique(),
    platform: varchar('platform', { length: 20 }).notNull(),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    index('push_tokens_user_id_idx').on(table.userId),
  ],
);

// ===========================================================================
// Relations
// ===========================================================================

export const usersRelations = relations(users, ({ many }) => ({
  creditTransactions: many(creditTransactions),
  generationRequests: many(generationRequests),
  videos: many(videos),
  pushTokens: many(pushTokens),
}));

export const creditTransactionsRelations = relations(creditTransactions, ({ one }) => ({
  user: one(users, {
    fields: [creditTransactions.userId],
    references: [users.id],
  }),
}));

export const generationRequestsRelations = relations(generationRequests, ({ one }) => ({
  user: one(users, {
    fields: [generationRequests.userId],
    references: [users.id],
  }),
  ambientSound: one(ambientSounds, {
    fields: [generationRequests.ambientSoundId],
    references: [ambientSounds.id],
  }),
  musicTrack: one(musicTracks, {
    fields: [generationRequests.musicTrackId],
    references: [musicTracks.id],
  }),
  video: one(videos, {
    fields: [generationRequests.videoId],
    references: [videos.id],
  }),
}));

export const videosRelations = relations(videos, ({ one, many }) => ({
  user: one(users, {
    fields: [videos.userId],
    references: [users.id],
  }),
  generationRequests: many(generationRequests),
}));

export const ambientSoundsRelations = relations(ambientSounds, ({ many }) => ({
  generationRequests: many(generationRequests),
}));

export const musicTracksRelations = relations(musicTracks, ({ many }) => ({
  generationRequests: many(generationRequests),
}));

export const pushTokensRelations = relations(pushTokens, ({ one }) => ({
  user: one(users, {
    fields: [pushTokens.userId],
    references: [users.id],
  }),
}));
