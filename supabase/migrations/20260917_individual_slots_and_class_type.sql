-- ============================================================
-- Migration 20260917a: Individual slot tracking + class_type
-- standardization
-- Project: Smartclaz
-- Safe to re-run — guarded with IF NOT EXISTS / IF EXISTS.
-- ============================================================

-- ── STUDENTS: individual slot tracking ───────────────────────
-- Which configured individual_slots entry (from tutors.subjects
-- JSONB) this student occupies. Only meaningful when
-- class_type = 'individual'.
ALTER TABLE students
  ADD COLUMN IF NOT EXISTS scheduled_day  text,
  ADD COLUMN IF NOT EXISTS scheduled_time text;

COMMENT ON COLUMN students.scheduled_day IS
  'Day of the configured individual_slots entry this student occupies (class_type=individual only). E.g. "Monday".';
COMMENT ON COLUMN students.scheduled_time IS
  'Time of the configured individual_slots entry this student occupies (class_type=individual only). E.g. "15:00".';

-- ── STUDENTS: standardize class_type ─────────────────────────
-- 'batch' and 'group' have been used interchangeably by different
-- insert paths across the app (AddStudentModal/EditStudentPanel
-- wrote 'batch', CSV import/bot waitlist wrote 'group'). The
-- table's own original comment always said 'group' was correct —
-- collapse everything onto that and enforce it going forward.
UPDATE students
SET class_type = 'group'
WHERE class_type = 'batch';

ALTER TABLE students
  DROP CONSTRAINT IF EXISTS students_class_type_check;

ALTER TABLE students
  ADD CONSTRAINT students_class_type_check
  CHECK (class_type IN ('individual', 'group', 'trial'));

-- ── UNIQUE index for live individual-slot occupancy ──────────
-- Must be UNIQUE, not a plain index — this is what actually closes
-- the double-booking race. A "SELECT count(*) ... FOR UPDATE" guard
-- only locks EXISTING rows; when a slot is open there is nothing to
-- lock, so two concurrent inserts would both see count=0 and both
-- succeed. A unique constraint makes the second INSERT fail outright
-- (caught as unique_violation in book_individual_slot() below),
-- which is the only way to make this atomic without a row to lock.
CREATE UNIQUE INDEX IF NOT EXISTS idx_students_individual_slot_unique
  ON students (tutor_id, subject, grade, scheduled_day, scheduled_time)
  WHERE class_type = 'individual' AND status = 'active';
