-- Migration 010: Batch capacity, waitlist, availability step columns
-- Run in Supabase Dashboard → SQL Editor

-- Batches: add accepting_new flag (max_students already exists)
ALTER TABLE batches
  ADD COLUMN IF NOT EXISTS accepting_new boolean DEFAULT true;

-- Tutors: availability step data
ALTER TABLE tutors
  ADD COLUMN IF NOT EXISTS taking_new_individual boolean,
  -- null = step not yet done, true = taking new, false = not taking
  ADD COLUMN IF NOT EXISTS session_duration_mins int DEFAULT 60,
  ADD COLUMN IF NOT EXISTS buffer_mins int DEFAULT 15;

-- Waitlist table
CREATE TABLE IF NOT EXISTS waitlist (
  id              uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  tutor_id        uuid        NOT NULL REFERENCES tutors(id) ON DELETE CASCADE,
  student_name    text        NOT NULL,
  student_whatsapp text       NOT NULL,
  subject         text        NOT NULL,
  grade           text        NOT NULL,
  class_type      text        NOT NULL DEFAULT 'group',
  batch_id        uuid        REFERENCES batches(id),
  status          text        NOT NULL DEFAULT 'waiting',
  -- waiting | offered | enrolled | expired
  notified_at     timestamptz,
  created_at      timestamptz NOT NULL DEFAULT now()
);

-- RLS for waitlist
ALTER TABLE waitlist ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Tutors see own waitlist"
  ON waitlist FOR ALL
  USING (tutor_id = auth.uid());

-- Index for fast tutor queries
CREATE INDEX IF NOT EXISTS waitlist_tutor_id_idx
  ON waitlist (tutor_id, status, created_at DESC);

-- View: batches with live student count
DROP VIEW IF EXISTS batches_with_count;
CREATE VIEW batches_with_count AS
SELECT
  b.*,
  COALESCE(COUNT(s.id), 0) AS current_students_count
FROM batches b
LEFT JOIN students s
  ON s.batch_id = b.id
  AND s.status = 'active'
GROUP BY b.id;
