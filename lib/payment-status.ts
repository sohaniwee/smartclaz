// The ONLY place overdue math happens. Dashboard, Students, Payments,
// Batches, and the reminders cron all import this — never duplicate this
// logic anywhere else, and never compare against a stored payments.due_date
// column directly. Settings values (monthly_due_date, grace_period_days)
// are the single source of truth for what "overdue" means; a payment row's
// own due_date column is not trusted because it's frozen at whatever value
// existed when the row was created and never gets updated retroactively
// when the tutor changes their billing settings later.

export interface OverdueStatus {
  isOverdue: boolean
  daysOverdue: number
  dueDate: Date
  graceEndDate: Date
}

export function computeOverdueStatus(
  monthlyDueDate: number,      // e.g. 5
  gracePeriodDays: number,     // e.g. 5
  monthYear: string,           // '2026-06'
  paymentStatus: string,
): OverdueStatus {
  const [year, month] = monthYear.split('-').map(Number)

  const dueDate = new Date(year, month - 1, monthlyDueDate)
  const graceEndDate = new Date(dueDate)
  graceEndDate.setDate(dueDate.getDate() + gracePeriodDays)

  const today = new Date()
  today.setHours(0, 0, 0, 0)

  const isOverdue =
    (paymentStatus === 'pending' || paymentStatus === 'overdue') &&
    today > graceEndDate

  const daysOverdue = isOverdue
    ? Math.floor(
        (today.getTime() - graceEndDate.getTime()) /
        (1000 * 60 * 60 * 24),
      )
    : 0

  return { isOverdue, daysOverdue, dueDate, graceEndDate }
}

// ── Escalation ("blocking nudge") ────────────────────────────────────────────
// Separate, tutor-controlled preference layered on top of computeOverdueStatus.
// This never blocks a student — blocking is always a manual tutor click via
// the [Block student] button. Escalation only makes an already-overdue
// payment's card louder/more urgent once it's been overdue for long enough
// that the tutor is likely to have forgotten about it.

export interface EscalationStatus {
  isEscalated: boolean
}

export function computeEscalationStatus(
  daysOverdue: number,
  blockReminderEnabled: boolean | null,
  blockReminderDays: number | null,
): EscalationStatus {
  if (!blockReminderEnabled || !blockReminderDays) {
    return { isEscalated: false }
  }
  return { isEscalated: daysOverdue >= blockReminderDays }
}
