-- Prospecta CRM - initial PostgreSQL schema.
-- Besides Prisma-managed objects, this migration intentionally contains
-- database-level guards for tenant isolation, immutable history and funnel rules.

CREATE EXTENSION IF NOT EXISTS "pgcrypto";
CREATE EXTENSION IF NOT EXISTS "pg_trgm";

CREATE TYPE "user_role" AS ENUM ('ADMIN', 'MANAGER', 'COLLABORATOR');
CREATE TYPE "user_status" AS ENUM ('ACTIVE', 'INACTIVE', 'INVITED', 'LOCKED');
CREATE TYPE "permission" AS ENUM (
  'LEAD_VIEW_ALL', 'LEAD_VIEW_PHONE', 'LEAD_EDIT', 'LEAD_EXPORT', 'LEAD_ASSIGN',
  'LEAD_DELETE', 'ACTIVITY_CORRECT', 'PIPELINE_MANAGE', 'TEAM_MANAGE',
  'IMPORT_MANAGE', 'DASHBOARD_TEAM', 'AUDIT_VIEW', 'SETTINGS_MANAGE',
  'DO_NOT_CONTACT_OVERRIDE'
);
CREATE TYPE "permission_effect" AS ENUM ('ALLOW', 'DENY');
CREATE TYPE "goal_period" AS ENUM ('DAILY', 'WEEKLY', 'MONTHLY');
CREATE TYPE "lead_priority" AS ENUM ('LOW', 'NORMAL', 'HIGH', 'URGENT');
CREATE TYPE "lead_temperature" AS ENUM ('COLD', 'WARM', 'HOT');
CREATE TYPE "return_status" AS ENUM ('YES', 'NO', 'WAITING');
CREATE TYPE "assignment_reason" AS ENUM ('IMPORT', 'MANUAL', 'BULK', 'ROUND_ROBIN', 'REASSIGNMENT', 'UNASSIGNMENT');
CREATE TYPE "activity_type" AS ENUM ('CONTACT_ATTEMPT', 'CONTACT_RESPONSE', 'NOTE', 'MEETING', 'PROPOSAL', 'SALE', 'CORRECTION', 'SYSTEM');
CREATE TYPE "contact_channel" AS ENUM ('WHATSAPP', 'PHONE', 'EMAIL', 'INSTAGRAM', 'OTHER');
CREATE TYPE "activity_direction" AS ENUM ('OUTBOUND', 'INBOUND');
CREATE TYPE "contact_outcome" AS ENUM (
  'SENT', 'NO_ANSWER', 'CONNECTED', 'REPLIED', 'INVALID_CONTACT', 'INTERESTED',
  'NOT_INTERESTED', 'MEETING_BOOKED', 'PROPOSAL_SENT', 'WON', 'LOST', 'OTHER'
);
CREATE TYPE "task_status" AS ENUM ('OPEN', 'COMPLETED', 'CANCELED');
CREATE TYPE "import_status" AS ENUM ('PENDING', 'PREVIEWING', 'READY', 'PROCESSING', 'COMPLETED', 'COMPLETED_WITH_ERRORS', 'FAILED', 'CANCELED');
CREATE TYPE "import_row_status" AS ENUM ('PENDING', 'CREATED', 'UPDATED', 'DUPLICATE_SKIPPED', 'INVALID', 'FAILED');
CREATE TYPE "duplicate_strategy" AS ENUM ('SKIP', 'FILL_EMPTY', 'UPDATE_SOURCE');
CREATE TYPE "import_assignment_strategy" AS ENUM ('UNASSIGNED', 'SINGLE_USER', 'ROUND_ROBIN');
CREATE TYPE "legal_basis" AS ENUM ('LEGITIMATE_INTEREST', 'CONSENT', 'CONTRACT', 'LEGAL_OBLIGATION', 'NOT_DEFINED');
CREATE TYPE "privacy_event_type" AS ENUM (
  'LEGAL_BASIS_RECORDED', 'CONSENT_GRANTED', 'CONSENT_WITHDRAWN',
  'DO_NOT_CONTACT_REQUESTED', 'DO_NOT_CONTACT_RELEASED', 'DATA_EXPORTED',
  'DATA_ANONYMIZED'
);
CREATE TYPE "data_subject_request_type" AS ENUM ('ACCESS', 'CORRECTION', 'EXPORT', 'ANONYMIZATION', 'DELETION', 'BLOCK_CONTACT');
CREATE TYPE "data_subject_request_status" AS ENUM ('OPEN', 'IN_REVIEW', 'COMPLETED', 'REJECTED', 'CANCELED');
CREATE TYPE "audit_action" AS ENUM (
  'CREATE', 'UPDATE', 'ARCHIVE', 'ASSIGN', 'REASSIGN', 'STAGE_CHANGE', 'IMPORT',
  'EXPORT', 'LOGIN', 'LOGIN_FAILED', 'PASSWORD_RESET', 'PERMISSION_CHANGE',
  'PRIVACY_CHANGE'
);

CREATE TABLE "organizations" (
  "id" UUID NOT NULL DEFAULT gen_random_uuid(),
  "name" VARCHAR(160) NOT NULL,
  "slug" VARCHAR(100) NOT NULL,
  "is_active" BOOLEAN NOT NULL DEFAULT true,
  "timezone" VARCHAR(64) NOT NULL DEFAULT 'America/Sao_Paulo',
  "data_retention_days" INTEGER NOT NULL DEFAULT 730,
  "privacy_contact_email" VARCHAR(320),
  "max_csv_upload_bytes" INTEGER NOT NULL DEFAULT 10485760,
  "settings" JSONB NOT NULL DEFAULT '{}'::jsonb,
  "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "organizations_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "organizations_slug_key" UNIQUE ("slug"),
  CONSTRAINT "organizations_retention_check" CHECK ("data_retention_days" >= 0),
  CONSTRAINT "organizations_upload_limit_check" CHECK ("max_csv_upload_bytes" BETWEEN 1024 AND 52428800)
);

CREATE TABLE "users" (
  "id" UUID NOT NULL DEFAULT gen_random_uuid(),
  "organization_id" UUID NOT NULL,
  "name" VARCHAR(160) NOT NULL,
  "email" VARCHAR(320) NOT NULL,
  "password_hash" VARCHAR(255) NOT NULL,
  "role" "user_role" NOT NULL DEFAULT 'COLLABORATOR',
  "status" "user_status" NOT NULL DEFAULT 'ACTIVE',
  "phone" VARCHAR(32),
  "avatar_url" TEXT,
  "max_active_leads" INTEGER,
  "last_login_at" TIMESTAMPTZ(3),
  "last_seen_at" TIMESTAMPTZ(3),
  "password_changed_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "failed_login_attempts" INTEGER NOT NULL DEFAULT 0,
  "locked_until" TIMESTAMPTZ(3),
  "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "users_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "users_email_key" UNIQUE ("email"),
  CONSTRAINT "users_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "organizations"("id") ON DELETE RESTRICT,
  CONSTRAINT "users_name_check" CHECK (length(btrim("name")) > 0),
  CONSTRAINT "users_email_lowercase_check" CHECK ("email" = lower(btrim("email"))),
  CONSTRAINT "users_failed_login_attempts_check" CHECK ("failed_login_attempts" >= 0),
  CONSTRAINT "users_max_active_leads_check" CHECK ("max_active_leads" IS NULL OR "max_active_leads" >= 0)
);

CREATE INDEX "users_organization_id_status_idx" ON "users"("organization_id", "status");
CREATE INDEX "users_organization_id_role_idx" ON "users"("organization_id", "role");

