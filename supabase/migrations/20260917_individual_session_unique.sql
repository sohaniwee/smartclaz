-- ============================================================
-- Migration 20260917c: Unique constraint for individual session
-- generation upserts
-- Project: Smartclaz
-- Mirrors sessions_tutor_batch_scheduled_unique (see
-- 20260622000001_sessions_attendance_notifications.sql) but for
-- per-student individual sessions instead of per-batch ones.
-- Safe to re-run — guarded with a catalog check.
-- ============================================================

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'sessions_student_scheduled_unique'
  ) THEN
    ALTER TABLE sessions
      ADD CONSTRAINT sessions_student_scheduled_unique
      UNIQUE (student_id, scheduled_at);
  END IF;
END $$;
