import {
  bigint,
  char,
  date,
  integer,
  pgTable,
  primaryKey,
  text,
  timestamp,
  uuid,
  varchar,
} from "drizzle-orm/pg-core";

const createdAt = () => timestamp("created_at", { withTimezone: true }).defaultNow().notNull();
const updatedAt = () => timestamp("updated_at", { withTimezone: true }).defaultNow().notNull();

export const users = pgTable("ev_users", {
  id: uuid("id").defaultRandom().primaryKey(),
  identitySubject: varchar("identity_subject", { length: 191 }).notNull().unique(),
  displayName: varchar("display_name", { length: 120 }).notNull(),
  createdAt: createdAt(),
  updatedAt: updatedAt(),
  deletedAt: timestamp("deleted_at", { withTimezone: true }),
});

export const appSessions = pgTable("ev_app_sessions", {
  id: uuid("id").defaultRandom().primaryKey(),
  userId: uuid("user_id").notNull().references(() => users.id, { onDelete: "cascade" }),
  tokenHash: char("token_hash", { length: 64 }).notNull().unique(),
  expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),
  createdAt: createdAt(),
  revokedAt: timestamp("revoked_at", { withTimezone: true }),
});

export const vaultItems = pgTable("ev_vault_items", {
  id: uuid("id").defaultRandom().primaryKey(),
  userId: uuid("user_id").notNull().references(() => users.id, { onDelete: "cascade" }),
  title: varchar("title", { length: 120 }).notNull(),
  category: varchar("category", { length: 40 }).notNull(),
  merchantName: varchar("merchant_name", { length: 120 }).notNull(),
  purchaseOrStartDate: date("purchase_or_start_date").notNull(),
  amount: bigint("amount", { mode: "number" }),
  currency: char("currency", { length: 3 }).default("KRW").notNull(),
  description: text("description"),
  status: varchar("status", { length: 24 }).default("active").notNull(),
  createdAt: createdAt(),
  updatedAt: updatedAt(),
});

export const deadlines = pgTable("ev_deadlines", {
  id: uuid("id").defaultRandom().primaryKey(),
  vaultItemId: uuid("vault_item_id").notNull().references(() => vaultItems.id, { onDelete: "cascade" }),
  type: varchar("type", { length: 40 }).notNull(),
  dueDate: date("due_date").notNull(),
  sourceType: varchar("source_type", { length: 40 }).notNull(),
  sourceNote: varchar("source_note", { length: 500 }),
  reminderState: varchar("reminder_state", { length: 24 }).default("active").notNull(),
  createdAt: createdAt(),
  updatedAt: updatedAt(),
});

export const evidenceEvents = pgTable("ev_evidence_events", {
  id: uuid("id").defaultRandom().primaryKey(),
  vaultItemId: uuid("vault_item_id").notNull().references(() => vaultItems.id, { onDelete: "cascade" }),
  createdByUserId: uuid("created_by_user_id").notNull().references(() => users.id, { onDelete: "cascade" }),
  occurredOn: date("occurred_on").notNull(),
  eventType: varchar("event_type", { length: 40 }).notNull(),
  title: varchar("title", { length: 120 }).notNull(),
  note: text("note"),
  createdAt: createdAt(),
  updatedAt: updatedAt(),
});

export const evidenceFiles = pgTable("ev_evidence_files", {
  id: uuid("id").defaultRandom().primaryKey(),
  userId: uuid("user_id").notNull().references(() => users.id, { onDelete: "cascade" }),
  vaultItemId: uuid("vault_item_id").notNull().references(() => vaultItems.id, { onDelete: "cascade" }),
  evidenceEventId: uuid("evidence_event_id").references(() => evidenceEvents.id, { onDelete: "set null" }),
  storageKey: varchar("storage_key", { length: 500 }).notNull().unique(),
  originalFilename: varchar("original_filename", { length: 255 }).notNull(),
  mimeType: varchar("mime_type", { length: 100 }).notNull(),
  byteSize: bigint("byte_size", { mode: "number" }).notNull(),
  sha256: char("sha256", { length: 64 }).notNull(),
  redactionState: varchar("redaction_state", { length: 24 }).default("unreviewed").notNull(),
  uploadedAt: timestamp("uploaded_at", { withTimezone: true }).defaultNow().notNull(),
  deletedAt: timestamp("deleted_at", { withTimezone: true }),
});

export const cases = pgTable("ev_cases", {
  id: uuid("id").defaultRandom().primaryKey(),
  vaultItemId: uuid("vault_item_id").notNull().references(() => vaultItems.id, { onDelete: "cascade" }),
  caseType: varchar("case_type", { length: 40 }).notNull(),
  openedAt: timestamp("opened_at", { withTimezone: true }).defaultNow().notNull(),
  closedAt: timestamp("closed_at", { withTimezone: true }),
  userSummary: text("user_summary"),
  status: varchar("status", { length: 24 }).default("open").notNull(),
});

export const caseEvidenceLinks = pgTable(
  "ev_case_evidence_links",
  {
    caseId: uuid("case_id").notNull().references(() => cases.id, { onDelete: "cascade" }),
    evidenceFileId: uuid("evidence_file_id").notNull().references(() => evidenceFiles.id, { onDelete: "cascade" }),
  },
  (table) => [primaryKey({ columns: [table.caseId, table.evidenceFileId] })],
);

export const exportPackets = pgTable("ev_export_packets", {
  id: uuid("id").defaultRandom().primaryKey(),
  caseId: uuid("case_id").notNull().references(() => cases.id, { onDelete: "cascade" }),
  requestedByUserId: uuid("requested_by_user_id").notNull().references(() => users.id, { onDelete: "cascade" }),
  generatedAt: timestamp("generated_at", { withTimezone: true }),
  storageKey: varchar("storage_key", { length: 500 }),
  manifestHash: char("manifest_hash", { length: 64 }),
  status: varchar("status", { length: 24 }).default("queued").notNull(),
  expiresAt: timestamp("expires_at", { withTimezone: true }),
  createdAt: createdAt(),
});

export const deletionJobs = pgTable("ev_deletion_jobs", {
  id: uuid("id").defaultRandom().primaryKey(),
  userId: uuid("user_id").notNull().references(() => users.id, { onDelete: "cascade" }),
  kind: varchar("kind", { length: 40 }).notNull(),
  targetId: uuid("target_id").notNull(),
  status: varchar("status", { length: 24 }).default("queued").notNull(),
  attempts: integer("attempts").default(0).notNull(),
  lastErrorCode: varchar("last_error_code", { length: 80 }),
  createdAt: createdAt(),
  updatedAt: updatedAt(),
});