CREATE TABLE "sessions" (
  "id" UUID NOT NULL DEFAULT gen_random_uuid(),
  "organization_id" UUID NOT NULL,
  "user_id" UUID NOT NULL,
  "token_hash" CHAR(64) NOT NULL,
  "expires_at" TIMESTAMPTZ(3) NOT NULL,
  "last_seen_at" TIMESTAMPTZ(3),
  "revoked_at" TIMESTAMPTZ(3),
  "ip_address" VARCHAR(64),
  "user_agent" TEXT,
  "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "sessions_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "sessions_token_hash_key" UNIQUE ("token_hash"),
  CONSTRAINT "sessions_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "organizations"("id") ON DELETE RESTRICT,
  CONSTRAINT "sessions_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE,
  CONSTRAINT "sessions_token_hash_check" CHECK ("token_hash" ~ '^[0-9a-f]{64}$')
);

CREATE INDEX "sessions_user_id_expires_at_idx" ON "sessions"("user_id", "expires_at");
CREATE INDEX "sessions_organization_id_expires_at_idx" ON "sessions"("organization_id", "expires_at");

CREATE TABLE "password_reset_tokens" (
  "id" UUID NOT NULL DEFAULT gen_random_uuid(),
  "organization_id" UUID NOT NULL,
  "user_id" UUID NOT NULL,
  "token_hash" CHAR(64) NOT NULL,
  "expires_at" TIMESTAMPTZ(3) NOT NULL,
  "used_at" TIMESTAMPTZ(3),
  "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "password_reset_tokens_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "password_reset_tokens_token_hash_key" UNIQUE ("token_hash"),
  CONSTRAINT "password_reset_tokens_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "organizations"("id") ON DELETE RESTRICT,
  CONSTRAINT "password_reset_tokens_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE,
  CONSTRAINT "password_reset_tokens_token_hash_check" CHECK ("token_hash" ~ '^[0-9a-f]{64}$')
);

CREATE INDEX "password_reset_tokens_user_id_expires_at_idx" ON "password_reset_tokens"("user_id", "expires_at");

CREATE TABLE "rate_limit_buckets" (
  "id" UUID NOT NULL DEFAULT gen_random_uuid(),
  "organization_id" UUID,
  "scope" VARCHAR(64) NOT NULL,
  "key_hash" CHAR(64) NOT NULL,
  "count" INTEGER NOT NULL DEFAULT 0,
  "window_started_at" TIMESTAMPTZ(3) NOT NULL,
  "blocked_until" TIMESTAMPTZ(3),
  "expires_at" TIMESTAMPTZ(3) NOT NULL,
  "updated_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "rate_limit_buckets_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "rate_limit_buckets_scope_key_hash_key" UNIQUE ("scope", "key_hash"),
  CONSTRAINT "rate_limit_buckets_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "organizations"("id") ON DELETE CASCADE,
  CONSTRAINT "rate_limit_buckets_count_check" CHECK ("count" >= 0),
  CONSTRAINT "rate_limit_buckets_key_hash_check" CHECK ("key_hash" ~ '^[0-9a-f]{64}$'),
  CONSTRAINT "rate_limit_buckets_window_check" CHECK ("expires_at" > "window_started_at")
);

CREATE INDEX "rate_limit_buckets_expires_at_idx" ON "rate_limit_buckets"("expires_at");
CREATE INDEX "rate_limit_buckets_organization_id_scope_idx" ON "rate_limit_buckets"("organization_id", "scope");

CREATE TABLE "user_permission_grants" (
  "id" UUID NOT NULL DEFAULT gen_random_uuid(),
  "organization_id" UUID NOT NULL,
  "user_id" UUID NOT NULL,
  "permission" "permission" NOT NULL,
  "effect" "permission_effect" NOT NULL DEFAULT 'ALLOW',
  "granted_by_id" UUID,
  "granted_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "expires_at" TIMESTAMPTZ(3),
  "note" TEXT,
  CONSTRAINT "user_permission_grants_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "user_permission_grants_user_id_permission_key" UNIQUE ("user_id", "permission"),
  CONSTRAINT "user_permission_grants_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "organizations"("id") ON DELETE RESTRICT,
  CONSTRAINT "user_permission_grants_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE,
  CONSTRAINT "user_permission_grants_granted_by_id_fkey" FOREIGN KEY ("granted_by_id") REFERENCES "users"("id") ON DELETE SET NULL
);

CREATE INDEX "user_permission_grants_organization_id_permission_idx" ON "user_permission_grants"("organization_id", "permission");

CREATE TABLE "user_goals" (
  "id" UUID NOT NULL DEFAULT gen_random_uuid(),
  "organization_id" UUID NOT NULL,
  "user_id" UUID NOT NULL,
  "period" "goal_period" NOT NULL,
  "starts_at" TIMESTAMPTZ(3) NOT NULL,
  "ends_at" TIMESTAMPTZ(3) NOT NULL,
  "target_attempts" INTEGER NOT NULL DEFAULT 0,
  "target_responses" INTEGER NOT NULL DEFAULT 0,
  "target_meetings" INTEGER NOT NULL DEFAULT 0,
  "target_proposals" INTEGER NOT NULL DEFAULT 0,
  "target_wins" INTEGER NOT NULL DEFAULT 0,
  "is_active" BOOLEAN NOT NULL DEFAULT true,
  "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "user_goals_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "user_goals_user_id_period_starts_at_key" UNIQUE ("user_id", "period", "starts_at"),
  CONSTRAINT "user_goals_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "organizations"("id") ON DELETE RESTRICT,
  CONSTRAINT "user_goals_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE,
  CONSTRAINT "user_goals_dates_check" CHECK ("ends_at" > "starts_at"),
  CONSTRAINT "user_goals_targets_check" CHECK (
    "target_attempts" >= 0 AND "target_responses" >= 0 AND "target_meetings" >= 0
    AND "target_proposals" >= 0 AND "target_wins" >= 0
  )
);

CREATE INDEX "user_goals_organization_id_starts_at_ends_at_idx" ON "user_goals"("organization_id", "starts_at", "ends_at");

CREATE TABLE "pipeline_stages" (
  "id" UUID NOT NULL DEFAULT gen_random_uuid(),
  "organization_id" UUID NOT NULL,
  "key" VARCHAR(64) NOT NULL,
  "name" VARCHAR(100) NOT NULL,
  "position" INTEGER NOT NULL,
  "color" VARCHAR(9) NOT NULL DEFAULT '#64748B',
  "rules" JSONB NOT NULL DEFAULT '{}'::jsonb,
  "is_active" BOOLEAN NOT NULL DEFAULT true,
  "is_closed" BOOLEAN NOT NULL DEFAULT false,
  "is_won" BOOLEAN NOT NULL DEFAULT false,
  "is_lost" BOOLEAN NOT NULL DEFAULT false,
  "requires_meeting_at" BOOLEAN NOT NULL DEFAULT false,
  "requires_proposal_at" BOOLEAN NOT NULL DEFAULT false,
  "requires_loss_reason" BOOLEAN NOT NULL DEFAULT false,
  "blocks_contact" BOOLEAN NOT NULL DEFAULT false,
  "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "pipeline_stages_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "pipeline_stages_organization_id_key_key" UNIQUE ("organization_id", "key"),
  CONSTRAINT "pipeline_stages_organization_id_position_key" UNIQUE ("organization_id", "position"),
  CONSTRAINT "pipeline_stages_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "organizations"("id") ON DELETE RESTRICT,
  CONSTRAINT "pipeline_stages_position_check" CHECK ("position" > 0),
  CONSTRAINT "pipeline_stages_color_check" CHECK ("color" ~ '^#[0-9A-Fa-f]{6}([0-9A-Fa-f]{2})?$'),
  CONSTRAINT "pipeline_stages_closed_flags_check" CHECK (NOT "is_won" OR "is_closed"),
  CONSTRAINT "pipeline_stages_lost_flags_check" CHECK (NOT "is_lost" OR "is_closed"),
  CONSTRAINT "pipeline_stages_terminal_check" CHECK (NOT ("is_won" AND "is_lost"))
);

