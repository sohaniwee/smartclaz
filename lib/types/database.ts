/**
 * Database row types for Smartclaz — derived from migrations 001–004.
 *
 * // ✅ CURRENT: hand-written types kept in sync with migrations manually
 * // 🚀 BEFORE LAUNCH: replace with `supabase gen types typescript` output and
 * //    import from a single generated file so drift is impossible
 * // 📝 NOTE: All types represent the raw Postgres row shape. Application-layer
 * //    transformations (camelCase, computed fields) belong in separate view
 * //    types — do not add them here.
 */

// ────────────────────────────────────────────────────────────
// TUTORS
// ────────────────────────────────────────────────────────────

/**
 * subjects JSONB structure stored in tutors.subjects:
 *
 * [{
 *   subject: "Mathematics",
 *   grades: [{
 *     grade: "A/L",
 *     individual_fee: 3500,
 *     group_fee: 1500,
 *     trial_free: true,
 *     trial_fee: 0
 *   }]
 * }]
 */
export interface SubjectGrade {
  grade: string
  individual_fee: number
  group_fee: number
  trial_free: boolean
  trial_fee: number
}

export interface TutorSubject {
  subject: string
  grades: SubjectGrade[]
}

/**
 * availability JSONB structure stored in tutors.availability — a list of
 * discrete bookable slots for new individual students, not day-long open
 * ranges. The page that used to set this (signup/availability) was removed
 * as unreachable dead code — the live signup flow tracks per-subject
 * individual slots via tutors.subjects[].grades[].individual_slots instead
 * (see SubjectGrade above), so this column is not currently populated by
 * any live UI:
 *
 * [{ day: "Monday", time: "15:00", duration_mins: 60, is_free: true }]
 */
export interface AvailabilitySlot {
  day: string
  time: string
  duration_mins: number
  is_free: boolean
}

/**
 * notification_prefs JSONB structure stored in tutors.notification_prefs:
 *
 * {
 *   new_student:      'app' | 'whatsapp' | 'both',
 *   payment_received: 'app' | 'whatsapp' | 'both',
 *   bot_needs_help:   'app' | 'whatsapp' | 'both',
 *   session_reminder: 'app' | 'whatsapp' | 'both'
 * }
 */
export type NotificationChannel = 'app' | 'whatsapp' | 'both'

export interface NotificationPrefs {
  new_student?: NotificationChannel
  payment_received?: NotificationChannel
  bot_needs_help?: NotificationChannel
  session_reminder?: NotificationChannel
}

// ✅ CURRENT: status field tracks onboarding progress
// 🚀 BEFORE LAUNCH: add 'banned' status for policy violations
// 📝 NOTE: 'pending' tutors cannot access the dashboard — middleware blocks them
export type TutorStatus = 'pending' | 'incomplete' | 'active' | 'suspended'

// ✅ CURRENT: trial is the only plan on launch
// 🚀 BEFORE LAUNCH: enforce plan caps in message_logs and Zoom link generation
// 📝 NOTE: plan caps are defined in CLAUDE.md — Starter 500/mo, Growth 1500/mo, etc.
export type TutorPlan = 'trial' | 'starter' | 'growth' | 'pro' | 'unlimited'

export type ReschedulePolicy = 'auto_24h' | 'auto_48h' | 'manual'

export type NoshowPolicy = 'forfeit' | 'reschedule' | 'ask'

/** Raw row from the `tutors` table. */
export interface TutorRow {
  /** auth.uid() — set as DEFAULT so id === auth.uid() always */
  id: string
  phone: string
  name: string
  email: string
  email_verified: boolean
  phone_verified: boolean
  whatsapp_number: string | null
  /** Parsed shape: TutorSubject[] */
  subjects: TutorSubject[]
  /** Parsed shape: AvailabilitySlot[] */
  availability: AvailabilitySlot[]
  payment_instructions: string | null
  reschedule_policy: ReschedulePolicy
  noshow_policy: NoshowPolicy
  /** Parsed shape: NotificationPrefs */
  notification_prefs: NotificationPrefs
  /** Day of month (1–28) when monthly fees are due */
  monthly_due_date: number
  /** Days after due_date before student is blocked */
  grace_period_days: number
  /** Running total of outbound WhatsApp messages sent */
  message_count: number
  plan: TutorPlan
  status: TutorStatus
  avatar_url: string | null
  /** Separate email for account recovery, distinct from login email */
  recovery_email: string | null
  last_active_at: string
  created_at: string
}

