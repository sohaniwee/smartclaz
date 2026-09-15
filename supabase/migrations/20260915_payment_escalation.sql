-- ============================================================
-- Migration 20260915: Overdue-payment escalation ("blocking
-- nudge") preference + one-time tutor ping tracking
-- Project: Smartclaz
-- Safe to re-run — all statements use IF NOT EXISTS.
-- ============================================================

-- ── TUTORS: escalation preference ────────────────────────────
-- Separate from auto_notify_overdue (which controls messages sent
-- to STUDENTS). This controls whether an overdue payment gets a
-- louder visual treatment for the TUTOR after N days overdue.
-- Blocking a student's access remains 100% manual in all cases —
-- this never automates or triggers a block.
ALTER TABLE tutors
  ADD COLUMN IF NOT EXISTS block_reminder_enabled boolean DEFAULT true,
  ADD COLUMN IF NOT EXISTS block_reminder_days     int     DEFAULT 7;

COMMENT ON COLUMN tutors.block_reminder_enabled IS
  'Whether overdue payments should be flagged more urgently for the tutor after block_reminder_days days overdue. Purely a visual/notification escalation — never blocks a student automatically.';
COMMENT ON COLUMN tutors.block_reminder_days IS
  'Days overdue after which a payment is flagged as "seriously overdue" for the tutor. Null/ignored when block_reminder_enabled is false.';

-- ── PAYMENTS: one-time escalation ping tracking ──────────────
-- Ensures the tutor gets pinged exactly once when a payment
-- crosses the escalation threshold, regardless of how many times
-- the reminders cron runs afterward. Never reset manually — next
-- month's payment is a new row and starts false naturally.
ALTER TABLE payments
  ADD COLUMN IF NOT EXISTS escalation_notified boolean NOT NULL DEFAULT false;

COMMENT ON COLUMN payments.escalation_notified IS
  'Whether the tutor has already been sent the one-time escalation ping for this payment crossing block_reminder_days overdue.';
