// POST /api/waitlist/remove
// Body: { waitlistId: string }
// Expires a waitlist entry — sets status to 'expired'.
// RLS on waitlist ensures tutors can only remove their own entries.
//
// ✅ CURRENT: Soft-delete only (status = 'expired'). Row is kept for audit history.
// 🚀 BEFORE LAUNCH: Consider sending a WhatsApp notification to the student.

import { NextResponse } from 'next/server'
import { cookies } from 'next/headers'
import { createClient } from '@/lib/supabase/server'

export async function POST(req: Request) {
  // ── 1. Auth ────────────────────────────────────────────────────────────────
  const cookieStore = await cookies()
  const supabase = createClient(cookieStore)

  const { data: { user }, error: authError } = await supabase.auth.getUser()
  if (authError || !user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  // ── 2. Parse body ──────────────────────────────────────────────────────────
  let waitlistId: string
  try {
    const body = await req.json() as { waitlistId: string }
    waitlistId = body.waitlistId
  } catch {
    return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400 })
  }

  if (!waitlistId) {
    return NextResponse.json({ error: 'waitlistId required' }, { status: 400 })
  }

  // ── 3. Soft-delete: set status = 'expired' ────────────────────────────────
  // tutor_id filter is the RLS safety net — only the owning tutor can expire
  // their own waitlist entries even if RLS is bypassed for some reason.
  const { error } = await supabase
    .from('waitlist')
    .update({ status: 'expired' })
    .eq('id', waitlistId)
    .eq('tutor_id', user.id)

  if (error) {
    console.error('[waitlist/remove] Failed to expire entry:', error)
    return NextResponse.json({ error: 'Failed to remove from waitlist' }, { status: 500 })
  }

  console.log(`[waitlist/remove] Entry ${waitlistId} expired by tutor ${user.id}`)

  return NextResponse.json({ success: true })
}