// ────────────────────────────────────────────────────────────
// OTP ATTEMPTS
// ────────────────────────────────────────────────────────────

// ✅ CURRENT: identifier is a SHA-256 hash of email or phone
// 🚀 BEFORE LAUNCH: add an index on identifier for fast lookups
// 📝 NOTE: this table is service-role only — no RLS policy means deny-all for anon/authenticated

/** Raw row from the `otp_attempts` table. */
export interface OtpAttemptRow {
  id: string
  /** SHA-256 hash of the email or phone number being verified */
  identifier: string
  attempts: number
  /** ISO timestamp — null if not currently locked */
  locked_until: string | null
  last_attempt_at: string
}

// ────────────────────────────────────────────────────────────
// RATE LIMITS
// ────────────────────────────────────────────────────────────

// ✅ CURRENT: per-IP action tracking with a rolling window
// 🚀 BEFORE LAUNCH: add a Supabase scheduled function to prune rows older than 24h
// 📝 NOTE: ip_address is SHA-256 hashed before insert — never store raw IPs

export type RateLimitAction = 'signup' | 'otp_send' | 'login'

/** Raw row from the `rate_limits` table. */
export interface RateLimitRow {
  id: string
  /** SHA-256 hash of the client IP address */
  ip_address: string
  action: RateLimitAction
  attempts: number
  window_start: string
  /** ISO timestamp — null if not currently blocked */
  blocked_until: string | null
}

// ────────────────────────────────────────────────────────────
// AUDIT LOGS
// ────────────────────────────────────────────────────────────

// ✅ CURRENT: append-only, no DELETE policy; rows stay forever
// 🚀 BEFORE LAUNCH: add Postgres partitioning by month or a 90-day TTL policy
// 📝 NOTE: tutor_id is nullable so failed pre-auth events can still be captured

export type AuditStatus = 'success' | 'failure'

/** Raw row from the `audit_logs` table. */
export interface AuditLogRow {
  id: string
  /** Nullable — pre-auth events have no tutor_id */
  tutor_id: string | null
  /** Short verb describing the action, e.g. 'signup', 'otp_verify', 'payment_mark_paid' */
  action: string
  /** Table or domain being acted on, e.g. 'tutors', 'payments' */
  entity: string | null
  /** Primary key of the affected row */
  entity_id: string | null
  old_value: Record<string, unknown> | null
  new_value: Record<string, unknown> | null
  /** SHA-256 hash of the client IP address */
  ip_address: string | null
  user_agent: string | null
  status: AuditStatus
  created_at: string
}

// ────────────────────────────────────────────────────────────
// SUPPORT REQUESTS
// ────────────────────────────────────────────────────────────

// ✅ CURRENT: covers Recovery A (lost email), Recovery B (lost phone),
//    and Recovery C (lost both email and phone)
// 🚀 BEFORE LAUNCH: build an internal admin UI that filters by status and
//    lets support staff update resolved_at / resolved_by in one click
// 📝 NOTE: this table is service-role only — RLS is enabled with no policy,
//    which means deny-all for anon/authenticated roles. Only the service role
//    key (used in /api/auth/support-recovery) can INSERT or SELECT.

export type SupportRequestStatus = 'pending' | 'investigating' | 'resolved' | 'rejected'

/** Raw row from the `support_requests` table. */
export interface SupportRequestRow {
  id: string
  full_name: string
  email: string
  phone: string | null
  /** JSON string of identity-verification fields submitted by the user */
  proof_details: string | null
  // ✅ migration 20260714: authenticated contact-change support recovery
  /** Set only for app/api/auth/contact-change/support-recovery submissions. Null for the public/logged-out recovery flow. */
  tutor_id: string | null
  /** 'email' | 'phone' — only set alongside tutor_id */
  change_type: string | null
  /** Previous email address — supplied in Recovery C flow */
  old_email: string | null
  /** Previous phone number — supplied in Recovery C flow */
  old_phone: string | null
  /** Replacement email address requested — supplied in Recovery C flow */
  new_email: string | null
  /** Replacement phone number requested — supplied in Recovery C flow */
  new_phone: string | null
  /** pending | investigating | resolved | rejected */
  status: SupportRequestStatus
  /** SHA-256 hashed — raw IP is never stored */
  ip_address: string | null
  /** ISO 8601 timestamp when the request was resolved or rejected */
  resolved_at: string | null
  /** Identifier of the support staff member who resolved the request */
  resolved_by: string | null
  resolution_notes: string | null
  /** ISO 8601 timestamp */
  created_at: string
}

