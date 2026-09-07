import { NextResponse } from 'next/server'
import { cookies } from 'next/headers'
import { createClient } from '@/lib/supabase/server'

export async function POST() {
  const cookieStore = await cookies()
  const supabase = createClient(cookieStore)

  const { data: { user }, error: authError } = await supabase.auth.getUser()
  if (authError || !user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const { error } = await supabase
    .from('tutors')
    .update({ onboarding_complete: true })
    .eq('id', user.id)

  if (error) {
    console.error('[onboarding/complete] Failed to update tutor:', error)
    return NextResponse.json({ error: 'Failed to complete onboarding' }, { status: 500 })
  }

  return NextResponse.json({ success: true })
}
