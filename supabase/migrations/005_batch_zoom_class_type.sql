-- ============================================================
-- Migration 005: Batch Zoom link tracking + student class_type
-- Project: Smartclaz
-- Run in Supabase Dashboard → SQL Editor
-- ============================================================
--
-- 📝 NOTE: Extends batches with columns that track this week's
--    active Zoom link and when it was last generated, plus an
--    integer weekday alias used by the Zoom recurrence API.
--    Extends students with an explicit class_type column so the
--    Zoom link strategy (individual link vs. batch link) can be
--    determined without a JOIN on batches at payment-verify time.
--    Safe to re-run — every ALTER uses IF NOT EXISTS.
--
-- Prerequisites: migration 001 (core schema) must already be
--    applied (batches and students tables must exist).

-- ────────────────────────────────────────────────────────────
-- BATCHES — weekly Zoom link tracking
-- ✅ current_zoom_link: the live join URL sent to students this
--    week. Refreshed every Sunday at 06:00 by the cron job.
-- ✅ current_zoom_meeting_id: the Zoom meeting ID paired with the
--    link above — kept separate so the tutor's dashboard can
--    show it for manual access without parsing the URL.
-- ✅ zoom_link_generated_at: timestamp of the last refresh.
--    The cron job checks this to skip batches that were already
--    refreshed in the current week's window.
-- ────────────────────────────────────────────────────────────
ALTER TABLE batches
  ADD COLUMN IF NOT EXISTS current_zoom_link       text,
  ADD COLUMN IF NOT EXISTS current_zoom_meeting_id text,
  ADD COLUMN IF NOT EXISTS zoom_link_generated_at  timestamptz;

COMMENT ON COLUMN batches.current_zoom_link IS
  'This week''s active Zoom join URL for the batch. Refreshed every Sunday at 06:00 by the cron job.';

COMMENT ON COLUMN batches.current_zoom_meeting_id IS
  'Zoom meeting ID paired with current_zoom_link. Displayed on the dashboard for manual tutor access.';

COMMENT ON COLUMN batches.zoom_link_generated_at IS
  'When current_zoom_link was last generated. Used by the cron job to detect if this week''s link has already been refreshed.';

-- ────────────────────────────────────────────────────────────
-- BATCHES — Zoom recurrence weekday number
-- ✅ schedule_day_number: integer alias for schedule_day, used
--    by the Zoom API when creating recurring meetings.
--    Mapping: 1=Sunday  2=Monday  3=Tuesday  4=Wednesday
--             5=Thursday  6=Friday  7=Saturday
-- 📝 NOTE: schedule_day (text) remains the human-readable
--    source of truth; schedule_day_number is a derived helper
--    that must be kept in sync when a batch schedule is edited.
-- ────────────────────────────────────────────────────────────
ALTER TABLE batches
  ADD COLUMN IF NOT EXISTS schedule_day_number int DEFAULT 1;

COMMENT ON COLUMN batches.schedule_day_number IS
  'Zoom recurrence weekday: 1=Sunday, 2=Monday, 3=Tuesday, 4=Wednesday, 5=Thursday, 6=Friday, 7=Saturday. Keep in sync with schedule_day (text).';

-- ────────────────────────────────────────────────────────────
-- STUDENTS — explicit class type column
-- ✅ class_type drives the Zoom link strategy at payment
--    verification time:
--      individual → generate a fresh per-student link
--      group      → use batches.current_zoom_link
--      trial      → generate a one-off link; no recurring meeting
-- 📝 NOTE: values must match ClassType in lib/types/database.ts
--    ('individual' | 'group' | 'trial')
-- 🚀 BEFORE LAUNCH: add a CHECK constraint once all existing rows
--    have been backfilled so the DB enforces the allowed set.
-- ────────────────────────────────────────────────────────────
ALTER TABLE students
  ADD COLUMN IF NOT EXISTS class_type text DEFAULT 'individual';

COMMENT ON COLUMN students.class_type IS
  'individual | group | trial — determines Zoom link strategy on payment verification.';
