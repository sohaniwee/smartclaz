-- ============================================================
-- Migration 20260916: Split reschedule_policy and noshow_policy
-- into individual/group variants
-- Project: Smartclaz
-- Safe to re-run — all statements use IF NOT EXISTS / COALESCE guards.
-- ============================================================

-- ── TUTORS: split policy fields ──────────────────────────────
-- Old reschedule_policy / noshow_policy columns stay for now (backward
-- compat — nothing reads them going forward in the app, but nothing drops
-- them either). New fields are additive and are what signup/settings/the
-- bot now read and write.
ALTER TABLE tutors
  ADD COLUMN IF NOT EXISTS reschedule_policy_individual text,
  ADD COLUMN IF NOT EXISTS reschedule_policy_group      text,
  ADD COLUMN IF NOT EXISTS noshow_policy_individual     text,
  ADD COLUMN IF NOT EXISTS noshow_policy_group          text;

COMMENT ON COLUMN tutors.reschedule_policy_individual IS
  'Freeform reschedule policy text shown to individual-class students. Manual process — the tutor confirms the new time, no self-service slot picker exists.';
COMMENT ON COLUMN tutors.reschedule_policy_group IS
  'Freeform reschedule policy text shown to batch/group-class students. Typically "no individual reschedules — join the next session" since a batch has one fixed weekly slot.';
COMMENT ON COLUMN tutors.noshow_policy_individual IS
  'Freeform no-show policy text for individual-class students.';
COMMENT ON COLUMN tutors.noshow_policy_group IS
  'Freeform no-show policy text for batch/group-class students.';

-- Backfill: copy any existing single-value policy into BOTH new columns
-- as a starting point, so nobody is left with a blank policy. Tutors can
-- then edit the individual/group versions independently going forward.
UPDATE tutors
SET
  reschedule_policy_individual = COALESCE(reschedule_policy_individual, reschedule_policy),
  reschedule_policy_group      = COALESCE(reschedule_policy_group, reschedule_policy),
  noshow_policy_individual     = COALESCE(noshow_policy_individual, noshow_policy),
  noshow_policy_group          = COALESCE(noshow_policy_group, noshow_policy)
WHERE reschedule_policy IS NOT NULL
   OR noshow_policy IS NOT NULL;