CREATE INDEX "pipeline_stages_organization_id_is_active_position_idx" ON "pipeline_stages"("organization_id", "is_active", "position");

CREATE TABLE "loss_reasons" (
  "id" UUID NOT NULL DEFAULT gen_random_uuid(),
  "organization_id" UUID NOT NULL,
  "name" VARCHAR(120) NOT NULL,
  "description" TEXT,
  "position" INTEGER NOT NULL DEFAULT 0,
  "is_active" BOOLEAN NOT NULL DEFAULT true,
  "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "loss_reasons_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "loss_reasons_organization_id_name_key" UNIQUE ("organization_id", "name"),
  CONSTRAINT "loss_reasons_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "organizations"("id") ON DELETE RESTRICT,
  CONSTRAINT "loss_reasons_name_check" CHECK (length(btrim("name")) > 0),
  CONSTRAINT "loss_reasons_position_check" CHECK ("position" >= 0)
);

CREATE INDEX "loss_reasons_organization_id_is_active_position_idx" ON "loss_reasons"("organization_id", "is_active", "position");

CREATE TABLE "tags" (
  "id" UUID NOT NULL DEFAULT gen_random_uuid(),
  "organization_id" UUID NOT NULL,
  "name" VARCHAR(80) NOT NULL,
  "color" VARCHAR(9) NOT NULL DEFAULT '#64748B',
  "is_system" BOOLEAN NOT NULL DEFAULT false,
  "is_active" BOOLEAN NOT NULL DEFAULT true,
  "created_by_id" UUID,
  "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "tags_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "tags_organization_id_name_key" UNIQUE ("organization_id", "name"),
  CONSTRAINT "tags_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "organizations"("id") ON DELETE RESTRICT,
  CONSTRAINT "tags_created_by_id_fkey" FOREIGN KEY ("created_by_id") REFERENCES "users"("id") ON DELETE SET NULL,
  CONSTRAINT "tags_name_check" CHECK (length(btrim("name")) > 0),
  CONSTRAINT "tags_color_check" CHECK ("color" ~ '^#[0-9A-Fa-f]{6}([0-9A-Fa-f]{2})?$')
);

CREATE INDEX "tags_organization_id_is_active_idx" ON "tags"("organization_id", "is_active");

CREATE TABLE "import_jobs" (
  "id" UUID NOT NULL DEFAULT gen_random_uuid(),
  "organization_id" UUID NOT NULL,
  "created_by_id" UUID NOT NULL,
  "filename" VARCHAR(255) NOT NULL,
  "mime_type" VARCHAR(120) NOT NULL,
  "file_size_bytes" INTEGER NOT NULL,
  "file_sha256" CHAR(64),
  "encoding" VARCHAR(32) NOT NULL DEFAULT 'utf-8',
  "delimiter" CHAR(1) NOT NULL DEFAULT ',',
  "has_header" BOOLEAN NOT NULL DEFAULT true,
  "column_mapping" JSONB NOT NULL DEFAULT '{}'::jsonb,
  "duplicate_strategy" "duplicate_strategy" NOT NULL DEFAULT 'SKIP',
  "assignment_strategy" "import_assignment_strategy" NOT NULL DEFAULT 'UNASSIGNED',
  "assignment_config" JSONB NOT NULL DEFAULT '{}'::jsonb,
  "status" "import_status" NOT NULL DEFAULT 'PENDING',
  "total_rows" INTEGER NOT NULL DEFAULT 0,
  "processed_rows" INTEGER NOT NULL DEFAULT 0,
  "created_rows" INTEGER NOT NULL DEFAULT 0,
  "updated_rows" INTEGER NOT NULL DEFAULT 0,
  "skipped_rows" INTEGER NOT NULL DEFAULT 0,
  "error_rows" INTEGER NOT NULL DEFAULT 0,
  "started_at" TIMESTAMPTZ(3),
  "completed_at" TIMESTAMPTZ(3),
  "failure_message" TEXT,
  "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "import_jobs_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "import_jobs_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "organizations"("id") ON DELETE RESTRICT,
  CONSTRAINT "import_jobs_created_by_id_fkey" FOREIGN KEY ("created_by_id") REFERENCES "users"("id") ON DELETE RESTRICT,
  CONSTRAINT "import_jobs_file_size_check" CHECK ("file_size_bytes" > 0 AND "file_size_bytes" <= 52428800),
  CONSTRAINT "import_jobs_sha_check" CHECK ("file_sha256" IS NULL OR "file_sha256" ~ '^[0-9a-f]{64}$'),
  CONSTRAINT "import_jobs_delimiter_check" CHECK ("delimiter" IN (',', ';')),
  CONSTRAINT "import_jobs_counts_check" CHECK (
    "total_rows" >= 0 AND "processed_rows" >= 0 AND "created_rows" >= 0
    AND "updated_rows" >= 0 AND "skipped_rows" >= 0 AND "error_rows" >= 0
    AND "processed_rows" <= "total_rows"
  )
);

CREATE INDEX "import_jobs_organization_id_created_at_idx" ON "import_jobs"("organization_id", "created_at");
CREATE INDEX "import_jobs_organization_id_status_created_at_idx" ON "import_jobs"("organization_id", "status", "created_at");

