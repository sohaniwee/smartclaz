-- ============================================================
-- Migration: Sessions feature — attendance, notifications,
--            sessions columns, unique constraint
-- Project:   Smartclaz
-- Date:      2026-06-22
--
-- HOW TO APPLY:
--   Supabase CLI is not configured locally.
--   Run this file manually via:
--     Supabase Dashboard → SQL Editor → paste contents → Run
--   All statements use IF NOT EXISTS or DO-guard blocks —
--   safe to re-run without side effects.
-- ============================================================

-- ── SESSIONS: add missing columns ───────────────────────────
-- duration_mins, zoom_link and notes already exist from
-- migration 006, but are listed here with IF NOT EXISTS
-- so this file is fully self-contained and safe to re-run.

ALTER TABLE sessions
  ADD COLUMN IF NOT EXISTS duration_mins      int         DEFAULT 60,
  ADD COLUMN IF NOT EXISTS notes              text,
  ADD COLUMN IF NOT EXISTS zoom_link          text,
  ADD COLUMN IF NOT EXISTS cancelled_reason   text,
  ADD COLUMN IF NOT EXISTS rescheduled_to     uuid        REFERENCES sessions(id);

COMMENT ON COLUMN sessions.cancelled_reason IS
  'Free-text reason recorded when a session is cancelled.';
COMMENT ON COLUMN sessions.rescheduled_to IS
  'Points to the replacement session when this session is rescheduled.';

-- ── SESSIONS: unique constraint for batch upsert ────────────
-- Allows ON CONFLICT (tutor_id, batch_id, scheduled_at) DO NOTHING
-- when generating batch sessions to prevent duplicates.
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'sessions_tutor_batch_scheduled_unique'
  ) THEN
    ALTER TABLE sessions
      ADD CONSTRAINT sessions_tutor_batch_scheduled_unique
      UNIQUE (tutor_id, batch_id, scheduled_at);
  END IF;
END
$$;

-- ── ATTENDANCE table (new) ───────────────────────────────────
CREATE TABLE IF NOT EXISTS attendance (
  id          uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  session_id  uuid        NOT NULL REFERENCES sessions(id)  ON DELETE CASCADE,
  student_id  uuid        NOT NULL REFERENCES students(id)  ON DELETE CASCADE,
  tutor_id    uuid        NOT NULL REFERENCES tutors(id)    ON DELETE CASCADE,
  status      text        NOT NULL DEFAULT 'unknown',
  -- 'present' | 'absent' | 'late' | 'unknown'
  marked_at   timestamptz,
  notes       text,
  created_at  timestamptz NOT NULL DEFAULT now(),
  UNIQUE (session_id, student_id)
);

COMMENT ON COLUMN attendance.status IS
  'present | absent | late | unknown';

-- ── NOTIFICATIONS table (new) ────────────────────────────────
CREATE TABLE IF NOT EXISTS notifications (
  id          uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  tutor_id    uuid        NOT NULL REFERENCES tutors(id) ON DELETE CASCADE,
  type        text        NOT NULL,
  -- 'payment_pending' | 'bot_needs_help' | 'overdue_fee'
  -- | 'no_show' | 'at_risk' | 'general'
  title       text,
  body        text,
  action_url  text,
  read        boolean     NOT NULL DEFAULT false,
  created_at  timestamptz NOT NULL DEFAULT now()
);

COMMENT ON COLUMN notifications.type IS
  'payment_pending | bot_needs_help | overdue_fee | no_show | at_risk | general';
COMMENT ON COLUMN notifications.action_url IS
  'Optional deep-link for the dashboard notification card (e.g. /sessions/123).';

-- ── ENABLE RLS ───────────────────────────────────────────────
ALTER TABLE attendance    ENABLE ROW LEVEL SECURITY;
ALTER TABLE notifications ENABLE ROW LEVEL SECURITY;

-- ── RLS POLICIES ─────────────────────────────────────────────
-- Use DO-guards because CREATE POLICY IF NOT EXISTS requires PG 17+
-- and Supabase currently runs PG 15.

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE tablename = 'attendance'
      AND policyname = 'tutor_own_attendance'
  ) THEN
    EXECUTE $pol$
      CREATE POLICY "tutor_own_attendance"
        ON attendance FOR ALL
        USING  (tutor_id = auth.uid())
        WITH CHECK (tutor_id = auth.uid())
    $pol$;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE tablename = 'notifications'
      AND policyname = 'tutor_own_notifications'
  ) THEN
    EXECUTE $pol$
      CREATE POLICY "tutor_own_notifications"
        ON notifications FOR ALL
        USING  (tutor_id = auth.uid())
        WITH CHECK (tutor_id = auth.uid())
    $pol$;
  END IF;
END
$$;

-- ── PERFORMANCE INDEXES ───────────────────────────────────────
CREATE INDEX IF NOT EXISTS idx_sessions_tutor_date
  ON sessions (tutor_id, scheduled_at);

CREATE INDEX IF NOT EXISTS idx_attendance_session
  ON attendance (session_id);

CREATE INDEX IF NOT EXISTS idx_attendance_tutor
  ON attendance (tutor_id);

CREATE INDEX IF NOT EXISTS idx_notifications_tutor_unread
  ON notifications (tutor_id, created_at DESC)
  WHERE read = false;