// ────────────────────────────────────────────────────────────
// CONTACT CHANGE REQUESTS
// ────────────────────────────────────────────────────────────

// ✅ CURRENT: backs the dual-channel Change Email / Change Phone flows
//    (app/api/auth/change-email/* and app/api/auth/change-phone/*).
// 📝 NOTE: OTP codes here are self-contained 6-digit codes generated and
//    verified entirely server-side — never Supabase Auth's
//    signInWithOtp/verifyOtp. See lib/contactChange.ts for the shared helpers.
// 📝 NOTE: this table is service-role only — RLS is enabled with no policy,
//    which means deny-all for anon/authenticated roles (same convention as
//    otp_attempts / rate_limits in migration 001).
export type ContactChangeType = 'email' | 'phone'

export type ContactChangeStatus =
  | 'pending_old_otp'
  | 'pending_new_otp'
  | 'completed'
  | 'expired'
  | 'cancelled'
  | 'support_review'

export type ContactChangeFallbackChannel = 'phone' | 'email'

/** Raw row from the `contact_change_requests` table. */
export interface ContactChangeRequestRow {
  id: string
  /** Nullable FK for schema consistency with other tables — always set in practice (auth required to create a row). */
  tutor_id: string | null
  change_type: ContactChangeType
  /** Current email/phone on file at the time the request was created */
  old_value: string
  /** Requested new email/phone */
  new_value: string
  status: ContactChangeStatus
  old_otp_code: string | null
  old_otp_sent_at: string | null
  old_otp_verified_at: string | null
  old_otp_attempts: number
  new_otp_code: string | null
  new_otp_sent_at: string | null
  new_otp_verified_at: string | null
  new_otp_attempts: number
  used_fallback: boolean
  fallback_channel: ContactChangeFallbackChannel | null
  /** SHA-256 hash of the client IP address */
  ip_address: string | null
  user_agent: string | null
  expires_at: string
  created_at: string
  completed_at: string | null
}

// ────────────────────────────────────────────────────────────
// STUDENTS
// ────────────────────────────────────────────────────────────

// ✅ CURRENT: 'blocked' is set automatically after grace_period_days overdue
// 🚀 BEFORE LAUNCH: add 'trial' as a distinct status so trial students
//    can be filtered separately from full active students
// 📝 NOTE: monthly_fee overrides the tutor-level subject fee when set
export type StudentStatus = 'active' | 'inactive' | 'blocked'

export type StudentBlockedReason = 'spam' | 'abusive' | 'non_payment' | 'other'

// ✅ migration: 'group' is the canonical DB value for batch students.
//    'batch' is kept for backward-compat with handler.ts BotStep/intent types.
//    All new DB inserts use 'group'. Reads should accept both.
export type ClassType = 'individual' | 'group' | 'batch' | 'trial'

export type FeeType = 'monthly' | 'per_session'

/** Raw row from the `students` table. */
export interface StudentRow {
  id: string
  tutor_id: string
  name: string
  whatsapp: string
  parent_name: string | null
  parent_whatsapp: string | null
  subject: string | null
  grade: string | null
  class_type: ClassType
  /** Foreign key to batches.id — null for individual/trial students */
  batch_id: string | null
  /** Per-student fee override in LKR — null means use subject-level fee */
  monthly_fee: number | null
  fee_type: FeeType
  status: StudentStatus
  consent_given: boolean
  consent_at: string | null
  // ✅ migration 007: returning student / phone history tracking
  /** JSON array of previous WhatsApp numbers — populated on phone change for fraud audit trail */
  phone_history: string[] | null
  /** ISO 8601 timestamp of the student's very first contact — never changes */
  first_seen_at: string | null
  /** ISO 8601 timestamp set when tutor manually blocks this student. Null = not blocked. */
  blocked_at: string | null
  /** Reason the tutor blocked this student. Null when not blocked. */
  blocked_reason: StudentBlockedReason | null
  created_at: string
}

// ────────────────────────────────────────────────────────────
// BATCHES
// ────────────────────────────────────────────────────────────

// ✅ CURRENT: inactive batches are hidden from scheduling but kept for history
// ✅ migration 005: added current_zoom_link, current_zoom_meeting_id,
//    zoom_link_generated_at, and schedule_day_number for weekly Zoom refresh
// 📝 NOTE: schedule_day stores the weekday name e.g. "Sunday", not a number.
//    schedule_day_number is the integer alias required by the Zoom recurrence API
//    (1=Sunday … 7=Saturday) — keep both in sync when a batch schedule is edited.
export type BatchStatus = 'active' | 'inactive'

