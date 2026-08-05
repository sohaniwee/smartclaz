import { NextRequest, NextResponse } from 'next/server'
import { cookies } from 'next/headers'
import { createClient } from '@/lib/supabase/server'
import { generateBatchSessions } from '@/lib/sessions/generate-batch-sessions'

export async function POST(_req: NextRequest) {
  const cookieStore = await cookies()
  const supabase = createClient(cookieStore)

  const { data: { user }, error: authErr } = await supabase.auth.getUser()
  if (authErr || !user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  try {
    await generateBatchSessions(user.id, supabase)
    return NextResponse.json({ success: true })
  } catch (e) {
    console.error('[sessions/generate] error:', e)
    return NextResponse.json({ error: 'Generation failed' }, { status: 500 })
  }
}
