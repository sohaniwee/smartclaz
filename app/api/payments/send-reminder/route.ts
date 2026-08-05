import { NextRequest, NextResponse } from 'next/server'
import { cookies } from 'next/headers'
import { createClient } from '@/lib/supabase/server'
import { sendPaymentReminder } from '@/lib/twilio'

export async function POST(req: NextRequest) {
  const cookieStore = await cookies()
  const supabase = createClient(cookieStore)
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { paymentId } = await req.json()
  if (!paymentId) return NextResponse.json({ error: 'paymentId required' }, { status: 400 })

  // Load payment + student + tutor in parallel
  const [paymentRes, tutorRes] = await Promise.all([
    supabase
      .from('payments')
      .select('id, amount_lkr, due_date, month_year, reminder_count, student_id, students(name, whatsapp, parent_whatsapp)')
      .eq('id', paymentId)
      .eq('tutor_id', user.id)
      .single(),
    supabase
      .from('tutors')
      .select('whatsapp_number, payment_instructions')
      .eq('id', user.id)
      .single(),
  ])

  if (paymentRes.error || !paymentRes.data) {
    return NextResponse.json({ error: 'Payment not found' }, { status: 404 })
  }

  const payment = paymentRes.data
  const tutor = tutorRes.data
  const studentRaw = payment.students
  const student = (Array.isArray(studentRaw) ? studentRaw[0] : studentRaw) as { name: string; whatsapp: string | null; parent_whatsapp: string | null } | null

  if (!student) return NextResponse.json({ error: 'Student not found' }, { status: 404 })

  // Send to student, fallback to parent whatsapp
  const recipientPhone = student.whatsapp ?? student.parent_whatsapp
  if (!recipientPhone) {
    return NextResponse.json({ error: 'No WhatsApp number for student' }, { status: 422 })
  }

  const dueDate = payment.due_date
    ? new Date(payment.due_date).toLocaleDateString('en-LK', { day: 'numeric', month: 'long', year: 'numeric' })
    : payment.month_year ?? 'this month'

  await sendPaymentReminder(
    recipientPhone,
    tutor?.whatsapp_number ?? '',
    student.name,
    payment.amount_lkr ?? 0,
    dueDate,
    tutor?.payment_instructions ?? 'Please contact your tutor for payment details.',
    user.id,
  )

  // Update reminder tracking
  await supabase
    .from('payments')
    .update({
      reminder_sent_at: new Date().toISOString(),
      reminder_count: (payment.reminder_count ?? 0) + 1,
    })
    .eq('id', paymentId)
    .eq('tutor_id', user.id)

  return NextResponse.json({ success: true })
}
