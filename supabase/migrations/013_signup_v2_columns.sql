-- Migration 013: Ensure all columns needed by signup v2 exist
-- Safe to re-run (all use IF NOT EXISTS)

ALTER TABLE tutors
  ADD COLUMN IF NOT EXISTS buffer_mins int DEFAULT 0,
  ADD COLUMN IF NOT EXISTS session_duration_mins int DEFAULT 60;

-- taking_new_individual is used at per-grade level in subjects JSONB (not as a top-level column)
-- but we keep the column for backwards compat with old middleware reads
ALTER TABLE tutors
  ADD COLUMN IF NOT EXISTS taking_new_individual boolean DEFAULT true;
