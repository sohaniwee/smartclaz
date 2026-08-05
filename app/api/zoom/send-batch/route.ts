// ✅ CURRENT: Re-sends this week's existing batch Zoom link to all paid students.
//    Use when a student joins mid-week and needs the current link,
//    or when the tutor wants to broadcast the link again.
// 📝 NOTE: Does NOT create a new Zoom meeting — only sends the existing
//    current_zoom_link. Call /api/zoom/refresh-batch to generate a new one.
// 🧪 TEST: POST /api/zoom/send-batch { batchId: "uuid" }
//    Check console for WhatsApp OUT [TEST MODE] logs.

import { NextRequest, NextResponse } from 'next/server'
import { cookies } from 'next/headers'
import { createClient } from '@/lib/supabase/server'
import { createClient as createServiceClient } from '@supabase/supabase-js'
import { sendLinkToPaidStudents } from '@/lib/zoom-helpers'

// ── Service role client ───────────────────────────────────────────────────────
function getServiceSupabase() {
  return createServiceClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
  )
}

// ── POST /api/zoom/send-batch ─────────────────────────────────────────────────

export async function POST(req: NextRequest) {
  // ── 1. Auth ───────────────────────────────────────────────────────────────
  const cookieStore = await cookies()
  const supabaseAuth = createClient(cookieStore)

  const {
    data: { user },
    error: authError,
  } = await supabaseAuth.auth.getUser()

  if (authError || !user) {
    return NextResponse.json({ error: 'Unauthorised' }, { status: 401 })
  }

  const tutorId = user.id

  // ── 2. Parse body ─────────────────────────────────────────────────────────
  let batchId: string
  try {
    const body = await req.json()
    batchId = body.batchId
    if (!batchId) throw new Error('missing batchId')
  } catch {
    return NextResponse.json(
      { error: 'Invalid request body. Expected { batchId: string }' },
      { status: 400 },
    )
  }

  const supabase = getServiceSupabase()

  // ── 3. Fetch batch — verify tutor owns it ─────────────────────────────────
  const { data: batch, error: batchError } = await supabase
    .from('batches')
    .select('id, name, current_zoom_link')
    .eq('id', batchId)
    .eq('tutor_id', tutorId)
    .single()

  if (batchError || !batch) {
    return NextResponse.json({ error: 'Batch not found' }, { status: 404 })
  }

  // ── 4. Guard: must have a current link ───────────────────────────────────
  // If there is no link yet, tutor should use /api/zoom/refresh-batch instead.
  if (!batch.current_zoom_link) {
    return NextResponse.json(
      {
        error: 'No Zoom link exists for this batch yet. Use POST /api/zoom/refresh-batch to generate one.',
      },
      { status: 400 },
    )
  }

  // ── 5. Send existing link to paid students this month ─────────────────────
  const sentTo = await sendLinkToPaidStudents(
    batchId,
    batch.current_zoom_link,
    tutorId,
    supabase,
  )

  console.log(`[zoom/send-batch] Sent existing link for batch "${batch.name}" to ${sentTo} paid students`)

  return NextResponse.json({
    success: true,
    sentTo,
  })
}
