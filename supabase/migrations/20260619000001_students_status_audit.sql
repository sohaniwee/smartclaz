-- ============================================================
-- Migration: Students status tracking + audit log RLS
-- Adds status_reason and deactivated_at to the students table.
-- phone_history already exists from migration 007 — skipped.
-- audit_logs table already exists from migration 001.
-- Adds RLS INSERT/SELECT policies so authenticated tutors can
-- write and read their own audit log rows from API route handlers.
-- Safe to re-run (all statements use IF NOT EXISTS or guard blocks).
-- ============================================================

-- ── STUDENTS: status deactivation tracking ──────────────────
ALTER TABLE students
  ADD COLUMN IF NOT EXISTS status_reason  text,
  ADD COLUMN IF NOT EXISTS deactivated_at timestamptz;

COMMENT ON COLUMN students.status_reason IS
  'Human-readable reason the tutor deactivated or blocked this student. Cleared when re-activated.';

COMMENT ON COLUMN students.deactivated_at IS
  'Timestamp set when status changes to inactive or blocked. Cleared when status returns to active.';

-- ── AUDIT LOGS: RLS policies for tutor INSERT/SELECT ────────
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE tablename = 'audit_logs'
      AND policyname = 'audit_logs_tutor_select'
  ) THEN
    EXECUTE $pol$
      CREATE POLICY "audit_logs_tutor_select"
        ON audit_logs FOR SELECT
        USING (auth.uid() = tutor_id)
    $pol$;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE tablename = 'audit_logs'
      AND policyname = 'audit_logs_tutor_insert'
  ) THEN
    EXECUTE $pol$
      CREATE POLICY "audit_logs_tutor_insert"
        ON audit_logs FOR INSERT
        WITH CHECK (auth.uid() = tutor_id)
    $pol$;
  END IF;
END
$$;

-- ── INDEXES for new columns ──────────────────────────────────
CREATE INDEX IF NOT EXISTS idx_students_deactivated_at
  ON students(tutor_id, deactivated_at)
  WHERE deactivated_at IS NOT NULL;
