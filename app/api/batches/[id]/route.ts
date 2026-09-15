import { NextRequest, NextResponse } from 'next/server'
import { cookies } from 'next/headers'
import { createClient } from '@/lib/supabase/server'

export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id: batchId } = await params

  const cookieStore = await cookies()
  const supabase = createClient(cookieStore)

  const { data: { user }, error: authErr } = await supabase.auth.getUser()
  if (authErr || !user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  let body: Record<string, unknown>
  try {
    body = await req.json()
  } catch {
    return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400 })
  }

  const { data: existing, error: fetchErr } = await supabase
    .from('batches')
    .select('id, name, schedule_day, schedule_time')
    .eq('id', batchId)
    .eq('tutor_id', user.id)
    .single()

  if (fetchErr || !existing) {
    return NextResponse.json({ error: 'Not found' }, { status: 404 })
  }

  const updates: Record<string, unknown> = {}

  const allowed = [
    'name', 'schedule_day', 'schedule_time', 'session_duration_mins',
    'monthly_fee', 'max_students', 'accepting_new', 'status',
    'current_zoom_link', 'zoom_link_generated_at',
  ]
  for (const key of allowed) {
    if (body[key] !== undefined) updates[key] = body[key]
  }

  if (Object.keys(updates).length === 0) {
    return NextResponse.json({ error: 'No fields to update' }, { status: 400 })
  }

  if (updates.name !== undefined && updates.name !== (existing as { name: string }).name) {
    const { data: duplicate } = await supabase
      .from('batches')
      .select('id')
      .eq('tutor_id', user.id)
      .eq('name', updates.name as string)
      .neq('id', batchId)
      .maybeSingle()

    if (duplicate) {
      return NextResponse.json({ error: 'A batch with this name already exists' }, { status: 409 })
    }
  }

  const existingBatch = existing as { id: string; name: string; schedule_day: string; schedule_time: string }
  const newDay = (updates.schedule_day ?? existingBatch.schedule_day) as string
  const newTime = (updates.schedule_time ?? existingBatch.schedule_time) as string
  const dayChanged = updates.schedule_day !== undefined && updates.schedule_day !== existingBatch.schedule_day
  const timeChanged = updates.schedule_time !== undefined && updates.schedule_time !== existingBatch.schedule_time

  if (dayChanged || timeChanged) {
    const { data: conflicting } = await supabase
      .from('batches')
      .select('id, name')
      .eq('tutor_id', user.id)
      .eq('schedule_day', newDay)
      .eq('schedule_time', newTime)
      .eq('status', 'active')
      .neq('id', batchId)
      .maybeSingle()

    if (conflicting) {
      return NextResponse.json(
        { error: 'Time conflict with existing batch', conflicting_batch: (conflicting as { id: string; name: string }).name },
        { status: 409 },
      )
    }
  }

  // Archiving (or any status change away from 'active') gets the SAME guard
  // DELETE already has — without this, a tutor could silently orphan active,
  // paying students via PATCH status while DELETE correctly blocks the
  // equivalent action.
  if (updates.status !== undefined && updates.status !== 'active') {
    const { count: activeCount } = await supabase
      .from('students')
      .select('id', { count: 'exact', head: true })
      .eq('batch_id', batchId)
      .eq('class_type', 'group')
      .eq('status', 'active')

    if (activeCount && activeCount > 0) {
      return NextResponse.json(
        { error: `Cannot archive — ${activeCount} active student${activeCount === 1 ? '' : 's'} enrolled. Move or deactivate them first.` },
        { status: 409 },
      )
    }
  }

  const { data: updated, error: updateErr } = await supabase
    .from('batches')
    .update(updates)
    .eq('id', batchId)
    .eq('tutor_id', user.id)
    .select()
    .single()

  if (updateErr || !updated) {
    console.error('[batches] Failed to update batch:', updateErr)
    return NextResponse.json({ error: 'Failed to update batch' }, { status: 500 })
  }

  // Schedule changed — future sessions already generated for the OLD
  // day/time (and their OLD zoom_link, copied at generation time) would
  // otherwise sit there silently forever. Cancel them; generateBatchSessions()
  // will create correct ones at the NEW day/time on its next run.
  if (dayChanged || timeChanged) {
    const { error: cancelErr } = await supabase
      .from('sessions')
      .update({ status: 'cancelled', cancelled_reason: 'Batch schedule changed' })
      .eq('batch_id', batchId)
      .eq('status', 'scheduled')
      .gte('scheduled_at', new Date().toISOString())

    if (cancelErr) {
      console.error('[batches] Failed to cancel stale sessions after schedule change (batch itself was updated):', cancelErr)
    }
  }

  return NextResponse.json({ batch: updated })
}

export async function DELETE(
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

  const { count } = await supabase
    .from('students')
    .select('id', { count: 'exact', head: true })
    .eq('batch_id', batchId)
    .eq('status', 'active')
    .eq('tutor_id', user.id)

  if (count && count > 0) {
    return NextResponse.json(
      { error: 'Cannot delete batch with active students', count },
      { status: 409 },
    )
  }

  const { error: deleteErr } = await supabase
    .from('batches')
    .delete()
    .eq('id', batchId)
    .eq('tutor_id', user.id)

  if (deleteErr) {
    console.error('[batches] Failed to delete batch:', deleteErr)
    return NextResponse.json({ error: 'Failed to delete batch' }, { status: 500 })
  }

  return NextResponse.json({ success: true })
}
