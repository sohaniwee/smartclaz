import { NextRequest, NextResponse } from 'next/server'
import { cookies } from 'next/headers'
import { createClient } from '@/lib/supabase/server'

export async function GET(
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

  const { count: paymentCount, error: payErr } = await supabase
    .from('payments')
    .select('*', { count: 'exact', head: true })
    .eq('student_id', studentId)

  if (payErr) {
    return NextResponse.json({ error: payErr.message }, { status: 500 })
  }

  if (paymentCount && paymentCount > 0) {
    return NextResponse.json({
      eligible: false,
      reason: 'This student has payment records. Mark as inactive instead to preserve your financial history.',
    })
  }

  const { count: sessionCount, error: sessErr } = await supabase
    .from('sessions')
    .select('*', { count: 'exact', head: true })
    .eq('student_id', studentId)

  if (sessErr) {
    return NextResponse.json({ error: sessErr.message }, { status: 500 })
  }

  if (sessionCount && sessionCount > 0) {
    return NextResponse.json({
      eligible: false,
      reason: 'This student has attended sessions. Mark as inactive instead.',
    })
  }

  const hoursOld =
    (Date.now() - new Date(student.created_at as string).getTime()) / (1000 * 60 * 60)

  if (hoursOld > 24) {
    return NextResponse.json({
      eligible: false,
      reason: 'Students added more than 24 hours ago cannot be permanently removed. Mark as inactive instead.',
    })
  }

  return NextResponse.json({ eligible: true })
}
