-- Migration: add import tracking columns to students table
-- These columns record how each student was added and group rows from the
-- same CSV upload together so a failed batch can be identified and rolled back
-- manually if needed.

ALTER TABLE students
  ADD COLUMN IF NOT EXISTS import_source text DEFAULT 'manual';
-- Allowed values: 'manual' | 'csv' | 'bot'

ALTER TABLE students
  ADD COLUMN IF NOT EXISTS import_batch_id text;
-- UUID generated once per CSV upload session.
-- All rows from the same file share the same value.

COMMENT ON COLUMN students.import_source IS
  'How the student was added: manual (one-by-one form), csv (bulk upload), bot (self-onboarding via WhatsApp)';

COMMENT ON COLUMN students.import_batch_id IS
  'Groups all students from the same CSV import. UUID generated client-side per upload.';
