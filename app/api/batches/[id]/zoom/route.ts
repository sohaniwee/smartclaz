import { NextRequest, NextResponse } from 'next/server'
import { cookies } from 'next/headers'
import { createClient } from '@/lib/supabase/server'

export async function POST(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id: batchId } = await params

  const cookieStore = await cookies()
  const supabase = createClient(cookieStore)

  const { data: { user }, error: authErr } = await supabase.auth.getUser()
  if (authErr || !user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const { data: batch, error: fetchErr } = await supabase
    .from('batches')
    .select('id, name')
    .eq('id', batchId)
    .eq('tutor_id', user.id)
    .single()

  if (fetchErr || !batch) {
    return NextResponse.json({ error: 'Not found' }, { status: 404 })
  }

  // TODO: Replace with real Zoom API call when ZOOM_ACCOUNT_ID is configured
  const newZoomUrl = `https://zoom.us/j/${Math.floor(Math.random() * 9000000000) + 1000000000}`
  const generatedAt = new Date().toISOString()

  const { error: updateErr } = await supabase
    .from('batches')
    .update({ current_zoom_link: newZoomUrl, zoom_link_generated_at: generatedAt })
    .eq('id', batchId)
    .eq('tutor_id', user.id)

  if (updateErr) {
    console.error('[batches/zoom] Failed to save zoom link:', updateErr)
    return NextResponse.json({ error: 'Failed to save zoom link' }, { status: 500 })
  }

  // TODO: Notify paid active students via WhatsApp when Twilio is wired
  return NextResponse.json({ zoom_link: newZoomUrl, generated_at: generatedAt, students_notified: 0 })
}