CREATE TABLE "leads" (
  "id" UUID NOT NULL DEFAULT gen_random_uuid(),
  "organization_id" UUID NOT NULL,
  "title" VARCHAR(255) NOT NULL,
  "normalized_name" VARCHAR(255) NOT NULL,
  "phone_original" VARCHAR(80),
  "phone_normalized" VARCHAR(20),
  "category_name" VARCHAR(160),
  "categories" TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[],
  "address" TEXT,
  "normalized_address" TEXT,
  "street" VARCHAR(255),
  "neighborhood" VARCHAR(160),
  "city" VARCHAR(160),
  "state" VARCHAR(80),
  "postal_code" VARCHAR(24),
  "country_code" CHAR(2),
  "google_maps_url" TEXT,
  "place_id" VARCHAR(255),
  "cid" VARCHAR(80),
  "business_profile_id" VARCHAR(255),
  "total_score" DECIMAL(3,2),
  "reviews_count" INTEGER,
  "search_string" VARCHAR(255),
  "scraped_at" TIMESTAMPTZ(3),
  "temporarily_closed" BOOLEAN NOT NULL DEFAULT false,
  "permanently_closed" BOOLEAN NOT NULL DEFAULT false,
  "description" TEXT,
  "image_url" TEXT,
  "latitude" DECIMAL(10,7),
  "longitude" DECIMAL(10,7),
  "raw_data" JSONB NOT NULL DEFAULT '{}'::jsonb,
  "assignee_id" UUID,
  "stage_id" UUID NOT NULL,
  "priority" "lead_priority" NOT NULL DEFAULT 'NORMAL',
  "temperature" "lead_temperature" NOT NULL DEFAULT 'COLD',
  "return_status" "return_status" NOT NULL DEFAULT 'WAITING',
  "first_contact_at" TIMESTAMPTZ(3),
  "last_contact_at" TIMESTAMPTZ(3),
  "last_response_at" TIMESTAMPTZ(3),
  "last_activity_at" TIMESTAMPTZ(3),
  "next_follow_up_at" TIMESTAMPTZ(3),
  "meeting_at" TIMESTAMPTZ(3),
  "proposal_sent_at" TIMESTAMPTZ(3),
  "proposal_value" DECIMAL(14,2),
  "won_at" TIMESTAMPTZ(3),
  "won_value" DECIMAL(14,2),
  "lost_at" TIMESTAMPTZ(3),
  "loss_reason_id" UUID,
  "do_not_contact_at" TIMESTAMPTZ(3),
  "do_not_contact_reason" TEXT,
  "legal_basis" "legal_basis" NOT NULL DEFAULT 'NOT_DEFINED',
  "legal_basis_note" TEXT,
  "consent_granted_at" TIMESTAMPTZ(3),
  "consent_source" VARCHAR(120),
  "processing_blocked_at" TIMESTAMPTZ(3),
  "import_job_id" UUID,
  "created_by_id" UUID,
  "archived_at" TIMESTAMPTZ(3),
  "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "leads_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "leads_organization_id_place_id_key" UNIQUE ("organization_id", "place_id"),
  CONSTRAINT "leads_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "organizations"("id") ON DELETE RESTRICT,
  CONSTRAINT "leads_assignee_id_fkey" FOREIGN KEY ("assignee_id") REFERENCES "users"("id") ON DELETE SET NULL,
  CONSTRAINT "leads_stage_id_fkey" FOREIGN KEY ("stage_id") REFERENCES "pipeline_stages"("id") ON DELETE RESTRICT,
  CONSTRAINT "leads_loss_reason_id_fkey" FOREIGN KEY ("loss_reason_id") REFERENCES "loss_reasons"("id") ON DELETE RESTRICT,
  CONSTRAINT "leads_import_job_id_fkey" FOREIGN KEY ("import_job_id") REFERENCES "import_jobs"("id") ON DELETE SET NULL,
  CONSTRAINT "leads_created_by_id_fkey" FOREIGN KEY ("created_by_id") REFERENCES "users"("id") ON DELETE SET NULL,
  CONSTRAINT "leads_title_check" CHECK (length(btrim("title")) > 0),
  CONSTRAINT "leads_country_code_check" CHECK ("country_code" IS NULL OR "country_code" ~ '^[A-Z]{2}$'),
  CONSTRAINT "leads_phone_e164_check" CHECK ("phone_normalized" IS NULL OR "phone_normalized" ~ '^\+[1-9][0-9]{7,14}$'),
  CONSTRAINT "leads_total_score_check" CHECK ("total_score" IS NULL OR "total_score" BETWEEN 0 AND 5),
  CONSTRAINT "leads_reviews_count_check" CHECK ("reviews_count" IS NULL OR "reviews_count" >= 0),
  CONSTRAINT "leads_latitude_check" CHECK ("latitude" IS NULL OR "latitude" BETWEEN -90 AND 90),
  CONSTRAINT "leads_longitude_check" CHECK ("longitude" IS NULL OR "longitude" BETWEEN -180 AND 180),
  CONSTRAINT "leads_proposal_value_check" CHECK ("proposal_value" IS NULL OR "proposal_value" >= 0),
  CONSTRAINT "leads_won_value_check" CHECK ("won_value" IS NULL OR "won_value" >= 0),
  CONSTRAINT "leads_consent_check" CHECK ("legal_basis" <> 'CONSENT' OR "consent_granted_at" IS NOT NULL),
  CONSTRAINT "leads_do_not_contact_check" CHECK (
    "do_not_contact_at" IS NULL OR length(btrim(coalesce("do_not_contact_reason", ''))) > 0
  )
);

CREATE INDEX "leads_organization_id_phone_normalized_idx" ON "leads"("organization_id", "phone_normalized");
CREATE INDEX "leads_organization_id_normalized_name_normalized_address_idx" ON "leads"("organization_id", "normalized_name", "normalized_address");
CREATE INDEX "leads_organization_id_assignee_id_idx" ON "leads"("organization_id", "assignee_id");
CREATE INDEX "leads_organization_id_stage_id_idx" ON "leads"("organization_id", "stage_id");
CREATE INDEX "leads_organization_id_next_follow_up_at_idx" ON "leads"("organization_id", "next_follow_up_at");
CREATE INDEX "leads_organization_id_last_contact_at_idx" ON "leads"("organization_id", "last_contact_at");
CREATE INDEX "leads_organization_id_last_activity_at_idx" ON "leads"("organization_id", "last_activity_at");
CREATE INDEX "leads_organization_id_city_idx" ON "leads"("organization_id", "city");
CREATE INDEX "leads_organization_id_category_name_idx" ON "leads"("organization_id", "category_name");
CREATE INDEX "leads_organization_id_search_string_idx" ON "leads"("organization_id", "search_string");
CREATE INDEX "leads_organization_id_priority_idx" ON "leads"("organization_id", "priority");
CREATE INDEX "leads_place_id_idx" ON "leads"("place_id");
CREATE INDEX "leads_title_trgm_idx" ON "leads" USING GIN ("title" gin_trgm_ops);
CREATE INDEX "leads_address_trgm_idx" ON "leads" USING GIN ("address" gin_trgm_ops);

CREATE TABLE "lead_assignments" (
  "id" UUID NOT NULL DEFAULT gen_random_uuid(),
  "organization_id" UUID NOT NULL,
  "lead_id" UUID NOT NULL,
  "previous_assignee_id" UUID,
  "assignee_id" UUID,
  "assigned_by_id" UUID NOT NULL,
  "reason" "assignment_reason" NOT NULL,
  "note" TEXT,
  "assigned_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "lead_assignments_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "lead_assignments_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "organizations"("id") ON DELETE RESTRICT,
  CONSTRAINT "lead_assignments_lead_id_fkey" FOREIGN KEY ("lead_id") REFERENCES "leads"("id") ON DELETE RESTRICT,
  CONSTRAINT "lead_assignments_previous_assignee_id_fkey" FOREIGN KEY ("previous_assignee_id") REFERENCES "users"("id") ON DELETE SET NULL,
  CONSTRAINT "lead_assignments_assignee_id_fkey" FOREIGN KEY ("assignee_id") REFERENCES "users"("id") ON DELETE SET NULL,
  CONSTRAINT "lead_assignments_assigned_by_id_fkey" FOREIGN KEY ("assigned_by_id") REFERENCES "users"("id") ON DELETE RESTRICT,
  CONSTRAINT "lead_assignments_reason_check" CHECK (
    ("reason" = 'UNASSIGNMENT' AND "assignee_id" IS NULL)
    OR ("reason" <> 'UNASSIGNMENT' AND "assignee_id" IS NOT NULL)
  )
);

CREATE INDEX "lead_assignments_organization_id_lead_id_assigned_at_idx" ON "lead_assignments"("organization_id", "lead_id", "assigned_at");
CREATE INDEX "lead_assignments_organization_id_assignee_id_assigned_at_idx" ON "lead_assignments"("organization_id", "assignee_id", "assigned_at");

CREATE TABLE "activities" (
  "id" UUID NOT NULL DEFAULT gen_random_uuid(),
  "organization_id" UUID NOT NULL,
  "lead_id" UUID NOT NULL,
  "author_id" UUID NOT NULL,
  "type" "activity_type" NOT NULL,
  "channel" "contact_channel",
  "direction" "activity_direction",
  "outcome" "contact_outcome",
  "return_status" "return_status",
  "notes" TEXT,
  "duration_seconds" INTEGER,
  "next_action_at" TIMESTAMPTZ(3),
  "metadata" JSONB NOT NULL DEFAULT '{}'::jsonb,
  "corrects_activity_id" UUID,
  "occurred_at" TIMESTAMPTZ(3) NOT NULL,
  "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "activities_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "activities_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "organizations"("id") ON DELETE RESTRICT,
  CONSTRAINT "activities_lead_id_fkey" FOREIGN KEY ("lead_id") REFERENCES "leads"("id") ON DELETE RESTRICT,
  CONSTRAINT "activities_author_id_fkey" FOREIGN KEY ("author_id") REFERENCES "users"("id") ON DELETE RESTRICT,
  CONSTRAINT "activities_corrects_activity_id_fkey" FOREIGN KEY ("corrects_activity_id") REFERENCES "activities"("id") ON DELETE RESTRICT,
  CONSTRAINT "activities_duration_check" CHECK ("duration_seconds" IS NULL OR "duration_seconds" >= 0),
  CONSTRAINT "activities_contact_fields_check" CHECK (
    "type" NOT IN ('CONTACT_ATTEMPT', 'CONTACT_RESPONSE')
    OR ("channel" IS NOT NULL AND "direction" IS NOT NULL)
  ),
  CONSTRAINT "activities_response_direction_check" CHECK (
    "type" <> 'CONTACT_RESPONSE' OR "direction" = 'INBOUND'
  ),
  CONSTRAINT "activities_correction_check" CHECK (
    ("type" = 'CORRECTION' AND "corrects_activity_id" IS NOT NULL)
    OR ("type" <> 'CORRECTION' AND "corrects_activity_id" IS NULL)
  ),
  CONSTRAINT "activities_no_self_correction_check" CHECK ("corrects_activity_id" IS NULL OR "corrects_activity_id" <> "id")
);

