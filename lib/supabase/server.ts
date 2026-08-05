/**
 * Server-side Supabase client for middleware and Server Components.
 * Reads/writes session cookies via @supabase/ssr.
 *
 * NEVER import SUPABASE_SERVICE_ROLE_KEY here — use anon key with RLS.
 */

import { createServerClient } from '@supabase/ssr'
import { type ReadonlyRequestCookies } from 'next/dist/server/web/spec-extension/adapters/request-cookies'
import { type ResponseCookies } from 'next/dist/compiled/@edge-runtime/cookies'

export function createClient(
  cookieStore: ReadonlyRequestCookies | ResponseCookies,
) {
  return createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() {
          return (cookieStore as ReadonlyRequestCookies).getAll?.() ?? []
        },
        setAll(cookiesToSet) {
          cookiesToSet.forEach(({ name, value, options }) => {
            ;(cookieStore as ResponseCookies).set?.(name, value, options)
          })
        },
      },
    },
  )
}
