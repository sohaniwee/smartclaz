-- Migration 007: Security fixes — returning student tracking,
-- payment references, message rate limiting, student blocking
-- Run in Supabase Dashboard → SQL Editor
-- All statements are IF NOT EXISTS — safe to re-run

-- FIX 2: Returning student / phone history tracking
ALTER TABLE students
  ADD COLUMN IF NOT EXISTS phone_history  jsonb       DEFAULT '[]',
  ADD COLUMN IF NOT EXISTS first_seen_at  timestamptz DEFAULT now(),
  ADD COLUMN IF NOT EXISTS blocked_at     timestamptz,
  ADD COLUMN IF NOT EXISTS blocked_reason text;
  -- blocked_reason values: 'spam' | 'abusive' | 'non_payment' | 'other'

COMMENT ON COLUMN students.phone_history IS
  'JSON array of previous WhatsApp numbers. Populated when phone changes. Audit trail for fraud detection.';
COMMENT ON COLUMN students.blocked_at IS
  'Set when tutor blocks student. NULL = not blocked. Bot ignores blocked students.';
COMMENT ON COLUMN students.blocked_reason IS
  'spam | abusive | non_payment | other';

-- FIX 3: Payment reference and screenshot tracking
ALTER TABLE payments
  ADD COLUMN IF NOT EXISTS payment_reference      text,
  ADD COLUMN IF NOT EXISTS payment_screenshot_url text;

COMMENT ON COLUMN payments.payment_reference IS
  'Transfer reference number or last 4 digits provided by student. Helps tutor verify quickly in bank app.';
COMMENT ON COLUMN payments.payment_screenshot_url IS
  'Optional: URL of payment receipt image uploaded by student to Supabase storage.';

-- FIX 8: Student phone on message_logs for per-phone rate limiting
ALTER TABLE message_logs
  ADD COLUMN IF NOT EXISTS student_phone text;

COMMENT ON COLUMN message_logs.student_phone IS
  'WhatsApp number of the student who triggered this message. Used for per-phone rate limiting (30 msgs/hr).';

-- Index for rate limit query performance
CREATE INDEX IF NOT EXISTS idx_message_logs_student_phone_created
  ON message_logs(student_phone, created_at)
  WHERE student_phone IS NOT NULL;

-- Index for blocked student lookup
CREATE INDEX IF NOT EXISTS idx_students_blocked
  ON students(tutor_id, whatsapp)
  WHERE blocked_at IS NOT NULL;