CREATE INDEX "activities_organization_id_lead_id_occurred_at_idx" ON "activities"("organization_id", "lead_id", "occurred_at");
CREATE INDEX "activities_organization_id_author_id_occurred_at_idx" ON "activities"("organization_id", "author_id", "occurred_at");
CREATE INDEX "activities_organization_id_type_occurred_at_idx" ON "activities"("organization_id", "type", "occurred_at");
CREATE INDEX "activities_corrects_activity_id_idx" ON "activities"("corrects_activity_id");

CREATE TABLE "lead_stage_history" (
  "id" UUID NOT NULL DEFAULT gen_random_uuid(),
  "organization_id" UUID NOT NULL,
  "lead_id" UUID NOT NULL,
  "from_stage_id" UUID,
  "to_stage_id" UUID NOT NULL,
  "changed_by_id" UUID NOT NULL,
  "reason" TEXT,
  "metadata" JSONB NOT NULL DEFAULT '{}'::jsonb,
  "changed_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "lead_stage_history_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "lead_stage_history_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "organizations"("id") ON DELETE RESTRICT,
  CONSTRAINT "lead_stage_history_lead_id_fkey" FOREIGN KEY ("lead_id") REFERENCES "leads"("id") ON DELETE RESTRICT,
  CONSTRAINT "lead_stage_history_from_stage_id_fkey" FOREIGN KEY ("from_stage_id") REFERENCES "pipeline_stages"("id") ON DELETE RESTRICT,
  CONSTRAINT "lead_stage_history_to_stage_id_fkey" FOREIGN KEY ("to_stage_id") REFERENCES "pipeline_stages"("id") ON DELETE RESTRICT,
  CONSTRAINT "lead_stage_history_changed_by_id_fkey" FOREIGN KEY ("changed_by_id") REFERENCES "users"("id") ON DELETE RESTRICT,
  CONSTRAINT "lead_stage_history_actual_change_check" CHECK ("from_stage_id" IS NULL OR "from_stage_id" <> "to_stage_id")
);

CREATE INDEX "lead_stage_history_organization_id_lead_id_changed_at_idx" ON "lead_stage_history"("organization_id", "lead_id", "changed_at");
CREATE INDEX "lead_stage_history_organization_id_to_stage_id_changed_at_idx" ON "lead_stage_history"("organization_id", "to_stage_id", "changed_at");

CREATE TABLE "tasks" (
  "id" UUID NOT NULL DEFAULT gen_random_uuid(),
  "organization_id" UUID NOT NULL,
  "lead_id" UUID NOT NULL,
  "assignee_id" UUID NOT NULL,
  "created_by_id" UUID NOT NULL,
  "title" VARCHAR(180) NOT NULL,
  "description" TEXT,
  "priority" "lead_priority" NOT NULL DEFAULT 'NORMAL',
  "status" "task_status" NOT NULL DEFAULT 'OPEN',
  "due_at" TIMESTAMPTZ(3) NOT NULL,
  "reminder_at" TIMESTAMPTZ(3),
  "completed_at" TIMESTAMPTZ(3),
  "completed_by_id" UUID,
  "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "tasks_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "tasks_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "organizations"("id") ON DELETE RESTRICT,
  CONSTRAINT "tasks_lead_id_fkey" FOREIGN KEY ("lead_id") REFERENCES "leads"("id") ON DELETE RESTRICT,
  CONSTRAINT "tasks_assignee_id_fkey" FOREIGN KEY ("assignee_id") REFERENCES "users"("id") ON DELETE RESTRICT,
  CONSTRAINT "tasks_created_by_id_fkey" FOREIGN KEY ("created_by_id") REFERENCES "users"("id") ON DELETE RESTRICT,
  CONSTRAINT "tasks_completed_by_id_fkey" FOREIGN KEY ("completed_by_id") REFERENCES "users"("id") ON DELETE SET NULL,
  CONSTRAINT "tasks_title_check" CHECK (length(btrim("title")) > 0),
  CONSTRAINT "tasks_completion_check" CHECK (
    ("status" = 'COMPLETED' AND "completed_at" IS NOT NULL)
    OR ("status" <> 'COMPLETED' AND "completed_at" IS NULL AND "completed_by_id" IS NULL)
  )
);

CREATE INDEX "tasks_organization_id_assignee_id_status_due_at_idx" ON "tasks"("organization_id", "assignee_id", "status", "due_at");
CREATE INDEX "tasks_organization_id_lead_id_due_at_idx" ON "tasks"("organization_id", "lead_id", "due_at");

CREATE TABLE "lead_tags" (
  "organization_id" UUID NOT NULL,
  "lead_id" UUID NOT NULL,
  "tag_id" UUID NOT NULL,
  "created_by_id" UUID,
  "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "lead_tags_pkey" PRIMARY KEY ("lead_id", "tag_id"),
  CONSTRAINT "lead_tags_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "organizations"("id") ON DELETE RESTRICT,
  CONSTRAINT "lead_tags_lead_id_fkey" FOREIGN KEY ("lead_id") REFERENCES "leads"("id") ON DELETE CASCADE,
  CONSTRAINT "lead_tags_tag_id_fkey" FOREIGN KEY ("tag_id") REFERENCES "tags"("id") ON DELETE CASCADE,
  CONSTRAINT "lead_tags_created_by_id_fkey" FOREIGN KEY ("created_by_id") REFERENCES "users"("id") ON DELETE SET NULL
);

CREATE INDEX "lead_tags_organization_id_tag_id_idx" ON "lead_tags"("organization_id", "tag_id");

CREATE TABLE "import_job_rows" (
  "id" UUID NOT NULL DEFAULT gen_random_uuid(),
  "organization_id" UUID NOT NULL,
  "import_job_id" UUID NOT NULL,
  "row_number" INTEGER NOT NULL,
  "status" "import_row_status" NOT NULL DEFAULT 'PENDING',
  "raw_data" JSONB NOT NULL,
  "normalized_data" JSONB,
  "errors" JSONB NOT NULL DEFAULT '[]'::jsonb,
  "lead_id" UUID,
  "duplicate_lead_id" UUID,
  "processed_at" TIMESTAMPTZ(3),
  "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "import_job_rows_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "import_job_rows_import_job_id_row_number_key" UNIQUE ("import_job_id", "row_number"),
  CONSTRAINT "import_job_rows_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "organizations"("id") ON DELETE RESTRICT,
  CONSTRAINT "import_job_rows_import_job_id_fkey" FOREIGN KEY ("import_job_id") REFERENCES "import_jobs"("id") ON DELETE CASCADE,
  CONSTRAINT "import_job_rows_lead_id_fkey" FOREIGN KEY ("lead_id") REFERENCES "leads"("id") ON DELETE SET NULL,
  CONSTRAINT "import_job_rows_duplicate_lead_id_fkey" FOREIGN KEY ("duplicate_lead_id") REFERENCES "leads"("id") ON DELETE SET NULL,
  CONSTRAINT "import_job_rows_row_number_check" CHECK ("row_number" > 0),
  CONSTRAINT "import_job_rows_errors_array_check" CHECK (jsonb_typeof("errors") = 'array')
);

