import { NextRequest, NextResponse } from 'next/server'
import { cookies } from 'next/headers'
import { createClient } from '@/lib/supabase/server'

export async function POST(_req: NextRequest) {
  const cookieStore = await cookies()
  const supabase = createClient(cookieStore)

  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  await supabase.from('tutors').update({
    manual_mode_hint_seen: true,
  }).eq('id', user.id)

  return NextResponse.json({ success: true })
}
