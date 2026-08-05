-- ============================================================
-- Migration 004: Bot and reminder tracking columns
-- Project: Smartclaz
-- Run in Supabase Dashboard → SQL Editor
-- ============================================================
--
-- 📝 NOTE: This migration extends the core business tables
--    (sessions, payments, conversations) with the columns
--    needed by the WhatsApp bot and the reminder scheduler.
--    It is safe to re-run — every statement uses IF NOT EXISTS
--    or IF EXISTS guards.
--
-- Prerequisites: core schema must already be applied
--    (students, sessions, batches, payments, conversations tables
--    must exist before this migration is run).

-- ────────────────────────────────────────────────────────────
-- SESSIONS — reminder sent flags
-- ✅ Lets the reminder scheduler skip sessions that have
--    already received a notification for that window.
-- ────────────────────────────────────────────────────────────
ALTER TABLE sessions
  ADD COLUMN IF NOT EXISTS reminder_24h_sent    boolean DEFAULT false,
  ADD COLUMN IF NOT EXISTS reminder_1h_sent     boolean DEFAULT false,
  ADD COLUMN IF NOT EXISTS tutor_notified_30min boolean DEFAULT false;

-- 📝 NOTE: columns are intentionally NOT nullable (DEFAULT false) so that
--    scheduler queries can use a simple equality check:
--      WHERE reminder_24h_sent = false AND scheduled_at <= now() + interval '24 hours'

-- ────────────────────────────────────────────────────────────
-- PAYMENTS — reminder sent flags
-- ✅ Prevents duplicate payment-due messages to students.
--    Mirrors the same pattern used for session reminders.
-- ────────────────────────────────────────────────────────────
ALTER TABLE payments
  ADD COLUMN IF NOT EXISTS reminder_3day_sent   boolean DEFAULT false,
  ADD COLUMN IF NOT EXISTS reminder_due_sent    boolean DEFAULT false,
  ADD COLUMN IF NOT EXISTS reminder_overdue_sent boolean DEFAULT false;

-- ────────────────────────────────────────────────────────────
-- CONVERSATIONS — bot test mode + message history
-- ✅ test_mode: when true, bot replies are logged but NOT sent
--    via Twilio — useful for staging and manual QA.
-- ✅ messages: full chronological log of every message in this
--    conversation stored as a JSONB array. Each entry has the
--    shape: { from, message, state?, time }
-- 🚀 BEFORE LAUNCH: consider moving messages to a dedicated
--    child table if conversation volume is high — JSONB arrays
--    grow unbounded and degrade update performance over time.
-- ────────────────────────────────────────────────────────────
ALTER TABLE conversations
  ADD COLUMN IF NOT EXISTS test_mode boolean DEFAULT false,
  ADD COLUMN IF NOT EXISTS messages  jsonb   DEFAULT '[]';

-- ────────────────────────────────────────────────────────────
-- INDEXES
-- ────────────────────────────────────────────────────────────

-- ✅ Fast lookup when the bot resolves which conversation belongs
--    to an incoming WhatsApp message for a given tutor.
CREATE INDEX IF NOT EXISTS idx_conversations_tutor_student
  ON conversations(tutor_id, student_whatsapp);

-- ✅ Partial index: reminder scheduler queries only care about
--    sessions that are still in 'scheduled' status.
CREATE INDEX IF NOT EXISTS idx_sessions_scheduled_at
  ON sessions(scheduled_at)
  WHERE status = 'scheduled';

-- ✅ Partial index: payment reminder queries only care about
--    payments that are still 'pending'.
CREATE INDEX IF NOT EXISTS idx_payments_due_date
  ON payments(due_date)
  WHERE status = 'pending';