CREATE INDEX "import_job_rows_organization_id_status_idx" ON "import_job_rows"("organization_id", "status");
CREATE INDEX "import_job_rows_lead_id_idx" ON "import_job_rows"("lead_id");
CREATE INDEX "import_job_rows_duplicate_lead_id_idx" ON "import_job_rows"("duplicate_lead_id");

CREATE TABLE "audit_logs" (
  "id" UUID NOT NULL DEFAULT gen_random_uuid(),
  "organization_id" UUID NOT NULL,
  "actor_id" UUID,
  "action" "audit_action" NOT NULL,
  "entity_type" VARCHAR(80) NOT NULL,
  "entity_id" VARCHAR(100),
  "before" JSONB,
  "after" JSONB,
  "metadata" JSONB NOT NULL DEFAULT '{}'::jsonb,
  "ip_address" VARCHAR(64),
  "user_agent" TEXT,
  "occurred_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "audit_logs_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "audit_logs_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "organizations"("id") ON DELETE RESTRICT,
  CONSTRAINT "audit_logs_actor_id_fkey" FOREIGN KEY ("actor_id") REFERENCES "users"("id") ON DELETE SET NULL,
  CONSTRAINT "audit_logs_entity_type_check" CHECK (length(btrim("entity_type")) > 0)
);

CREATE INDEX "audit_logs_organization_id_occurred_at_idx" ON "audit_logs"("organization_id", "occurred_at");
CREATE INDEX "audit_logs_organization_id_entity_type_entity_id_occurred_at_idx" ON "audit_logs"("organization_id", "entity_type", "entity_id", "occurred_at");
CREATE INDEX "audit_logs_actor_id_occurred_at_idx" ON "audit_logs"("actor_id", "occurred_at");

CREATE TABLE "lead_privacy_events" (
  "id" UUID NOT NULL DEFAULT gen_random_uuid(),
  "organization_id" UUID NOT NULL,
  "lead_id" UUID NOT NULL,
  "type" "privacy_event_type" NOT NULL,
  "legal_basis" "legal_basis",
  "reason" TEXT,
  "source" VARCHAR(120),
  "actor_id" UUID,
  "metadata" JSONB NOT NULL DEFAULT '{}'::jsonb,
  "occurred_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "lead_privacy_events_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "lead_privacy_events_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "organizations"("id") ON DELETE RESTRICT,
  CONSTRAINT "lead_privacy_events_lead_id_fkey" FOREIGN KEY ("lead_id") REFERENCES "leads"("id") ON DELETE RESTRICT,
  CONSTRAINT "lead_privacy_events_actor_id_fkey" FOREIGN KEY ("actor_id") REFERENCES "users"("id") ON DELETE SET NULL,
  CONSTRAINT "lead_privacy_events_basis_check" CHECK ("type" <> 'LEGAL_BASIS_RECORDED' OR "legal_basis" IS NOT NULL),
  CONSTRAINT "lead_privacy_events_reason_check" CHECK (
    "type" NOT IN ('CONSENT_WITHDRAWN', 'DO_NOT_CONTACT_REQUESTED')
    OR length(btrim(coalesce("reason", ''))) > 0
  )
);

CREATE INDEX "lead_privacy_events_organization_id_lead_id_occurred_at_idx" ON "lead_privacy_events"("organization_id", "lead_id", "occurred_at");

CREATE TABLE "data_subject_requests" (
  "id" UUID NOT NULL DEFAULT gen_random_uuid(),
  "organization_id" UUID NOT NULL,
  "lead_id" UUID,
  "type" "data_subject_request_type" NOT NULL,
  "status" "data_subject_request_status" NOT NULL DEFAULT 'OPEN',
  "requester_name" VARCHAR(160),
  "requester_email" VARCHAR(320),
  "requester_phone" VARCHAR(32),
  "details" TEXT,
  "handled_by_id" UUID,
  "requested_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "due_at" TIMESTAMPTZ(3),
  "completed_at" TIMESTAMPTZ(3),
  "resolution" TEXT,
  "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "data_subject_requests_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "data_subject_requests_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "organizations"("id") ON DELETE RESTRICT,
  CONSTRAINT "data_subject_requests_lead_id_fkey" FOREIGN KEY ("lead_id") REFERENCES "leads"("id") ON DELETE SET NULL,
  CONSTRAINT "data_subject_requests_handled_by_id_fkey" FOREIGN KEY ("handled_by_id") REFERENCES "users"("id") ON DELETE SET NULL,
  CONSTRAINT "data_subject_requests_requester_check" CHECK (
    "lead_id" IS NOT NULL OR "requester_email" IS NOT NULL OR "requester_phone" IS NOT NULL
  ),
  CONSTRAINT "data_subject_requests_completion_check" CHECK (
    ("status" = 'COMPLETED' AND "completed_at" IS NOT NULL)
    OR ("status" <> 'COMPLETED')
  )
);

CREATE INDEX "data_subject_requests_organization_id_status_due_at_idx" ON "data_subject_requests"("organization_id", "status", "due_at");
CREATE INDEX "data_subject_requests_organization_id_lead_id_requested_at_idx" ON "data_subject_requests"("organization_id", "lead_id", "requested_at");

-- Keep mutable timestamps correct even for SQL clients outside Prisma.
CREATE OR REPLACE FUNCTION "set_updated_at"()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  NEW."updated_at" := CURRENT_TIMESTAMP;
  RETURN NEW;
END;
$$;

CREATE TRIGGER "organizations_set_updated_at" BEFORE UPDATE ON "organizations" FOR EACH ROW EXECUTE FUNCTION "set_updated_at"();
CREATE TRIGGER "users_set_updated_at" BEFORE UPDATE ON "users" FOR EACH ROW EXECUTE FUNCTION "set_updated_at"();
CREATE TRIGGER "rate_limit_buckets_set_updated_at" BEFORE UPDATE ON "rate_limit_buckets" FOR EACH ROW EXECUTE FUNCTION "set_updated_at"();
CREATE TRIGGER "user_goals_set_updated_at" BEFORE UPDATE ON "user_goals" FOR EACH ROW EXECUTE FUNCTION "set_updated_at"();
CREATE TRIGGER "pipeline_stages_set_updated_at" BEFORE UPDATE ON "pipeline_stages" FOR EACH ROW EXECUTE FUNCTION "set_updated_at"();
CREATE TRIGGER "loss_reasons_set_updated_at" BEFORE UPDATE ON "loss_reasons" FOR EACH ROW EXECUTE FUNCTION "set_updated_at"();
CREATE TRIGGER "tags_set_updated_at" BEFORE UPDATE ON "tags" FOR EACH ROW EXECUTE FUNCTION "set_updated_at"();
CREATE TRIGGER "import_jobs_set_updated_at" BEFORE UPDATE ON "import_jobs" FOR EACH ROW EXECUTE FUNCTION "set_updated_at"();
CREATE TRIGGER "leads_set_updated_at" BEFORE UPDATE ON "leads" FOR EACH ROW EXECUTE FUNCTION "set_updated_at"();
CREATE TRIGGER "tasks_set_updated_at" BEFORE UPDATE ON "tasks" FOR EACH ROW EXECUTE FUNCTION "set_updated_at"();
CREATE TRIGGER "data_subject_requests_set_updated_at" BEFORE UPDATE ON "data_subject_requests" FOR EACH ROW EXECUTE FUNCTION "set_updated_at"();

-- Generic same-tenant check. TG_ARGV is a list of (foreign-key column, table).
-- It supplements ordinary FKs so a UUID from another organization cannot leak in.
CREATE OR REPLACE FUNCTION "assert_same_organization"()
RETURNS trigger
LANGUAGE plpgsql
AS $$
DECLARE
  argument_index INTEGER := 0;
  reference_column TEXT;
  reference_table TEXT;
  reference_id UUID;
  is_same_organization BOOLEAN;
