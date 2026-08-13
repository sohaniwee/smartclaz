-- ============================================================
-- Migration 20260813b: Overdue-payment consent + notification
-- tracking (auto vs manual reminder mode)
-- Project: Smartclaz
-- Safe to re-run — all statements use IF NOT EXISTS.
-- ============================================================

-- ── TUTORS: reminder-mode consent ────────────────────────────
ALTER TABLE tutors
  ADD COLUMN IF NOT EXISTS auto_notify_overdue   boolean NOT NULL DEFAULT true,
  ADD COLUMN IF NOT EXISTS manual_mode_hint_seen boolean NOT NULL DEFAULT false;

COMMENT ON COLUMN tutors.auto_notify_overdue IS
  'true = system messages students directly for all 3 reminder stages (3-day, due, overdue). false = system only notifies the tutor; tutor sends manually via existing Send reminder buttons.';
COMMENT ON COLUMN tutors.manual_mode_hint_seen IS
  'Whether the one-time Dashboard explainer for manual mode has been dismissed. Reset to false whenever the tutor switches INTO manual mode.';

-- ── PAYMENTS: per-stage tutor-notification tracking ──────────
-- Prevents repeat tutor notifications for the same payment in
-- manual mode, since the cron runs every 15 minutes.
ALTER TABLE payments
  ADD COLUMN IF NOT EXISTS tutor_notified_3day boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS tutor_notified_due   boolean NOT NULL DEFAULT false;

COMMENT ON COLUMN payments.tutor_notified_3day IS
  'Manual mode only: tutor has already been notified this payment is due in 3 days — prevents duplicate notifications across cron runs.';
COMMENT ON COLUMN payments.tutor_notified_due IS
  'Manual mode only: tutor has already been notified this payment is due today — prevents duplicate notifications across cron runs.';
