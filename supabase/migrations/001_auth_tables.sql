-- ============================================================
-- Migration 001: Auth tables, RLS policies, storage bucket
-- Project: Smartclaz
-- ============================================================

-- ────────────────────────────────────────────────────────────
-- TUTORS
-- Primary record created on signup. id = auth.uid() so RLS
-- policies can simply check id = auth.uid().
-- ────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS tutors (
  id                   uuid        PRIMARY KEY DEFAULT auth.uid(),
  phone                text        UNIQUE NOT NULL,
  name                 text        NOT NULL,
  email                text        UNIQUE NOT NULL,
  email_verified       boolean     DEFAULT false,
  phone_verified       boolean     DEFAULT false,
  whatsapp_number      text,
  subjects             jsonb       DEFAULT '[]',
  availability         jsonb       DEFAULT '[]',
  payment_instructions text,
  reschedule_policy    text        DEFAULT 'auto_24h',
  -- 'auto_24h' | 'auto_48h' | 'manual'
  noshow_policy        text        DEFAULT 'ask',
  -- 'forfeit' | 'reschedule' | 'ask'
  notification_prefs   jsonb       DEFAULT '{}',
  monthly_due_date     int         DEFAULT 5,
  grace_period_days    int         DEFAULT 3,
  message_count        int         DEFAULT 0,
  plan                 text        DEFAULT 'trial',
  -- 'trial' | 'starter' | 'growth' | 'pro' | 'unlimited'
  status               text        DEFAULT 'pending',
  -- 'pending'    = OTP not yet verified
  -- 'incomplete' = OTP verified, onboarding steps not complete
  -- 'active'     = fully set up
  -- 'suspended'  = suspended by admin
  avatar_url           text,
  recovery_email       text,
  last_active_at       timestamptz DEFAULT now(),
  created_at           timestamptz DEFAULT now()
);

-- ────────────────────────────────────────────────────────────
-- OTP ATTEMPTS
-- Server-side rate limiting for OTP sends, replacing any
-- client-side localStorage tracking. identifier is a
-- SHA-256 hash of the email or phone being verified.
-- ────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS otp_attempts (
  id              uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  identifier      text        NOT NULL,
  -- SHA-256 hash of email or phone
  attempts        int         DEFAULT 0,
  locked_until    timestamptz,
  last_attempt_at timestamptz DEFAULT now()
);

-- ────────────────────────────────────────────────────────────
-- RATE LIMITS
-- Server-side per-IP action limiting for signup, OTP sends,
-- and login. ip_address is SHA-256 hashed before storage.
-- ────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS rate_limits (
  id           uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  ip_address   text        NOT NULL,
  -- SHA-256 hashed
  action       text        NOT NULL,
  -- 'signup' | 'otp_send' | 'login'
  attempts     int         DEFAULT 1,
  window_start timestamptz DEFAULT now(),
  blocked_until timestamptz
);

-- ────────────────────────────────────────────────────────────
-- AUDIT LOGS
-- Append-only log of significant actions. tutor_id is nullable
-- so pre-auth events (e.g. failed signup) can still be logged.
-- ip_address is SHA-256 hashed before storage.
-- ────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS audit_logs (
  id         uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  tutor_id   uuid        REFERENCES tutors(id) ON DELETE SET NULL,
  action     text        NOT NULL,
  entity     text,
  entity_id  text,
  old_value  jsonb,
  new_value  jsonb,
  ip_address text,
  -- SHA-256 hashed
  user_agent text,
  status     text        DEFAULT 'success',
  -- 'success' | 'failure'
  created_at timestamptz DEFAULT now()
);

-- ────────────────────────────────────────────────────────────
-- STORAGE BUCKET
-- Private bucket — tutors upload avatars into a folder named
-- by their own auth.uid(). The RLS policy below restricts
-- each tutor to their own subfolder.
-- ────────────────────────────────────────────────────────────
INSERT INTO storage.buckets (id, name, public)
VALUES ('tutor-avatars', 'tutor-avatars', false)
ON CONFLICT (id) DO NOTHING;

-- ────────────────────────────────────────────────────────────
-- ENABLE ROW LEVEL SECURITY
-- ────────────────────────────────────────────────────────────
ALTER TABLE tutors       ENABLE ROW LEVEL SECURITY;
ALTER TABLE otp_attempts ENABLE ROW LEVEL SECURITY;
ALTER TABLE rate_limits  ENABLE ROW LEVEL SECURITY;
ALTER TABLE audit_logs   ENABLE ROW LEVEL SECURITY;
-- storage.objects RLS is managed by Supabase — do not ALTER TABLE it here.

-- ────────────────────────────────────────────────────────────
-- RLS POLICIES — TUTORS
-- Each tutor may only SELECT, INSERT, UPDATE, DELETE their own
-- row. id = auth.uid() because id is set to auth.uid() on
-- INSERT (see DEFAULT auth.uid() above).
-- ────────────────────────────────────────────────────────────
DROP POLICY IF EXISTS "tutor_own_record" ON tutors;
CREATE POLICY "tutor_own_record" ON tutors
  FOR ALL
  USING     (id = auth.uid())
  WITH CHECK (id = auth.uid());

-- ────────────────────────────────────────────────────────────
-- RLS POLICIES — STORAGE (AVATARS)
-- Tutors can only access objects inside their own folder.
-- Expected path pattern: {auth.uid()}/avatar.{ext}
-- ────────────────────────────────────────────────────────────
DROP POLICY IF EXISTS "tutor_own_avatar" ON storage.objects;
CREATE POLICY "tutor_own_avatar" ON storage.objects
  FOR ALL
  USING (
    bucket_id = 'tutor-avatars'
    AND auth.uid()::text = (storage.foldername(name))[1]
  )
  WITH CHECK (
    bucket_id = 'tutor-avatars'
    AND auth.uid()::text = (storage.foldername(name))[1]
  );

-- ────────────────────────────────────────────────────────────
-- RLS POLICIES — otp_attempts / rate_limits / audit_logs
-- No policy is defined, which means ALL access from the
-- anon and authenticated roles is denied by default.
-- These tables are accessed exclusively via
-- SUPABASE_SERVICE_ROLE_KEY from server-side API routes,
-- which bypasses RLS entirely.
-- ────────────────────────────────────────────────────────────
