-- ── Zoom link columns — sessions ─────────────────────────────────────────────
-- Already present in initial schema per CLAUDE.md; added here with IF NOT EXISTS
-- for idempotent re-runs and environments where the initial migration was partial.

ALTER TABLE sessions
  ADD COLUMN IF NOT EXISTS zoom_link         text,
  ADD COLUMN IF NOT EXISTS zoom_meeting_id   text;

-- Reminder-sent flags used by app/api/reminders/send/route.ts
-- Prevent double-sending the same reminder across cron runs.
ALTER TABLE sessions
  ADD COLUMN IF NOT EXISTS reminder_24h_sent    boolean DEFAULT false,
  ADD COLUMN IF NOT EXISTS reminder_1h_sent     boolean DEFAULT false,
  ADD COLUMN IF NOT EXISTS tutor_notified_30min boolean DEFAULT false;

-- ── Zoom link columns — batches ───────────────────────────────────────────────
-- current_zoom_link / current_zoom_meeting_id: this week's active Zoom meeting.
-- Refreshed every Sunday by the reminders cron and /api/zoom/refresh-batch.
-- zoom_meeting_id: alias kept for spec compatibility (same as current_zoom_meeting_id).
-- schedule_day_number: integer mapping of schedule_day for Zoom API (1=Sun … 7=Sat).
-- session_duration_mins: default 60; tutor can override per batch.

ALTER TABLE batches
  ADD COLUMN IF NOT EXISTS current_zoom_link       text,
  ADD COLUMN IF NOT EXISTS current_zoom_meeting_id text,
  ADD COLUMN IF NOT EXISTS zoom_meeting_id         text,
  ADD COLUMN IF NOT EXISTS zoom_link_generated_at  timestamptz,
  ADD COLUMN IF NOT EXISTS schedule_day_number     int,
  ADD COLUMN IF NOT EXISTS session_duration_mins   int DEFAULT 60;

-- ── Reminder-sent flag — payments ─────────────────────────────────────────────
ALTER TABLE payments
  ADD COLUMN IF NOT EXISTS reminder_3day_sent boolean DEFAULT false;

-- ── Index: student upcoming sessions (used by payments/verify + reminders) ────
CREATE INDEX IF NOT EXISTS idx_sessions_student_scheduled
  ON sessions (student_id, scheduled_at)
  WHERE status = 'scheduled';

-- ── Index: batch upcoming sessions (used by zoom refresh) ─────────────────────
CREATE INDEX IF NOT EXISTS idx_sessions_batch_scheduled
  ON sessions (batch_id, scheduled_at)
  WHERE status = 'scheduled';

-- ── Index: payments by student + month (used by sendLinkToPaidStudents) ───────
CREATE INDEX IF NOT EXISTS idx_payments_student_month
  ON payments (student_id, month_year, status);
