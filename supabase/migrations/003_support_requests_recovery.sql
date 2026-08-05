-- Migration 003: Add recovery columns to support_requests
-- Run in Supabase Dashboard → SQL Editor
--
-- 📝 NOTE: Extends support_requests (created in 002) with the additional columns
--    needed for the "Lost both email and phone" recovery flow (Recovery C).
--    The rename of `details` → `proof_details` also makes the column name
--    consistent with the SupportRequestRow TypeScript type.

-- ✅ Add new columns for Recovery C (Lost both email and phone flow)
ALTER TABLE support_requests
ADD COLUMN IF NOT EXISTS old_email        text,
ADD COLUMN IF NOT EXISTS old_phone        text,
ADD COLUMN IF NOT EXISTS new_email        text,
ADD COLUMN IF NOT EXISTS new_phone        text,
ADD COLUMN IF NOT EXISTS resolved_at      timestamptz,
ADD COLUMN IF NOT EXISTS resolved_by      text,
ADD COLUMN IF NOT EXISTS resolution_notes text;

-- 🚀 Rename 'details' → 'proof_details' if the old column name still exists
--    (safe to re-run: the DO block checks before renaming)
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name  = 'support_requests'
    AND   column_name = 'details'
  ) THEN
    ALTER TABLE support_requests
    RENAME COLUMN details TO proof_details;
  END IF;
END $$;

-- ✅ Add proof_details if it doesn't exist yet (covers fresh installs where
--    the rename above was not needed)
ALTER TABLE support_requests
ADD COLUMN IF NOT EXISTS proof_details text;

-- 📝 Document the full set of allowed status values on the column itself.
--    status values:
--      'pending'       = received, not yet reviewed
--      'investigating' = support team asked for more info
--      'resolved'      = account successfully recovered
--      'rejected'      = could not verify identity
COMMENT ON COLUMN support_requests.status IS
  'pending | investigating | resolved | rejected';
