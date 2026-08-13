-- ============================================================
-- Migration 20260813: Fix missing students → batches foreign key
-- Project: Smartclaz
-- Safe to re-run.
--
-- 006_core_app_tables.sql created students.batch_id without a FK
-- (batches didn't exist yet), then tried to retroactively attach
-- one via "ADD COLUMN IF NOT EXISTS batch_id ... REFERENCES
-- batches(id)". Since the column already existed, that ALTER was
-- a no-op and the FK was never created — PostgREST's schema
-- cache has no relationship to embed students↔batches on, which
-- breaks any select('*, students(*, batches(*))') query.
-- ============================================================

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'students_batch_id_fkey'
  ) THEN
    ALTER TABLE students
      ADD CONSTRAINT students_batch_id_fkey
      FOREIGN KEY (batch_id) REFERENCES batches(id) ON DELETE SET NULL;
  END IF;
END $$;

-- Make PostgREST pick up the new relationship immediately
NOTIFY pgrst, 'reload schema';