BEGIN
  WHILE argument_index < TG_NARGS LOOP
    reference_column := TG_ARGV[argument_index];
    reference_table := TG_ARGV[argument_index + 1];
    reference_id := NULLIF(to_jsonb(NEW) ->> reference_column, '')::uuid;

    IF reference_id IS NOT NULL THEN
      EXECUTE format(
        'SELECT EXISTS (SELECT 1 FROM %I WHERE id = $1 AND organization_id = $2)',
        reference_table
      ) INTO is_same_organization USING reference_id, NEW."organization_id";

      IF NOT is_same_organization THEN
        RAISE EXCEPTION USING
          ERRCODE = '23514',
          MESSAGE = format('%s.%s must reference the same organization', TG_TABLE_NAME, reference_column);
      END IF;
    END IF;

    argument_index := argument_index + 2;
  END LOOP;

  RETURN NEW;
END;
$$;

-- Tenant ownership is fixed at creation time. Moving a row between tenants
-- would invalidate historical relations even if all current foreign keys moved.
CREATE OR REPLACE FUNCTION "prevent_organization_change"()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  IF NEW."organization_id" IS DISTINCT FROM OLD."organization_id" THEN
    RAISE EXCEPTION USING ERRCODE = '23514', MESSAGE = 'organization_id is immutable';
  END IF;
  RETURN NEW;
END;
$$;

CREATE TRIGGER "users_organization_immutable" BEFORE UPDATE ON "users" FOR EACH ROW EXECUTE FUNCTION "prevent_organization_change"();
CREATE TRIGGER "sessions_organization_immutable" BEFORE UPDATE ON "sessions" FOR EACH ROW EXECUTE FUNCTION "prevent_organization_change"();
CREATE TRIGGER "password_reset_tokens_organization_immutable" BEFORE UPDATE ON "password_reset_tokens" FOR EACH ROW EXECUTE FUNCTION "prevent_organization_change"();
CREATE TRIGGER "rate_limit_buckets_organization_immutable" BEFORE UPDATE ON "rate_limit_buckets" FOR EACH ROW EXECUTE FUNCTION "prevent_organization_change"();
CREATE TRIGGER "user_permission_grants_organization_immutable" BEFORE UPDATE ON "user_permission_grants" FOR EACH ROW EXECUTE FUNCTION "prevent_organization_change"();
CREATE TRIGGER "user_goals_organization_immutable" BEFORE UPDATE ON "user_goals" FOR EACH ROW EXECUTE FUNCTION "prevent_organization_change"();
CREATE TRIGGER "pipeline_stages_organization_immutable" BEFORE UPDATE ON "pipeline_stages" FOR EACH ROW EXECUTE FUNCTION "prevent_organization_change"();
CREATE TRIGGER "loss_reasons_organization_immutable" BEFORE UPDATE ON "loss_reasons" FOR EACH ROW EXECUTE FUNCTION "prevent_organization_change"();
CREATE TRIGGER "tags_organization_immutable" BEFORE UPDATE ON "tags" FOR EACH ROW EXECUTE FUNCTION "prevent_organization_change"();
CREATE TRIGGER "import_jobs_organization_immutable" BEFORE UPDATE ON "import_jobs" FOR EACH ROW EXECUTE FUNCTION "prevent_organization_change"();
CREATE TRIGGER "leads_organization_immutable" BEFORE UPDATE ON "leads" FOR EACH ROW EXECUTE FUNCTION "prevent_organization_change"();
CREATE TRIGGER "tasks_organization_immutable" BEFORE UPDATE ON "tasks" FOR EACH ROW EXECUTE FUNCTION "prevent_organization_change"();
CREATE TRIGGER "lead_tags_organization_immutable" BEFORE UPDATE ON "lead_tags" FOR EACH ROW EXECUTE FUNCTION "prevent_organization_change"();
CREATE TRIGGER "import_job_rows_organization_immutable" BEFORE UPDATE ON "import_job_rows" FOR EACH ROW EXECUTE FUNCTION "prevent_organization_change"();
CREATE TRIGGER "data_subject_requests_organization_immutable" BEFORE UPDATE ON "data_subject_requests" FOR EACH ROW EXECUTE FUNCTION "prevent_organization_change"();

CREATE TRIGGER "sessions_tenant_guard" BEFORE INSERT OR UPDATE ON "sessions"
  FOR EACH ROW EXECUTE FUNCTION "assert_same_organization"('user_id', 'users');
CREATE TRIGGER "password_reset_tokens_tenant_guard" BEFORE INSERT OR UPDATE ON "password_reset_tokens"
  FOR EACH ROW EXECUTE FUNCTION "assert_same_organization"('user_id', 'users');
CREATE TRIGGER "user_permission_grants_tenant_guard" BEFORE INSERT OR UPDATE ON "user_permission_grants"
  FOR EACH ROW EXECUTE FUNCTION "assert_same_organization"('user_id', 'users', 'granted_by_id', 'users');
CREATE TRIGGER "user_goals_tenant_guard" BEFORE INSERT OR UPDATE ON "user_goals"
  FOR EACH ROW EXECUTE FUNCTION "assert_same_organization"('user_id', 'users');
CREATE TRIGGER "tags_tenant_guard" BEFORE INSERT OR UPDATE ON "tags"
  FOR EACH ROW EXECUTE FUNCTION "assert_same_organization"('created_by_id', 'users');
CREATE TRIGGER "import_jobs_tenant_guard" BEFORE INSERT OR UPDATE ON "import_jobs"
  FOR EACH ROW EXECUTE FUNCTION "assert_same_organization"('created_by_id', 'users');
CREATE TRIGGER "leads_tenant_guard" BEFORE INSERT OR UPDATE ON "leads"
  FOR EACH ROW EXECUTE FUNCTION "assert_same_organization"(
    'assignee_id', 'users', 'stage_id', 'pipeline_stages', 'loss_reason_id', 'loss_reasons',
    'import_job_id', 'import_jobs', 'created_by_id', 'users'
  );
CREATE TRIGGER "lead_assignments_tenant_guard" BEFORE INSERT OR UPDATE ON "lead_assignments"
  FOR EACH ROW EXECUTE FUNCTION "assert_same_organization"(
    'lead_id', 'leads', 'previous_assignee_id', 'users', 'assignee_id', 'users', 'assigned_by_id', 'users'
  );
CREATE TRIGGER "activities_tenant_guard" BEFORE INSERT OR UPDATE ON "activities"
  FOR EACH ROW EXECUTE FUNCTION "assert_same_organization"(
    'lead_id', 'leads', 'author_id', 'users', 'corrects_activity_id', 'activities'
  );
CREATE TRIGGER "lead_stage_history_tenant_guard" BEFORE INSERT OR UPDATE ON "lead_stage_history"
  FOR EACH ROW EXECUTE FUNCTION "assert_same_organization"(
    'lead_id', 'leads', 'from_stage_id', 'pipeline_stages', 'to_stage_id', 'pipeline_stages', 'changed_by_id', 'users'
  );
CREATE TRIGGER "tasks_tenant_guard" BEFORE INSERT OR UPDATE ON "tasks"
  FOR EACH ROW EXECUTE FUNCTION "assert_same_organization"(
    'lead_id', 'leads', 'assignee_id', 'users', 'created_by_id', 'users', 'completed_by_id', 'users'
  );
CREATE TRIGGER "lead_tags_tenant_guard" BEFORE INSERT OR UPDATE ON "lead_tags"
  FOR EACH ROW EXECUTE FUNCTION "assert_same_organization"('lead_id', 'leads', 'tag_id', 'tags', 'created_by_id', 'users');
CREATE TRIGGER "import_job_rows_tenant_guard" BEFORE INSERT OR UPDATE ON "import_job_rows"
  FOR EACH ROW EXECUTE FUNCTION "assert_same_organization"(
    'import_job_id', 'import_jobs', 'lead_id', 'leads', 'duplicate_lead_id', 'leads'
  );