/** Raw row from the `batches` table. */
export interface BatchRow {
  id: string
  tutor_id: string
  name: string
  subject: string | null
  grade: string | null
  /** Weekday name e.g. "Sunday" — human-readable source of truth */
  schedule_day: string | null
  // ✅ Zoom recurrence weekday: 1=Sunday, 2=Monday … 7=Saturday
  // 📝 NOTE: derived from schedule_day; must be kept in sync when schedule changes
  schedule_day_number: number | null
  /** 24-hour time string e.g. "08:00" */
  schedule_time: string | null
  max_students: number
  monthly_fee: number | null
  /** Permanent Zoom meeting ID for this batch (used when zoom_meeting_id is set up) */
  zoom_meeting_id: string | null
  // ✅ Weekly Zoom link tracking — refreshed every Sunday at 06:00 by the cron job
  /** This week's active Zoom join URL sent to students. Null until first refresh. */
  current_zoom_link: string | null
  /** Zoom meeting ID paired with current_zoom_link — shown on dashboard for manual access */
  current_zoom_meeting_id: string | null
  // 🚀 BEFORE LAUNCH: add a cron health-check alert if zoom_link_generated_at
  //    is more than 8 days old (indicates the Sunday refresh cron job has stalled)
  /** ISO 8601 timestamp of when current_zoom_link was last generated */
  zoom_link_generated_at: string | null
  status: BatchStatus
  created_at: string
}

// ────────────────────────────────────────────────────────────
// SESSIONS
// ────────────────────────────────────────────────────────────

// ✅ CURRENT: reminder flags added in migration 004 — used by the
//    reminder scheduler to avoid sending duplicate notifications
// 🚀 BEFORE LAUNCH: add a DB trigger that auto-resets reminder flags
//    when scheduled_at is updated (i.e. session rescheduled)
// 📝 NOTE: batch sessions have batch_id set; individual sessions have student_id set.
//    Both may be set for a batch session that tracks per-student attendance.
export type SessionStatus = 'scheduled' | 'completed' | 'no_show' | 'cancelled'

export type SessionPaymentStatus = 'pending' | 'paid' | 'forfeited'

export type SessionType = 'individual' | 'batch'

/** Raw row from the `sessions` table. */
export interface SessionRow {
  id: string
  tutor_id: string
  /** Null for batch sessions that are not per-student rows */
  student_id: string | null
  /** Null for individual sessions */
  batch_id: string | null
  session_type: SessionType
  /** ISO 8601 timestamp */
  scheduled_at: string
  duration_mins: number
  zoom_link: string | null
  zoom_meeting_id: string | null
  status: SessionStatus
  payment_status: SessionPaymentStatus
  notes: string | null
  // ✅ Reminder flags — set to true once each notification is dispatched
  // 📝 NOTE: reset these to false if the session is rescheduled
  reminder_24h_sent: boolean
  reminder_1h_sent: boolean
  tutor_notified_30min: boolean
  created_at: string
}

// ────────────────────────────────────────────────────────────
// PAYMENTS
// ────────────────────────────────────────────────────────────

// ✅ CURRENT: reminder flags added in migration 004 — prevents duplicate
//    payment-due WhatsApp messages at the 3-day, due-date, and overdue windows
// 🚀 BEFORE LAUNCH: add a check constraint ensuring month_year matches
//    the format 'YYYY-MM' (Postgres CHECK with a regex)
// 📝 NOTE: session_id is only set for per_session payments; monthly payments
//    leave it null and use month_year to identify the billing period
export type PaymentStatus = 'pending' | 'paid' | 'overdue' | 'blocked'

export type PaymentType = 'monthly' | 'per_session'

export type PaymentMethod = 'bank' | 'ezCash' | 'cash' | 'payhere'

export type PaymentVerifier = 'tutor' | 'payhere'

