-- Migration 012: Add session_duration_mins to batches table
-- Run in Supabase Dashboard → SQL Editor

ALTER TABLE batches
  ADD COLUMN IF NOT EXISTS session_duration_mins int DEFAULT 60;