CREATE TRIGGER "audit_logs_tenant_guard" BEFORE INSERT OR UPDATE ON "audit_logs"
  FOR EACH ROW EXECUTE FUNCTION "assert_same_organization"('actor_id', 'users');
CREATE TRIGGER "lead_privacy_events_tenant_guard" BEFORE INSERT OR UPDATE ON "lead_privacy_events"
  FOR EACH ROW EXECUTE FUNCTION "assert_same_organization"('lead_id', 'leads', 'actor_id', 'users');
CREATE TRIGGER "data_subject_requests_tenant_guard" BEFORE INSERT OR UPDATE ON "data_subject_requests"
  FOR EACH ROW EXECUTE FUNCTION "assert_same_organization"('lead_id', 'leads', 'handled_by_id', 'users');

-- Funnel requirements are data-driven by the stage flags.
CREATE OR REPLACE FUNCTION "validate_lead_stage_requirements"()
RETURNS trigger
LANGUAGE plpgsql
AS $$
DECLARE
  selected_stage "pipeline_stages"%ROWTYPE;
BEGIN
  SELECT * INTO selected_stage
  FROM "pipeline_stages"
  WHERE "id" = NEW."stage_id" AND "organization_id" = NEW."organization_id";

  IF NOT FOUND THEN
    RAISE EXCEPTION USING ERRCODE = '23514', MESSAGE = 'lead stage must belong to the same organization';
  END IF;

  IF selected_stage."requires_meeting_at" AND NEW."meeting_at" IS NULL THEN
    RAISE EXCEPTION USING ERRCODE = '23514', MESSAGE = 'meeting_at is required for this stage';
  END IF;

  IF selected_stage."requires_proposal_at" AND NEW."proposal_sent_at" IS NULL THEN
    RAISE EXCEPTION USING ERRCODE = '23514', MESSAGE = 'proposal_sent_at is required for this stage';
  END IF;

  IF selected_stage."is_won" AND NEW."won_at" IS NULL THEN
    RAISE EXCEPTION USING ERRCODE = '23514', MESSAGE = 'won_at is required for a won stage';
  END IF;

  IF selected_stage."is_lost" AND NEW."lost_at" IS NULL THEN
    RAISE EXCEPTION USING ERRCODE = '23514', MESSAGE = 'lost_at is required for a lost stage';
  END IF;

  IF selected_stage."requires_loss_reason" AND NEW."loss_reason_id" IS NULL THEN
    RAISE EXCEPTION USING ERRCODE = '23514', MESSAGE = 'loss_reason_id is required for this stage';
  END IF;

  IF selected_stage."blocks_contact" AND (
    NEW."do_not_contact_at" IS NULL OR length(btrim(coalesce(NEW."do_not_contact_reason", ''))) = 0
  ) THEN
    RAISE EXCEPTION USING ERRCODE = '23514', MESSAGE = 'do-not-contact date and reason are required for this stage';
  END IF;

  RETURN NEW;
END;
$$;

CREATE TRIGGER "leads_validate_stage_requirements" BEFORE INSERT OR UPDATE ON "leads"
  FOR EACH ROW EXECUTE FUNCTION "validate_lead_stage_requirements"();

-- Opening an external WhatsApp URL never reaches this trigger. Only a saved
-- contact activity counts, and blocked leads cannot receive new attempts.
CREATE OR REPLACE FUNCTION "guard_contact_activity"()
RETURNS trigger
LANGUAGE plpgsql
AS $$
DECLARE
  contact_is_blocked BOOLEAN;
BEGIN
  IF NEW."type" = 'CONTACT_ATTEMPT' THEN
    SELECT (
      lead."do_not_contact_at" IS NOT NULL
      OR lead."processing_blocked_at" IS NOT NULL
      OR stage."blocks_contact"
    ) INTO contact_is_blocked
    FROM "leads" AS lead
    JOIN "pipeline_stages" AS stage ON stage."id" = lead."stage_id"
    WHERE lead."id" = NEW."lead_id" AND lead."organization_id" = NEW."organization_id";

    IF coalesce(contact_is_blocked, true) THEN
      RAISE EXCEPTION USING ERRCODE = '23514', MESSAGE = 'contact attempts are blocked for this lead';
    END IF;
  END IF;

  RETURN NEW;
END;
$$;

CREATE TRIGGER "activities_contact_guard" BEFORE INSERT ON "activities"
  FOR EACH ROW EXECUTE FUNCTION "guard_contact_activity"();

-- Cached lead dates speed up lists/dashboard filters. Activities remain the
-- immutable source of truth for contact and response metrics.
CREATE OR REPLACE FUNCTION "refresh_lead_activity_cache"()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  UPDATE "leads"
  SET
    "last_activity_at" = CASE
      WHEN "last_activity_at" IS NULL OR NEW."occurred_at" > "last_activity_at" THEN NEW."occurred_at"
      ELSE "last_activity_at"
    END,
    "first_contact_at" = CASE
      WHEN NEW."type" = 'CONTACT_ATTEMPT' AND ("first_contact_at" IS NULL OR NEW."occurred_at" < "first_contact_at") THEN NEW."occurred_at"
      ELSE "first_contact_at"
    END,
    "last_contact_at" = CASE
      WHEN NEW."type" = 'CONTACT_ATTEMPT' AND ("last_contact_at" IS NULL OR NEW."occurred_at" > "last_contact_at") THEN NEW."occurred_at"
      ELSE "last_contact_at"
    END,
    "last_response_at" = CASE
      WHEN (NEW."type" = 'CONTACT_RESPONSE' OR NEW."direction" = 'INBOUND')
        AND ("last_response_at" IS NULL OR NEW."occurred_at" > "last_response_at") THEN NEW."occurred_at"
      ELSE "last_response_at"
    END,
    "return_status" = CASE
      WHEN NEW."type" = 'CONTACT_RESPONSE' OR NEW."direction" = 'INBOUND' THEN 'YES'::"return_status"
      WHEN NEW."return_status" IS NOT NULL THEN NEW."return_status"
      ELSE "return_status"
    END,
    "next_follow_up_at" = coalesce(NEW."next_action_at", "next_follow_up_at")
  WHERE "id" = NEW."lead_id" AND "organization_id" = NEW."organization_id";

  RETURN NEW;
END;
$$;

CREATE TRIGGER "activities_refresh_lead_cache" AFTER INSERT ON "activities"
  FOR EACH ROW EXECUTE FUNCTION "refresh_lead_activity_cache"();

-- Historical/compliance records are append-only. Corrections are new activity
-- rows referencing the original activity.
CREATE OR REPLACE FUNCTION "prevent_immutable_mutation"()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  RAISE EXCEPTION USING
    ERRCODE = '55000',
    MESSAGE = format('%s is append-only; create a correction record instead', TG_TABLE_NAME);
END;
$$;

CREATE TRIGGER "lead_assignments_immutable" BEFORE UPDATE OR DELETE ON "lead_assignments"
  FOR EACH ROW EXECUTE FUNCTION "prevent_immutable_mutation"();
CREATE TRIGGER "activities_immutable" BEFORE UPDATE OR DELETE ON "activities"
  FOR EACH ROW EXECUTE FUNCTION "prevent_immutable_mutation"();
CREATE TRIGGER "lead_stage_history_immutable" BEFORE UPDATE OR DELETE ON "lead_stage_history"
  FOR EACH ROW EXECUTE FUNCTION "prevent_immutable_mutation"();
CREATE TRIGGER "audit_logs_immutable" BEFORE UPDATE OR DELETE ON "audit_logs"
  FOR EACH ROW EXECUTE FUNCTION "prevent_immutable_mutation"();
CREATE TRIGGER "lead_privacy_events_immutable" BEFORE UPDATE OR DELETE ON "lead_privacy_events"
  FOR EACH ROW EXECUTE FUNCTION "prevent_immutable_mutation"();
