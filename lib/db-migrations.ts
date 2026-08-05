// ═══════════════════════════════════════════════════════════
// DATABASE MIGRATIONS — Run these in Supabase SQL editor
// Dashboard: supabase.com → your project → SQL Editor
// ═══════════════════════════════════════════════════════════

export const DB_MIGRATIONS = `

-- ── tutors table additions ──────────────────────────────────
ALTER TABLE tutors ADD COLUMN IF NOT EXISTS status text DEFAULT 'pending';
ALTER TABLE tutors ADD COLUMN IF NOT EXISTS email_verified boolean DEFAULT false;
ALTER TABLE tutors ADD COLUMN IF NOT EXISTS phone_verified boolean DEFAULT false;
ALTER TABLE tutors ADD COLUMN IF NOT EXISTS last_active_at timestamptz DEFAULT now();
ALTER TABLE tutors ADD COLUMN IF NOT EXISTS avatar_url text;
ALTER TABLE tutors ADD COLUMN IF NOT EXISTS recovery_email text;

-- unique_email constraint (safe — checks pg_constraint before adding)
DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'unique_email'
    AND conrelid = 'tutors'::regclass
  ) THEN
    ALTER TABLE tutors ADD CONSTRAINT unique_email UNIQUE (email);
  END IF;
END $$;

-- unique_phone constraint (safe — checks pg_constraint before adding)
DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'unique_phone'
    AND conrelid = 'tutors'::regclass
  ) THEN
    ALTER TABLE tutors ADD CONSTRAINT unique_phone UNIQUE (phone);
  END IF;
END $$;

-- ── RLS policies ────────────────────────────────────────────
ALTER TABLE tutors ENABLE ROW LEVEL SECURITY;

-- tutor_own_record policy (safe — checks pg_policies before creating)
DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE policyname = 'tutor_own_record'
    AND tablename = 'tutors'
  ) THEN
    CREATE POLICY "tutor_own_record" ON tutors
      FOR ALL USING (id = auth.uid());
  END IF;
END $$;

-- (Add policies for students, batches, sessions, payments, conversations when those tables exist)

-- ── otp_attempts table ─────────────────────────────────────
CREATE TABLE IF NOT EXISTS otp_attempts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  identifier text NOT NULL,
  attempts int DEFAULT 0,
  locked_until timestamptz,
  last_attempt_at timestamptz DEFAULT now()
);

ALTER TABLE otp_attempts ENABLE ROW LEVEL SECURITY;

-- own_otp_attempts policy (safe — checks pg_policies before creating)
DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE policyname = 'own_otp_attempts'
    AND tablename = 'otp_attempts'
  ) THEN
    CREATE POLICY "own_otp_attempts" ON otp_attempts
      FOR ALL USING (
        identifier = auth.jwt()->>'email' OR
        identifier = auth.jwt()->>'phone'
      );
  END IF;
END $$;

-- ── rate_limits table ──────────────────────────────────────
CREATE TABLE IF NOT EXISTS rate_limits (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  ip_address text NOT NULL,
  action text NOT NULL,
  attempts int DEFAULT 1,
  window_start timestamptz DEFAULT now(),
  blocked_until timestamptz
);
-- Service role only — no RLS needed (admin table)

-- ── audit_logs table ───────────────────────────────────────
CREATE TABLE IF NOT EXISTS audit_logs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tutor_id uuid REFERENCES tutors(id),
  action text NOT NULL,
  entity text,
  entity_id text,
  old_value jsonb,
  new_value jsonb,
  ip_address text,
  user_agent text,
  status text DEFAULT 'success',
  created_at timestamptz DEFAULT now()
);
-- Service role only — no user RLS

-- ── Supabase dashboard settings ────────────────────────────
-- Authentication → Settings → OTP Expiry: 600 (seconds)
-- Authentication → Settings → JWT expiry: 3600 (seconds)
-- Authentication → Settings → Refresh token expiry: 2592000

` as const
