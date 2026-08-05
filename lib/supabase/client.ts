/**
 * Browser-side Supabase client.
 * Uses NEXT_PUBLIC_ keys only — safe to import in 'use client' components.
 *
 * RLS NOTE: The `tutors` table must have the following RLS policy in Supabase dashboard:
 *   Policy name: "Tutors can manage own row"
 *   Using expression: auth.uid() = id
 *   With check expression: auth.uid() = id
 *   Operations: SELECT, INSERT, UPDATE, DELETE
 */

import { createBrowserClient } from '@supabase/ssr'

export function createClient() {
  return createBrowserClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
  )
}
