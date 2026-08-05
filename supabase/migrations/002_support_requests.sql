-- Migration: 002_support_requests
-- Creates the support_requests table for account recovery submissions.
-- Run this in the Supabase SQL editor or via `supabase db push`.
--
-- 📝 NOTE: No RLS policy is defined on purpose.
--    Enabling RLS with no policy = deny all for anon/authenticated roles.
--    Only the service role key (used in /api/auth/support-recovery) can INSERT.
--    Admin staff access this table via the Supabase dashboard with the service role.

CREATE TABLE IF NOT EXISTS support_requests (
  id          uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  full_name   text        NOT NULL,
  email       text        NOT NULL,
  phone       text,
  details     text,
  -- 'pending' | 'investigating' | 'resolved'
  status      text        NOT NULL DEFAULT 'pending',
  ip_address  text,       -- SHA-256 hashed — raw IP is never stored
  created_at  timestamptz NOT NULL DEFAULT now()
);

-- Enable RLS — no policy defined = deny all for anon/authenticated roles.
-- Service role bypasses RLS automatically (used in the API route).
ALTER TABLE support_requests ENABLE ROW LEVEL SECURITY;
