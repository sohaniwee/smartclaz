/**
 * Welcome email API route.
 * ✅ CURRENT: Called by signup/preferences/page.tsx after Step 4 completes.
 *    Uses lib/resend.ts (server-only) to send the welcome email.
 * 📝 NOTE: This route exists so RESEND_API_KEY stays server-side only.
 *    Client components cannot call lib/resend.ts directly.
 *    Authentication check ensures only the logged-in tutor can trigger their own welcome email.
 */

import { createServerClient } from '@supabase/ssr'
import { cookies }            from 'next/headers'
import { sendWelcomeEmail }   from '@/lib/resend'

export async function POST(request: Request) {
  try {
    const body = await request.json() as { name?: string; email?: string; dev?: boolean }

    // ⚠️ DEV ONLY — Remove before launch
    // Skips Supabase session check so the welcome email can be tested without a real session.
    // At launch: delete the dev block below — auth check below will enforce it.
    if (process.env.NODE_ENV === 'development' && body.dev) {
      if (body.name && body.email) await sendWelcomeEmail(body.name, body.email)
      return Response.json({ ok: true })
    }

    // ✅ CURRENT: Verify the request comes from an authenticated tutor session.
    const cookieStore = await cookies()

    const supabase = createServerClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
      {
        cookies: {
          getAll()      { return cookieStore.getAll() },
          setAll(items) { items.forEach(({ name, value, options }) => cookieStore.set(name, value, options)) },
        },
      },
    )

    const { data: { user } } = await supabase.auth.getUser()

    if (!user) {
      return Response.json({ error: 'Not authenticated' }, { status: 401 })
    }

    // Fetch the tutor's own name/email server-side rather than trusting the
    // request body — otherwise any authenticated tutor could send a welcome
    // email to an arbitrary address of their choosing.
    const { data: tutor } = await supabase
      .from('tutors')
      .select('name, email')
      .eq('id', user.id)
      .single()

    const email = tutor?.email ?? user.email
    const name  = tutor?.name

    if (!name || !email) {
      return Response.json({ error: 'Missing name or email' }, { status: 400 })
    }

    // ✅ CURRENT: Fire and forget — sendWelcomeEmail never throws.
    await sendWelcomeEmail(name, email)

    return Response.json({ ok: true })
  } catch {
    // ✅ CURRENT: Silently swallow all errors — welcome email is never load-bearing.
    return Response.json({ ok: true })
  }
}
