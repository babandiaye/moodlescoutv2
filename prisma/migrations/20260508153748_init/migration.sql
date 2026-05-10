-- CreateEnum
CREATE TYPE "UserRole" AS ENUM ('admin', 'auditeur');

-- CreateEnum
CREATE TYPE "AuditStatus" AS ENUM ('pending', 'running', 'completed', 'failed', 'cancelled');

-- CreateEnum
CREATE TYPE "LlmProvider" AS ENUM ('ollama', 'anthropic');

-- CreateTable
CREATE TABLE "users" (
    "id" TEXT NOT NULL,
    "kc_sub" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "preferred_username" TEXT NOT NULL,
    "given_name" TEXT,
    "family_name" TEXT,
    "full_name" TEXT,
    "direction" TEXT,
    "role" "UserRole" NOT NULL DEFAULT 'auditeur',
    "is_active" BOOLEAN NOT NULL DEFAULT true,
    "last_login" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "users_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "moodle_platforms" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "url" TEXT NOT NULL,
    "token_enc" TEXT NOT NULL,
    "version" TEXT NOT NULL DEFAULT '4',
    "site_name" TEXT,
    "release" TEXT,
    "last_check_at" TIMESTAMP(3),
    "is_active" BOOLEAN NOT NULL DEFAULT true,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "moodle_platforms_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "llm_configs" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "provider" "LlmProvider" NOT NULL,
    "api_url" TEXT,
    "api_key_enc" TEXT,
    "model" TEXT NOT NULL DEFAULT 'gemma3:12b',
    "is_default" BOOLEAN NOT NULL DEFAULT false,
    "is_active" BOOLEAN NOT NULL DEFAULT true,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "llm_configs_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "audit_sessions" (
    "id" TEXT NOT NULL,
    "session_key" TEXT NOT NULL,
    "name" TEXT,
    "status" "AuditStatus" NOT NULL DEFAULT 'pending',
    "total_courses" INTEGER NOT NULL DEFAULT 0,
    "done_courses" INTEGER NOT NULL DEFAULT 0,
    "failed_courses" INTEGER NOT NULL DEFAULT 0,
    "extract_images" BOOLEAN NOT NULL DEFAULT true,
    "quiz_detail" TEXT NOT NULL DEFAULT 'both',
    "categories_json" JSONB,
    "started_at" TIMESTAMP(3),
    "finished_at" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,
    "user_id" TEXT NOT NULL,
    "platform_id" TEXT NOT NULL,
    "llm_config_id" TEXT NOT NULL,

    CONSTRAINT "audit_sessions_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "course_audits" (
    "id" TEXT NOT NULL,
    "course_id" INTEGER NOT NULL,
    "shortname" TEXT NOT NULL,
    "fullname" TEXT NOT NULL,
    "category_name" TEXT,
    "category_path" TEXT,
    "visible" BOOLEAN NOT NULL DEFAULT true,
    "enrolled_count" INTEGER,
    "sections_count" INTEGER,
    "activities_count" INTEGER,
    "quiz_count" INTEGER,
    "assigns_count" INTEGER,
    "teachers_count" INTEGER,
    "result_json" JSONB NOT NULL,
    "score_global" INTEGER,
    "error_message" TEXT,
    "duration_ms" INTEGER,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "session_id" TEXT NOT NULL,

    CONSTRAINT "course_audits_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "analysis_jobs" (
    "id" TEXT NOT NULL,
    "bull_job_id" TEXT,
    "status" TEXT NOT NULL DEFAULT 'pending',
    "attempts" INTEGER NOT NULL DEFAULT 0,
    "error_message" TEXT,
    "started_at" TIMESTAMP(3),
    "finished_at" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "session_id" TEXT NOT NULL,

    CONSTRAINT "analysis_jobs_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "users_kc_sub_key" ON "users"("kc_sub");

-- CreateIndex
CREATE INDEX "users_kc_sub_idx" ON "users"("kc_sub");

-- CreateIndex
CREATE INDEX "users_direction_idx" ON "users"("direction");

-- CreateIndex
CREATE INDEX "llm_configs_is_default_idx" ON "llm_configs"("is_default");

-- CreateIndex
CREATE UNIQUE INDEX "audit_sessions_session_key_key" ON "audit_sessions"("session_key");

-- CreateIndex
CREATE INDEX "audit_sessions_user_id_idx" ON "audit_sessions"("user_id");

-- CreateIndex
CREATE INDEX "audit_sessions_status_idx" ON "audit_sessions"("status");

-- CreateIndex
CREATE INDEX "audit_sessions_session_key_idx" ON "audit_sessions"("session_key");

-- CreateIndex
CREATE INDEX "course_audits_session_id_idx" ON "course_audits"("session_id");

-- CreateIndex
CREATE INDEX "course_audits_score_global_idx" ON "course_audits"("score_global");

-- CreateIndex
CREATE UNIQUE INDEX "course_audits_session_id_course_id_key" ON "course_audits"("session_id", "course_id");

-- CreateIndex
CREATE UNIQUE INDEX "analysis_jobs_bull_job_id_key" ON "analysis_jobs"("bull_job_id");

-- CreateIndex
CREATE INDEX "analysis_jobs_session_id_idx" ON "analysis_jobs"("session_id");

-- CreateIndex
CREATE INDEX "analysis_jobs_status_idx" ON "analysis_jobs"("status");

-- AddForeignKey
ALTER TABLE "audit_sessions" ADD CONSTRAINT "audit_sessions_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "audit_sessions" ADD CONSTRAINT "audit_sessions_platform_id_fkey" FOREIGN KEY ("platform_id") REFERENCES "moodle_platforms"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "audit_sessions" ADD CONSTRAINT "audit_sessions_llm_config_id_fkey" FOREIGN KEY ("llm_config_id") REFERENCES "llm_configs"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "course_audits" ADD CONSTRAINT "course_audits_session_id_fkey" FOREIGN KEY ("session_id") REFERENCES "audit_sessions"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "analysis_jobs" ADD CONSTRAINT "analysis_jobs_session_id_fkey" FOREIGN KEY ("session_id") REFERENCES "audit_sessions"("id") ON DELETE CASCADE ON UPDATE CASCADE;
