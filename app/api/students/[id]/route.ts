import { NextRequest, NextResponse } from 'next/server'
import { cookies } from 'next/headers'
import { createClient } from '@/lib/supabase/server'

async function writeAuditLog(
  supabase: ReturnType<typeof createClient>,
  tutorId: string,
  action: string,
  entityId: string,
  newValue: Record<string, unknown>,
): Promise<void> {
  try {
    await supabase.from('audit_logs').insert({
      tutor_id: tutorId,
      action,
      entity: 'students',
      entity_id: entityId,
      new_value: newValue,
      status: 'success',
    })
  } catch {
    // Never let audit failures break the main flow
  }
}

export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id: studentId } = await params

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

  const { data: student, error: fetchErr } = await supabase
    .from('students')
    .select('id, tutor_id, name, whatsapp, status, phone_history')
    .eq('id', studentId)
    .eq('tutor_id', user.id)
    .single()

  if (fetchErr || !student) {
    return NextResponse.json({ error: 'Not found' }, { status: 404 })
  }

  const updates: Record<string, unknown> = {}

  if (body.name !== undefined) updates.name = body.name
  if (body.subject !== undefined) updates.subject = body.subject
  if (body.grade !== undefined) updates.grade = body.grade
  if (body.class_type !== undefined) updates.class_type = body.class_type
  if (body.batch_id !== undefined) {
    // batch_id comes straight from the request body — verify it actually
    // belongs to this tutor before linking the student to it, otherwise a
    // tutor could attach their student to another tutor's batch and corrupt
    // that batch's roster/capacity count.
    if (body.batch_id === null) {
      updates.batch_id = null
    } else {
      const { data: ownedBatch } = await supabase
        .from('batches')
        .select('id')
        .eq('id', body.batch_id as string)
        .eq('tutor_id', user.id)
        .maybeSingle()
      if (!ownedBatch) {
        return NextResponse.json({ error: 'Batch not found' }, { status: 404 })
      }
      updates.batch_id = body.batch_id
    }
  }
  if (body.monthly_fee !== undefined) updates.monthly_fee = body.monthly_fee
  if (body.fee_type !== undefined) updates.fee_type = body.fee_type
  if (body.parent_name !== undefined) updates.parent_name = body.parent_name
  if (body.parent_whatsapp !== undefined) updates.parent_whatsapp = body.parent_whatsapp

  if (body.status !== undefined && body.status !== student.status) {
    updates.status = body.status

    if (body.status === 'inactive' || body.status === 'blocked') {
      updates.status_reason = body.status_reason ?? null
      updates.deactivated_at = new Date().toISOString()
      if (body.status === 'blocked') {
        updates.blocked_at = new Date().toISOString()
        updates.blocked_reason = body.status_reason ?? null
      }
    } else if (body.status === 'active') {
      updates.status_reason = null
      updates.deactivated_at = null
      updates.blocked_at = null
      updates.blocked_reason = null
    }
  } else if (body.status !== undefined && body.status_reason !== undefined) {
    updates.status_reason = body.status_reason
  }

  if (body.whatsapp !== undefined && body.whatsapp !== student.whatsapp) {
    const history: unknown[] = Array.isArray(student.phone_history)
      ? (student.phone_history as unknown[])
      : []

    history.push({
      old_number: student.whatsapp,
      changed_at: new Date().toISOString(),
      reason: body.phone_change_reason ?? null,
    })

    updates.whatsapp = body.whatsapp
    updates.phone_history = history
  }

  if (Object.keys(updates).length === 0) {
    return NextResponse.json({ error: 'No fields to update' }, { status: 400 })
  }

  const { data: updated, error: updateErr } = await supabase
    .from('students')
    .update(updates)
    .eq('id', studentId)
    .eq('tutor_id', user.id)
    .select()
    .single()

  if (updateErr || !updated) {
    console.error('[students] Failed to update student:', updateErr)
    return NextResponse.json(
      { error: 'Failed to update student' },
      { status: 500 },
    )
  }

  void writeAuditLog(supabase, user.id, 'student_updated', studentId, {
    student_name: updated.name,
    changes: Object.keys(updates),
  })

  return NextResponse.json({ student: updated })
}

export async function DELETE(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id: studentId } = await params

  const cookieStore = await cookies()
  const supabase = createClient(cookieStore)

  const { data: { user }, error: authErr } = await supabase.auth.getUser()
  if (authErr || !user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const { data: student, error: fetchErr } = await supabase
    .from('students')
    .select('id, tutor_id, name, created_at')
    .eq('id', studentId)
    .eq('tutor_id', user.id)
    .single()

  if (fetchErr || !student) {
    return NextResponse.json({ error: 'Not found' }, { status: 404 })
  }

  const { count: paymentCount } = await supabase
    .from('payments')
    .select('*', { count: 'exact', head: true })
    .eq('student_id', studentId)

  if (paymentCount && paymentCount > 0) {
    return NextResponse.json(
      {
        error: 'Student is not eligible for hard delete',
        reason: 'This student has payment records. Mark as inactive instead to preserve your financial history.',
      },
      { status: 403 },
    )
  }

  const { count: sessionCount } = await supabase
    .from('sessions')
    .select('*', { count: 'exact', head: true })
    .eq('student_id', studentId)

  if (sessionCount && sessionCount > 0) {
    return NextResponse.json(
      {
        error: 'Student is not eligible for hard delete',
        reason: 'This student has attended sessions. Mark as inactive instead.',
      },
      { status: 403 },
    )
  }

  const hoursOld =
    (Date.now() - new Date(student.created_at as string).getTime()) / (1000 * 60 * 60)

  if (hoursOld > 24) {
    return NextResponse.json(
      {
        error: 'Student is not eligible for hard delete',
        reason: 'Students added more than 24 hours ago cannot be permanently removed. Mark as inactive instead.',
      },
      { status: 403 },
    )
  }

  void writeAuditLog(supabase, user.id, 'student_hard_deleted', studentId, {
    student_name: student.name,
    deleted_at: new Date().toISOString(),
  })

  const { error: deleteErr } = await supabase
    .from('students')
    .delete()
    .eq('id', studentId)
    .eq('tutor_id', user.id)

  if (deleteErr) {
    console.error('[students] Failed to delete student:', deleteErr)
    return NextResponse.json({ error: 'Failed to delete student' }, { status: 500 })
  }

  return NextResponse.json({ success: true })
}
