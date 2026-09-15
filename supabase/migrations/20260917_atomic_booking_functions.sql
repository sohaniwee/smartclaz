-- ============================================================
-- Migration 20260917b: Atomic booking functions
-- Project: Smartclaz
-- Depends on 20260917_individual_slots_and_class_type.sql
-- (students.scheduled_day/scheduled_time + the unique partial index)
-- Safe to re-run — CREATE OR REPLACE.
-- ============================================================

-- ── book_individual_slot ──────────────────────────────────────
-- Atomic insert-or-reject for an individual slot. Correctness comes
-- from idx_students_individual_slot_unique (see prior migration),
-- not from a row lock — there's no existing row to lock when a slot
-- is genuinely open, so the unique index + exception handler here is
-- what actually prevents two students landing on the same slot.
CREATE OR REPLACE FUNCTION book_individual_slot(
  p_tutor_id uuid,
  p_subject  text,
  p_grade    text,
  p_day      text,
  p_time     text,
  p_student  jsonb
) RETURNS jsonb AS $$
DECLARE
  v_new_student_id uuid;
BEGIN
  BEGIN
    INSERT INTO students (
      tutor_id, name, whatsapp, subject, grade,
      class_type, status, monthly_fee,
      scheduled_day, scheduled_time,
      consent_given, consent_at
    )
    VALUES (
      p_tutor_id,
      p_student->>'name',
      p_student->>'whatsapp',
      p_subject, p_grade,
      'individual', 'active',
      (p_student->>'monthly_fee')::numeric,
      p_day, p_time,
      true, now()
    )
    RETURNING id INTO v_new_student_id;
  EXCEPTION WHEN unique_violation THEN
    RETURN jsonb_build_object('success', false, 'reason', 'slot_taken');
  END;

  RETURN jsonb_build_object('success', true, 'student_id', v_new_student_id);
END;
$$ LANGUAGE plpgsql;

-- ── book_batch_slot ────────────────────────────────────────────
-- Atomic capacity-check-and-insert for a batch. Correctness comes
-- from "SELECT ... FOR UPDATE" on the batches row, which ALWAYS
-- exists (unlike an open individual slot) — Postgres blocks a
-- concurrent call's FOR UPDATE until this transaction commits or
-- rolls back, so the second caller always sees the up-to-date
-- enrolled count, never a stale one.
CREATE OR REPLACE FUNCTION book_batch_slot(
  p_tutor_id uuid,
  p_batch_id uuid,
  p_student  jsonb
) RETURNS jsonb AS $$
DECLARE
  v_enrolled        int;
  v_max             int;
  v_new_student_id  uuid;
BEGIN
  SELECT max_students INTO v_max
  FROM batches
  WHERE id = p_batch_id AND tutor_id = p_tutor_id
  FOR UPDATE;

  IF v_max IS NULL THEN
    RETURN jsonb_build_object('success', false, 'reason', 'batch_not_found');
  END IF;

  SELECT count(*) INTO v_enrolled
  FROM students
  WHERE batch_id = p_batch_id
    AND class_type = 'group'
    AND status = 'active';

  IF v_enrolled >= v_max THEN
    RETURN jsonb_build_object('success', false, 'reason', 'batch_full');
  END IF;

  INSERT INTO students (
    tutor_id, batch_id, name, whatsapp, subject, grade,
    class_type, status, monthly_fee,
    consent_given, consent_at
  )
  VALUES (
    p_tutor_id, p_batch_id,
    p_student->>'name',
    p_student->>'whatsapp',
    p_student->>'subject',
    p_student->>'grade',
    'group', 'active',
    (p_student->>'monthly_fee')::numeric,
    true, now()
  )
  RETURNING id INTO v_new_student_id;

  -- Flip accepting_new INSIDE the same transaction, while still
  -- holding the row lock from the SELECT above — closes the
  -- "reactive flag" timing gap (previously flipped after commit,
  -- in a separate follow-up query with no lock at all).
  IF v_enrolled + 1 >= v_max THEN
    UPDATE batches SET accepting_new = false WHERE id = p_batch_id;
  END IF;

  RETURN jsonb_build_object('success', true, 'student_id', v_new_student_id);
END;
$$ LANGUAGE plpgsql;
