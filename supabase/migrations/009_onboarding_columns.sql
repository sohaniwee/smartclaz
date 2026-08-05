-- Migration 009: Add onboarding wizard columns to tutors
-- Run in Supabase Dashboard → SQL Editor

ALTER TABLE tutors
  ADD COLUMN IF NOT EXISTS onboarding_complete boolean DEFAULT false,
  ADD COLUMN IF NOT EXISTS teaching_style text;
-- teaching_style values: 'individual' | 'group' | 'both'