/** Raw row from the `payments` table. */
export interface PaymentRow {
  id: string
  tutor_id: string
  student_id: string
  /** Null for monthly payments */
  session_id: string | null
  amount_lkr: number
  payment_type: PaymentType
  /** Billing period in "YYYY-MM" format e.g. "2025-06" — null for per_session */
  month_year: string | null
  method: PaymentMethod
  status: PaymentStatus
  due_date: string | null
  paid_at: string | null
  verified_by: PaymentVerifier
  // ✅ Reminder flags — set to true once each reminder window is dispatched
  // 📝 NOTE: 3-day = 3 days before due, due = on due date, overdue = after grace
  reminder_3day_sent: boolean
  reminder_due_sent: boolean
  reminder_overdue_sent: boolean
  // ✅ migration 007: payment reference and screenshot tracking
  /** Transfer reference number or last 4 digits provided by student. Null until student supplies it. */
  payment_reference: string | null
  /** Supabase storage URL of the payment receipt image uploaded by student. Null if not uploaded. */
  payment_screenshot_url: string | null
  created_at: string
}

// ────────────────────────────────────────────────────────────
// REMINDERS
// ────────────────────────────────────────────────────────────

// 📝 NOTE: this table is the dispatch queue. The boolean flags on sessions/payments
//    act as a fast guard; this table holds the full audit trail of what was sent.
export type ReminderType =
  | '24h'
  | '1h'
  | '30min_tutor'
  | 'payment_due'
  | 'payment_overdue'

export type ReminderChannel = 'whatsapp' | 'push'

export type ReminderStatus = 'pending' | 'sent' | 'failed'

/** Raw row from the `reminders` table. */
export interface ReminderRow {
  id: string
  session_id: string | null
  student_id: string | null
  type: ReminderType
  channel: ReminderChannel
  scheduled_at: string
  sent_at: string | null
  status: ReminderStatus
  created_at: string
}

// ────────────────────────────────────────────────────────────
// CONVERSATIONS
// ────────────────────────────────────────────────────────────

// ✅ CURRENT: messages array + test_mode flag added in migration 004
// 🚀 BEFORE LAUNCH: if message volume grows large, move the messages array
//    to a dedicated child table and add a foreign key back to conversations
// 📝 NOTE: test_mode = true suppresses actual Twilio sends — used in staging
//    and by the tutor when previewing bot responses from the dashboard

export type ConversationStatus = 'bot' | 'human' | 'resolved'

/**
 * Single entry in the conversations.messages JSONB array.
 *
 * Shape:
 * {
 *   from:     'student' | 'bot' | 'tutor'
 *   message:  string          — raw message text
 *   state?:   string          — bot FSM state at time of message e.g. 'awaiting_subject'
 *   time:     string          — ISO 8601 timestamp
 * }
 */
export interface MessageLogEntry {
  from: 'student' | 'bot' | 'tutor'
  message: string
  /** Bot FSM state at the time this message was sent/received — omitted for student/tutor messages */
  state?: string
  /** ISO 8601 timestamp */
  time: string
}

/** Raw row from the `conversations` table. */
export interface ConversationRow {
  id: string
  tutor_id: string
  student_whatsapp: string
  status: ConversationStatus
  /** Arbitrary bot state bag e.g. { step: 'awaiting_subject', collected: { name: 'Kamal' } } */
  context: Record<string, unknown>
  // ✅ Full message history stored as a JSONB array — see MessageLogEntry for entry shape
  messages: MessageLogEntry[]
  // ✅ When true, bot responses are NOT dispatched via Twilio (staging / QA mode)
  test_mode: boolean
  last_message_at: string
  created_at: string
}

// ────────────────────────────────────────────────────────────
// MESSAGE LOGS (cost tracking)
// ────────────────────────────────────────────────────────────

// ✅ CURRENT: one row per outbound WhatsApp message — used to enforce plan caps
// 🚀 BEFORE LAUNCH: add a Supabase scheduled function to aggregate daily totals
//    into a summary table so the dashboard query stays fast as volume grows
// 📝 NOTE: cost_usd default of 0.005 matches the Twilio WhatsApp per-message rate
//    at time of writing — update if Twilio pricing changes

export type MessageDirection = 'inbound' | 'outbound'

/** Raw row from the `message_logs` table. */
export interface MessageLogRow {
  id: string
  tutor_id: string
  direction: MessageDirection
  /** USD cost per message — default 0.005 (Twilio WhatsApp rate) */
  cost_usd: number
  /** Billing period in "YYYY-MM" format e.g. "2025-06" */
  month_year: string
  // ✅ When true, this log entry was generated in test/staging mode — no real Twilio send occurred
  test_mode: boolean
  // ✅ migration 007: per-phone rate limiting support
  /** WhatsApp number of the student who triggered this message. Used for per-phone rate limiting (30 msgs/hr). */
  student_phone: string | null
  created_at: string
}
