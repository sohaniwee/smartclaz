-- Migration 011: Trial class tracking
-- Run in Supabase Dashboard → SQL Editor

-- Students: trial status tracking
ALTER TABLE students
  ADD COLUMN IF NOT EXISTS trial_fee_paid  numeric  DEFAULT 0,
  ADD COLUMN IF NOT EXISTS trial_status    text     DEFAULT null;

-- trial_status values:
--   null         = not on trial
--   'scheduled'  = trial class booked
--   'completed'  = trial done, awaiting tutor decision
--   'accepted'   = tutor accepted, student converting
--   'declined'   = tutor declined
--   'converted'  = fully converted to regular student

-- Payments: trial payment tracking
ALTER TABLE payments
  ADD COLUMN IF NOT EXISTS is_trial_payment   boolean  DEFAULT false,
  ADD COLUMN IF NOT EXISTS trial_deduction    numeric  DEFAULT 0,
  ADD COLUMN IF NOT EXISTS full_fee           numeric  DEFAULT 0,
  ADD COLUMN IF NOT EXISTS payment_reference  text     DEFAULT null;

-- Index for fast trial student queries
CREATE INDEX IF NOT EXISTS students_trial_status_idx
  ON students (tutor_id, trial_status)
  WHERE trial_status IS NOT NULL;
