# Smartclaz — Codebase Technical Summary

**Generated:** 2026-09-02 · **Last updated:** 2026-09-02 (orphaned signup pages removed) · Next.js 16 (Turbopack) + TypeScript + Supabase + Tailwind

## 1. Project Overview

The operating system for Sri Lankan online tutors — automates student onboarding, class bookings, payments, Zoom links and reminders, entirely through WhatsApp. Tutors use a web dashboard; students interact 100% via WhatsApp with no login/website of their own. Tagline: "Less admin, more teaching."

---

## 2. Folder / File Structure

```
smartclaz/
├── app/
│   ├── page.tsx                              # Public landing page
│   ├── layout.tsx                            # Root layout (fonts, global CSS, ScrollLock)
│   ├── globals.css
│   │
│   ├── (app)/                                # Authenticated tutor dashboard route group
│   │   ├── layout.tsx                        # Sidebar/topbar shell + Contact Support modal
│   │   ├── batches/page.tsx
│   │   ├── chats/page.tsx
│   │   ├── dashboard/page.tsx
│   │   ├── groups/page.tsx
│   │   ├── payments/page.tsx
│   │   ├── sessions/page.tsx
│   │   ├── settings/page.tsx
│   │   ├── students/page.tsx
│   │   └── waitlist/page.tsx
│   │
│   ├── (auth)/                                # Public signup/login route group
│   │   ├── layout.tsx
│   │   ├── login/
│   │   │   ├── page.tsx
│   │   │   └── recover/page.tsx
│   │   ├── signup/                              # ONE live flow, confirmed via proxy.ts + Continue buttons
│   │   │   ├── page.tsx                         # Step 1: profile
│   │   │   ├── classes/page.tsx                  # Step 2: subjects/fees
│   │   │   ├── payments/page.tsx                 # Step 3: payment setup
│   │   │   └── preferences/page.tsx              # Step 4: WhatsApp/policies, activates account
│   │   │   # subjects/, groups/, availability/, settings/ — DELETED 2026-09-02:
│   │   │   # an unreachable parallel flow, never linked from Step 1, not
│   │   │   # checked by proxy.ts. See §9 for details.
│   │   └── support/recovery/page.tsx
│   │
│   ├── (onboarding)/
│   │   └── layout.tsx
│   │
│   └── api/
│       ├── auth/
│       │   ├── change-email/{start,verify-old,verify-new,fallback}/route.ts
│       │   ├── change-phone/{start,verify-old,verify-new,fallback}/route.ts
│       │   ├── contact-change/support-recovery/route.ts
│       │   ├── support-recovery/route.ts
│       │   ├── verify-turnstile/route.ts
│       │   └── welcome-email/route.ts
│       ├── avatar/route.ts
│       ├── batches/
│       │   ├── route.ts
│       │   └── [id]/{route,mark-all-paid,remind-all,send-zoom,zoom}.ts
│       ├── messaging/[provider]/webhook/route.ts
│       ├── onboarding/complete/route.ts
│       ├── payments/{verify,send-reminder}/route.ts
│       ├── reminders/send/route.ts
│       ├── sessions/
│       │   ├── route.ts
│       │   ├── generate/route.ts
│       │   └── [id]/{route,attendance,cancel,reschedule}.ts
│       ├── settings/dismiss-manual-hint/route.ts
│       ├── students/
│       │   ├── route.ts
│       │   ├── bulk-import/route.ts
│       │   ├── csv-template/route.ts
│       │   └── [id]/{route,eligibility}.ts
│       ├── test/webhook/route.ts               # dev-only, 404s in prod
│       ├── waitlist/{offer,readd,remove,resend}/route.ts
│       ├── whatsapp/webhook/route.ts
│       └── zoom/{refresh-batch,send-batch}/route.ts
│
├── components/
│   ├── AddSessionModal.tsx, AddStudentModal.tsx, BatchAttendancePanel.tsx
│   ├── CSVUpload.tsx, CountUp.tsx, CountryDialSelect.tsx
│   ├── CreateBatchModal.tsx, EditBatchModal.tsx
│   ├── EditSessionPanel.tsx, EditStudentPanel.tsx
│   ├── GettingStarted/index.tsx, GettingStartedChecklist.tsx
│   ├── InviteMessage.tsx, ManualModeHint.tsx, OverduePaymentsCard.tsx
│   ├── PaymentCard.tsx, PaymentHistoryPanel.tsx, RescheduleModal.tsx
│   ├── ScrollLock.tsx, SessionCalendar.tsx, StepBadge.tsx, WaitlistPanel.tsx
│   └── ui/{DateTimeInput,badge,button,card,input,progress,select,separator}.tsx
│
├── hooks/
│   └── useCountUp.ts
│
├── lib/
│   ├── audit.ts, auth.ts, contactChange.ts, countries.ts
│   ├── db-migrations.ts, mask.ts, payment-status.ts
│   ├── rateLimit.ts, resend.ts, turnstile.ts, twilio.ts, utils.ts
│   ├── zoom.ts, zoom-helpers.ts
│   ├── bot/{claude-intent,handler,process-webhook}.ts
│   ├── contexts/tutor.tsx
│   ├── providers/{messaging,video}.ts
│   ├── sessions/generate-batch-sessions.ts
│   ├── supabase/{client,server}.ts
│   └── types/{database,subjects}.ts
│
├── supabase/migrations/            # 19 files, see §3 for cumulative schema
│   ├── 001_auth_tables.sql
│   ├── 002_support_requests.sql
│   ├── 003_support_requests_recovery.sql
│   ├── 004_bot_reminder_columns.sql
│   ├── 005_batch_zoom_class_type.sql
│   ├── 006_core_app_tables.sql
│   ├── 007_security_fixes.sql
│   ├── 009_onboarding_columns.sql
│   ├── 010_capacity_waitlist.sql
│   ├── 011_trial_class.sql
│   ├── 012_batches_duration.sql
│   ├── 013_signup_v2_columns.sql
│   ├── 20260609120000_add_import_fields.sql
│   ├── 20260619000001_students_status_audit.sql
│   ├── 20260622000001_sessions_attendance_notifications.sql
│   ├── 20260623000001_payments_reminder_tracking.sql
│   ├── 20260701_zoom_links.sql
│   ├── 20260714_contact_change_requests.sql
│   ├── 20260813_fix_students_batch_fk.sql        # bugfix, added by Claude Code
│   └── 20260813_overdue_payment_consent.sql       # new feature, added by Claude Code
│
├── design-reference/               # static HTML/image mockups, not app code
├── proxy.ts                         # Next.js middleware (auth/signup gating)
├── next.config.ts, tsconfig.json, package.json, components.json
├── CLAUDE.md, AGENTS.md, README.md
└── .claude/                         # Claude Code agent configs (not app code)
```

---

## 3. Database Schema (Supabase Postgres)

Reconstructed from all 19 migration files, in final cumulative form (i.e. after every `ALTER TABLE` is applied — not any single migration's snapshot).

### `tutors`
Primary tutor record. `id = auth.uid()`.
```
id                     uuid PK (default auth.uid())
phone                  text UNIQUE NOT NULL
name                   text NOT NULL
email                  text UNIQUE NOT NULL
email_verified         boolean
phone_verified         boolean
whatsapp_number        text
subjects               jsonb (default '[]')        -- see lib/types/subjects.ts for shape
availability           jsonb (default '[]')
payment_instructions   text
reschedule_policy      text (default 'auto_24h')     -- auto_24h | auto_48h | manual
noshow_policy          text (default 'ask')          -- forfeit | reschedule | ask
notification_prefs     jsonb (default '{}')
monthly_due_date       int (default 5)
grace_period_days      int (default 3)
message_count          int (default 0)
plan                   text (default 'trial')        -- trial | starter | growth | pro | unlimited
status                 text (default 'pending')      -- pending | incomplete | active | suspended
avatar_url             text
recovery_email         text
last_active_at         timestamptz
created_at             timestamptz
onboarding_complete    boolean (default false)
teaching_style         text                          -- individual | group | both
taking_new_individual  boolean
session_duration_mins  int (default 60)
buffer_mins            int (default 0/15, re-added twice)
auto_notify_overdue    boolean NOT NULL (default true)     -- added this session
manual_mode_hint_seen  boolean NOT NULL (default false)    -- added this session
```

### `otp_attempts`
Server-side OTP rate limiting. No RLS policy (deny-all; service-role only).
```
id, identifier (SHA-256 hash), attempts, locked_until, last_attempt_at
```

### `rate_limits`
Per-IP action limiting (signup/otp_send/login). No RLS policy (service-role only).
```
id, ip_address (hashed), action, attempts, window_start, blocked_until
```

### `audit_logs`
Append-only action log. RLS: tutor can SELECT/INSERT own rows (added migration `20260619`).
```
id, tutor_id (nullable FK), action, entity, entity_id, old_value jsonb, new_value jsonb,
ip_address (hashed), user_agent, status (success|failure), created_at
```

### `support_requests`
Account-recovery submissions. No RLS policy (service-role only).
```
id, full_name, email, phone, proof_details (renamed from `details`), status
  (pending|investigating|resolved|rejected), ip_address (hashed), created_at,
old_email, old_phone, new_email, new_phone, resolved_at, resolved_by, resolution_notes,
tutor_id (nullable FK, set only for authenticated contact-change recovery), change_type
```

### `contact_change_requests`
Dual-channel email/phone change flow with self-generated OTPs (deliberately bypasses Supabase Auth OTP). No RLS policy (service-role only).
```
id, tutor_id, change_type (email|phone), old_value, new_value,
status (pending_old_otp|pending_new_otp|completed|expired|cancelled|support_review),
old_otp_code, old_otp_sent_at, old_otp_verified_at, old_otp_attempts,
new_otp_code, new_otp_sent_at, new_otp_verified_at, new_otp_attempts,
used_fallback, fallback_channel (phone|email), ip_address (hashed), user_agent,
expires_at (default now()+30min), created_at, completed_at
```

### `students`
RLS: tutor sees own rows only.
```
id, tutor_id, name, whatsapp, parent_name, parent_whatsapp, subject, grade,
class_type (individual|group|trial, default 'individual'), batch_id (FK → batches.id,
FK was missing until the 20260813 fix migration), monthly_fee, fee_type, status
(active|inactive|blocked), consent_given, consent_at, created_at,
phone_history jsonb, first_seen_at, blocked_at, blocked_reason (spam|abusive|non_payment|other),
trial_fee_paid, trial_status (null|scheduled|completed|accepted|declined|converted),
import_source (manual|csv|bot), import_batch_id, status_reason, deactivated_at
```

### `batches`
RLS: tutor sees own rows only. View `batches_with_count` joins in live active-student counts.
```
id, tutor_id, name, subject, grade, schedule_day, schedule_day_number (1=Sun..7=Sat, default 1),
schedule_time, max_students, monthly_fee, zoom_meeting_id, current_zoom_link,
current_zoom_meeting_id, zoom_link_generated_at, status (active|paused|inactive), created_at,
accepting_new (default true), session_duration_mins (default 60)
```

### `sessions`
RLS: tutor sees own rows only. Unique constraint `(tutor_id, batch_id, scheduled_at)`.
```
id, tutor_id, student_id, batch_id, session_type (individual|batch), scheduled_at,
duration_mins (default 60), zoom_link, zoom_meeting_id, status
(scheduled|completed|no_show|cancelled), payment_status (pending|paid|forfeited), notes,
reminder_24h_sent, reminder_1h_sent, tutor_notified_30min, created_at,
cancelled_reason, rescheduled_to (self-FK → sessions.id)
```

### `attendance`
RLS: tutor sees own rows only. Unique `(session_id, student_id)`.
```
id, session_id, student_id, tutor_id, status (present|absent|late|unknown),
marked_at, notes, created_at
```

### `payments`
RLS: tutor sees own rows only.
```
id, tutor_id, student_id, session_id, amount_lkr, payment_type (monthly|per_session),
month_year (text 'YYYY-MM'), method, status (pending|paid|overdue|blocked), due_date,
paid_at, verified_by, reminder_3day_sent, reminder_due_sent, reminder_overdue_sent,
payment_reference, payment_screenshot_url, is_trial_payment, trial_deduction, full_fee,
reminder_count (default 0), reminder_sent_at, created_at,
tutor_notified_3day, tutor_notified_due    -- added this session (manual-mode dedup)
```
**Note:** `status`/`due_date` on this table are frozen at row-creation time and are never retroactively updated when a tutor changes `monthly_due_date`/`grace_period_days` in Settings — see §9.

### `reminders`
Defined in the schema (migration 006) but **no code in the repo appears to read or write this table** — likely dead/legacy; actual reminder tracking is done via boolean flags directly on `sessions`/`payments`.
```
id, session_id, student_id, type (24h|1h|30min_tutor|payment_due|payment_overdue),
channel (whatsapp|push, default 'whatsapp'), scheduled_at, sent_at,
status (pending|sent|failed), created_at
```

### `conversations`
RLS: tutor sees own rows only.
```
id, tutor_id, student_whatsapp, status (bot|human|resolved),
context jsonb (default '{"step":"greeting"}'), messages jsonb (default '[]', unbounded array —
flagged as a future scaling concern), test_mode, last_message_at, created_at
```

### `message_logs`
Per-message cost tracking for plan caps. RLS: tutor sees own rows only.
```
id, tutor_id, direction (inbound|outbound), cost_usd, month_year, test_mode, created_at,
student_phone (for per-phone rate limiting)
```

### `notifications`
In-app tutor notification feed. RLS: tutor sees own rows only.
```
id, tutor_id, type (payment_pending|bot_needs_help|overdue_fee|no_show|at_risk|general|
payment_reminder_summary — last one added this session, not in the original comment list),
title, body, action_url, read, created_at
```

### `waitlist`
RLS: tutor sees own rows only.
```
id, tutor_id, student_name, student_whatsapp, subject, grade,
class_type (default 'group'), batch_id, status (waiting|offered|enrolled|expired),
notified_at, created_at
```

---

## 4. API Routes

| Route | Methods | Description |
|---|---|---|
| **Auth** |||
| `/api/auth/change-email/start` | POST | Step 1 of email change — OTP to current email to confirm identity. |
| `/api/auth/change-email/verify-old` | POST | Step 2 — verifies current-email OTP, issues OTP to new email. |
| `/api/auth/change-email/verify-new` | POST | Step 3 — verifies new-email OTP, commits change in `tutors`+Supabase Auth, alerts both addresses + WhatsApp. |
| `/api/auth/change-email/fallback` | POST | Resends the identity-confirmation OTP via WhatsApp if current email is inaccessible. |
| `/api/auth/change-phone/start` | POST | Step 1 of phone change — OTP to current WhatsApp number (or skips to new-number step if none on file). |
| `/api/auth/change-phone/verify-old` | POST | Step 2 — verifies current-number OTP, issues OTP to new number. |
| `/api/auth/change-phone/verify-new` | POST | Step 3 — verifies new-number OTP, commits change, notifies old/new numbers + email. |
| `/api/auth/change-phone/fallback` | POST | Resends identity-confirmation OTP via email if current WhatsApp is inaccessible. |
| `/api/auth/contact-change/support-recovery` | POST | Authenticated fallback when a tutor mid-change can't complete OTP on either channel — files a support ticket. |
| `/api/auth/support-recovery` | POST | Public, rate-limited account-recovery submission → `support_requests` + email alerts. |
| `/api/auth/verify-turnstile` | POST | Server-side Cloudflare Turnstile CAPTCHA verification. |
| `/api/auth/welcome-email` | POST | Sends post-signup welcome email. |
| **Batches** |||
| `/api/batches` | GET, POST | GET: tutor's batches + live payment/enrollment stats + waitlist. POST: create batch (checks name/schedule conflicts). |
| `/api/batches/[id]` | PATCH, DELETE | Update batch fields (conflict-checked); delete only if no active students. |
| `/api/batches/[id]/mark-all-paid` | POST | Marks all active students in a batch paid for the current month. |
| `/api/batches/[id]/remind-all` | POST | **Stub** — counts students to remind; WhatsApp send is a TODO (logs only). |
| `/api/batches/[id]/send-zoom` | POST | **Stub** — counts paid students who'd receive the link; real send is a TODO. |
| `/api/batches/[id]/zoom` | POST | **Stub** — generates a random/fake Zoom link, stores it (not a real Zoom API call). |
| **Sessions** |||
| `/api/sessions` | GET, POST | GET: sessions in a date window + stats. POST: create session (seeds attendance for batch sessions). |
| `/api/sessions/[id]` | PATCH, DELETE | Update session (attendance/payment side-effects); delete = soft cancel. |
| `/api/sessions/[id]/attendance` | POST | Upserts attendance, auto-completes session, flags "at risk" on 3+ consecutive absences. |
| `/api/sessions/[id]/cancel` | POST | Cancels a session with a reason. |
| `/api/sessions/[id]/reschedule` | POST | Cancels original, creates linked replacement session, recreates attendance for batches. |
| `/api/sessions/generate` | POST | Generates upcoming batch sessions from schedules for the authenticated tutor. |
| **Students** |||
| `/api/students` | GET | All students + batch name + current-month payment status. |
| `/api/students/[id]` | PATCH, DELETE | Update student (status transitions, phone-history audit); hard-delete only if eligible (no payments/sessions, <24h old). |
| `/api/students/[id]/eligibility` | GET | Checks whether a student is eligible for permanent deletion. |
| `/api/students/bulk-import` | POST | Bulk CSV import (≤500 rows) into students/payments/sessions with server-side re-validation. |
| `/api/students/csv-template` | GET | Generates a personalized CSV import template. |
| **Payments** |||
| `/api/payments/verify` | POST | Marks paid, generates/reuses Zoom link, sends via WhatsApp (Zoom/WhatsApp failure is non-fatal). |
| `/api/payments/send-reminder` | POST | One-off WhatsApp reminder for a specific payment. |
| **Reminders (cron)** |||
| `/api/reminders/send` | GET | Scheduled job (CRON_SECRET-gated in prod): session reminders (24h/1h/30min), payment reminders (3-day/due/overdue, consent-branched), expired slot cleanup, Sunday Zoom refresh, waitlist expiry, batch session generation. Never auto-blocks students. |
| **Waitlist** |||
| `/api/waitlist/offer` | POST | Offers open spot to next waiting entry. **WhatsApp send is a TODO** (message built, not sent). |
| `/api/waitlist/readd` | POST | Re-adds an expired entry as new "waiting". |
| `/api/waitlist/remove` | POST | Soft-deletes (sets status to expired). |
| `/api/waitlist/resend` | POST | Refreshes/rebuilds the offer message. **WhatsApp send is a TODO.** |
| **Zoom** |||
| `/api/zoom/refresh-batch` | POST | New Zoom meeting for a batch, updates batch + upcoming sessions, notifies paid students. |
| `/api/zoom/send-batch` | POST | Re-sends existing current link to paid students (no new meeting). |
| **Messaging / Webhooks** |||
| `/api/messaging/[provider]/webhook` | GET, POST | Generic multi-provider webhook → `processWebhook()`. |
| `/api/whatsapp/webhook` | GET, POST | Twilio-specific webhook, same underlying handler. |
| `/api/test/webhook` | GET | **Dev-only** (404s in prod) — simulates an inbound WhatsApp message. |
| **Misc** |||
| `/api/avatar` | POST | Validates/resizes avatar image (sharp → 400×400 WebP) → Supabase Storage. |
| `/api/onboarding/complete` | POST | Marks tutor's onboarding as complete. |
| `/api/settings/dismiss-manual-hint` | POST | Marks the manual-reminder-mode dashboard hint as seen. |

---

## 5. Pages

| Path | Description |
|---|---|
| `app/page.tsx` | Public landing page — hero, how-it-works, pricing. |
| `app/(app)/dashboard/page.tsx` | Tutor home — today's sessions, upcoming classes, at-risk students (overdue payments + missed sessions), income stats, onboarding checklist. |
| `app/(app)/students/page.tsx` | Student roster — search/filter, add/edit, CSV import, payment status. |
| `app/(app)/batches/page.tsx` | Batch/group management — create/edit, enrolled students, per-batch payment status, waitlist. |
| `app/(app)/groups/page.tsx` | Group-class related view (uses `(app)` layout; overlaps conceptually with batches). |
| `app/(app)/sessions/page.tsx` | Session scheduling — list/calendar views, attendance, reschedule; defines shared `Session` types. |
| `app/(app)/payments/page.tsx` | Payments — pending/overdue/paid/trial/all tabs, mark-as-paid, per-student history. |
| `app/(app)/chats/page.tsx` | WhatsApp-style inbox — bot/needs-help/resolved conversations, broadcast modal. |
| `app/(app)/waitlist/page.tsx` | Batch waitlist management — offer/withdraw/re-add across waiting/offered/enrolled/expired. |
| `app/(app)/settings/page.tsx` | Account settings — profile, subjects/fees, availability, payments, notifications, email/phone change security flow. |
| `app/(app)/layout.tsx` | Authenticated shell — sidebar/topbar, sign-out, Contact Support modal. |
| `app/(auth)/login/page.tsx` | Login — phone OTP primary, email OTP fallback, Turnstile. |
| `app/(auth)/login/recover/page.tsx` | Account recovery — enumeration-safe email OTP reset. |
| `app/(auth)/signup/page.tsx` | Signup step 1 — profile + email OTP + Turnstile. |
| `app/(auth)/signup/classes/page.tsx` | Signup step 2 — subjects/grades/fees. |
| `app/(auth)/signup/payments/page.tsx` | Signup step 3 — payment instructions/due date/grace period + reminder-consent radio (added a previous session). |
| `app/(auth)/signup/preferences/page.tsx` | Signup step 4 — WhatsApp/policies, activates account + welcome email. |
| `app/(auth)/support/recovery/page.tsx` | Support-assisted recovery form (lost both email and phone). |
| `app/(auth)/layout.tsx` | Auth route-group shell — navbar + step-progress panel. |
| `app/(onboarding)/layout.tsx` | Minimal onboarding layout wrapper. |
| `app/layout.tsx` | Root layout — fonts, global CSS, `ScrollLock`. |

The previously-noted parallel signup flow (`subjects/groups/availability/settings`) was confirmed unreachable and **deleted 2026-09-02** — see §9.

---

## 6. Components

| Path | Description |
|---|---|
| `AddSessionModal.tsx` | Create an individual or batch session manually. |
| `AddStudentModal.tsx` | Add a student (individual/batch/trial), optional first session + payment. |
| `BatchAttendancePanel.tsx` | Mark per-student attendance for a batch session. |
| `CSVUpload.tsx` | Bulk student import with per-row validation. |
| `CountUp.tsx` | Animated numeric count-up span. |
| `CountryDialSelect.tsx` | Searchable country-dial-code dropdown. |
| `CreateBatchModal.tsx` / `EditBatchModal.tsx` | Create / edit a batch. |
| `EditSessionPanel.tsx` | Edit/cancel a session, launch reschedule/attendance. |
| `EditStudentPanel.tsx` | Edit student profile, status, payment shortcuts. |
| `GettingStarted/index.tsx` | Post-signup onboarding wizard. |
| `GettingStartedChecklist.tsx` | Compact dashboard onboarding banner. |
| `InviteMessage.tsx` | Copyable WhatsApp invite message for existing students. |
| `ManualModeHint.tsx` | Dismissible banner explaining manual reminder mode (added this session). |
| `OverduePaymentsCard.tsx` | Embeddable overdue-payments group with mark-paid/remind/block actions (added this session). |
| `PaymentCard.tsx` | Single payment status card; exports shared `EnrichedPayment` type. |
| `PaymentHistoryPanel.tsx` | Full payment history for one student. |
| `RescheduleModal.tsx` | Reschedule a session. |
| `ScrollLock.tsx` | Global side-effect component preventing scroll-wheel `<select>` changes. |
| `SessionCalendar.tsx` | Weekly session calendar grid. |
| `StepBadge.tsx` | Small step-number pill badge. |
| `WaitlistPanel.tsx` | Batch waitlist list with offer/remove actions. |
| `ui/*` | shadcn/ui-style primitives (badge, button, card, input, progress, select, separator, DateTimeInput) built on Base UI. |

---

## 7. Lib Modules

| Path | Description |
|---|---|
| `lib/audit.ts` | Fire-and-forget audit-log writer → `audit_logs`. |
| `lib/auth.ts` | Client OTP send/verify helpers, lockout tracking. (`getCurrentTutor`/`isSignupComplete`/`getSignupRedirect` — a second, conflicting signup-redirect implementation pointing at the deleted orphaned flow — were removed 2026-09-02 as confirmed dead code; `proxy.ts` is the one real redirect implementation.) |
| `lib/bot/claude-intent.ts` | Claude (Haiku) intent classification for WhatsApp messages. |
| `lib/bot/handler.ts` | Core WhatsApp bot conversation state machine (`BotStep`/`BotContext`). |
| `lib/bot/process-webhook.ts` | Webhook orchestrator → bot handler → WhatsApp replies/Zoom sends. |
| `lib/contactChange.ts` | Self-generated OTP helpers for email/phone change (bypasses Supabase Auth OTP intentionally). |
| `lib/contexts/tutor.tsx` | `TutorContext`/`useTutor` — exposes tutor's subjects list. |
| `lib/countries.ts` | Dial codes + phone validation (default Sri Lanka). |
| `lib/db-migrations.ts` | Raw SQL string for manual dashboard execution (legacy/manual companion to `supabase/migrations/`). |
| `lib/mask.ts` | `maskEmail`/`maskPhone` display helpers. |
| `lib/payment-status.ts` | **`computeOverdueStatus()`** — single source of truth for overdue math, used everywhere (added this session). |
| `lib/providers/messaging.ts` | Pluggable `MessagingProvider` interface. |
| `lib/providers/video.ts` | Pluggable `VideoProvider` interface. |
| `lib/rateLimit.ts` | Supabase-backed rate limiter for signup/OTP/login/contact-change. |
| `lib/resend.ts` | Transactional email via Resend (test domain currently). |
| `lib/sessions/generate-batch-sessions.ts` | Generates upcoming batch session rows from schedules. |
| `lib/supabase/client.ts` / `server.ts` | Browser / server Supabase client factories. |
| `lib/turnstile.ts` | Cloudflare Turnstile verification (dev bypass present). |
| `lib/twilio.ts` | WhatsApp send helpers — **currently test-mode only**, logs instead of sending. |
| `lib/types/database.ts` | Hand-written DB row types (should eventually be replaced by `supabase gen types`). |
| `lib/types/subjects.ts` | Types for the `tutors.subjects` JSONB shape. |
| `lib/utils.ts` | `cn()` classname merge helper. |
| `lib/zoom.ts` | Zoom OAuth + meeting creation, falls back to fake URLs without real credentials. |
| `lib/zoom-helpers.ts` | `sendLinkToPaidStudents()` shared helper. |

---

## 8. CLAUDE.md (Full Current Contents)

```markdown
# Smartclaz — Claude Code Developer Guide

## What is Smartclaz?
The operating system for Sri Lankan online tutors. Automates student onboarding, class bookings, payments, Zoom links and reminders — all through WhatsApp. Tutors use the web dashboard. Students interact 100% via WhatsApp. No student login. No student website.

**Tagline:** "Less admin, more teaching"

---

## ⚠️ Live Signup Flow (confirmed from code, not from the docs below)
This file's "App Pages" section below describes an earlier planned architecture
(`src/app/signup/subjects` → `settings`) that no longer matches the codebase.
The actual paths are `app/(auth)/signup/*`, and the **only live, middleware-enforced
signup flow** — confirmed via `proxy.ts`'s `stepOrder` array and every page's actual
"Continue" button destination — is:

```
/signup → /signup/classes → /signup/payments → /signup/preferences → /dashboard
(profile)  (subjects/fees)   (payment setup)     (WhatsApp/policies,
                                                   sets status='active')
```

An earlier, unreachable parallel flow (`signup/subjects`, `signup/groups`,
`signup/availability`, `signup/settings`) existed in the codebase but was never
linked from Step 1 and was not checked by `proxy.ts` — it has been deleted.
Do not recreate pages at those paths without first checking whether they'd
actually be reachable from `/signup`.

---

## Tech Stack
- **Framework:** Next.js 14 + TypeScript
- **UI:** Tailwind CSS + shadcn/ui components
- **Database + Auth:** Supabase (Postgres + Phone OTP)
- **WhatsApp:** Twilio WhatsApp Business API
- **AI Bot:** Claude API (Sonnet) — powers WhatsApp bot
- **Video:** Zoom API — auto-generate meeting links
- **Push Notifications:** Web Push API
- **Hosting:** Netlify (already deployed)
- **Payments (Phase 3 only):** PayHere

---

## Design System

> Inspired by Calendly. Single dominant color — Indigo. Multi-color only for semantic states (paid/unpaid/pending). Common UI elements (buttons, nav, focus rings, badges, icons) all use Indigo only.

### Color Philosophy
```
PRIMARY BRAND = Indigo only
  Use for: buttons, active nav, focus rings, links,
           primary badges, icons, highlights, CTAs

SEMANTIC ONLY = use sparingly, only for status:
  Green  = paid, present, success
  Amber  = pending, warning, late
  Red    = unpaid, absent, error, overdue

NEVER use green/amber/red for decorative UI —
only when communicating a real status to the tutor.
```

### Color Tokens
```css
/* ── Brand (use everywhere in UI) ── */
--navy:         #0e1f3b   /* Sidebar, topbar background */
--navy2:        #162844   /* Sidebar hover, secondary bg */
--indigo:       #3b5bdb   /* PRIMARY — all buttons, links, active states */
--indigo2:      #4c6ef5   /* Hover state of primary */
--indigo3:      #748ffc   /* Active nav text, banner accent */
--indigo-pale:  #edf2ff   /* Badge bg, soft button bg, icon bg */
--indigo-mid:   #dbe4ff   /* Badge border, soft button border */

/* ── Semantic (status only) ── */
--green:        #2f9e44   /* Paid · Present · Success */
--green-pale:   #ebfbee   /* Paid card bg */
--green-border: #b2f2bb   /* Paid badge border */
--amber:        #e67700   /* Pending · Warning · Late */
--amber-pale:   #fff9db   /* Pending card bg */
--amber-border: #ffec99   /* Pending badge border */
--red:          #c92a2a   /* Unpaid · Absent · Error · Overdue */
--red-pale:     #fff5f5   /* Error card bg */
--red-border:   #ffc9c9   /* Error badge border */

/* ── Neutrals ── */
--ink:     #1a1a2e   /* Headings, primary text */
--ink2:    #343a40   /* Labels, secondary headings */
--ink3:    #6c757d   /* Body text, meta info */
--ink4:    #adb5bd   /* Placeholders, timestamps */
--ink5:    #ced4da   /* Dividers, muted borders */
--bg:      #f8f9fa   /* Page background */
--bg2:     #f1f3f5   /* Section bg, input bg on hover */
--surface: #ffffff   /* Cards, modals, inputs */
--border:  #dee2e6   /* Card borders, dividers */
--border2: #ced4da   /* Input borders, stronger dividers */
```

### Typography
```
Display heading:  Plus Jakarta Sans 800 · 2.6rem · -0.03em tracking
Page title (H1):  Plus Jakarta Sans 800 · 1.5rem · -0.025em tracking
Section title:    Plus Jakarta Sans 700 · 1.05rem · -0.02em tracking
Card title:       Plus Jakarta Sans 700 · 0.84rem · -0.01em tracking
Body text:        Plus Jakarta Sans 400 · 14px · 1.6 line-height
Small / meta:     Plus Jakarta Sans 500 · 0.7rem
Mono label:       JetBrains Mono 600 · 0.56rem · uppercase · 0.12em tracking
LKR amounts:      Plus Jakarta Sans 800 · 1.6rem+ · -0.04em · indigo color

Google Fonts import:
https://fonts.googleapis.com/css2?family=Plus+Jakarta+Sans:wght@400;500;600;700;800&family=JetBrains+Mono:wght@400;500;600&display=swap
```

### Radius Tokens
```css
--r-sm:   6px    /* Small elements, mark buttons */
--r:      10px   /* Inputs, small cards, small buttons */
--r-md:   14px   /* Standard cards, medium buttons */
--r-lg:   18px   /* Large cards, stat cards */
--r-xl:   24px   /* Large modals, feature sections */
--r-pill: 100px  /* Badges, pill buttons, toggles */
```

### Shadow Tokens
```css
--s1: 0 1px 3px rgba(0,0,0,0.06), 0 1px 2px rgba(0,0,0,0.04)  /* Cards default */
--s2: 0 4px 12px rgba(0,0,0,0.08), 0 2px 4px rgba(0,0,0,0.04) /* Cards hover */
--s3: 0 8px 24px rgba(0,0,0,0.1),  0 3px 8px rgba(0,0,0,0.05) /* Modals, dropdowns */
--s-indigo: 0 4px 14px rgba(59,91,219,0.3)                     /* Primary buttons */
```

### Component Patterns

**Buttons:**
```
Primary:   bg-[--indigo] text-white shadow-[--s-indigo] rounded-[10px] px-5 py-2.5
           hover: bg-[--indigo2] translateY(-1px) shadow stronger
Ghost:     border-1.5 border-[--border2] rounded-[10px] px-5 py-2.5
           hover: border-[--indigo] text-[--indigo] bg-[--indigo-pale]
Soft:      bg-[--indigo-pale] text-[--indigo] border border-[--indigo-mid]
Sizes:     xs=5/11, sm=7/14, md=10/20, lg=13/26 (py/px in px)
Pill:      border-radius: 100px on any button variant
```

**Badges:**
```
All badges: rounded-full, 1px border, font-weight 700, font-size 0.68rem
Indigo:    bg-[--indigo-pale]  text-[--indigo]  border-[--indigo-mid]   → system labels
Green:     bg-[--green-pale]   text-[--green]   border-[--green-border] → paid/present
Amber:     bg-[--amber-pale]   text-[--amber]   border-[--amber-border] → pending/late
Red:       bg-[--red-pale]     text-[--red]     border-[--red-border]   → unpaid/absent
Neutral:   bg-[--bg2]          text-[--ink3]    border-[--border2]      → inactive
```

**Inputs:**
```
border: 1.5px solid --border2
border-radius: 10px
padding: 9px 13px
focus: border-color --indigo, box-shadow 0 0 0 3px rgba(59,91,219,0.12)
valid: border-color --green, background --green-pale
error: border-color --red, background --red-pale
font: Plus Jakarta Sans 400, 0.82rem
```

**Cards:**
```
background: --surface
border: 1px solid --border
border-radius: --r-lg (18px)
box-shadow: --s1
hover: translateY(-2px), box-shadow --s2
padding: 18px
```

**Stat Cards:**
```
Same as card above +
Icon container: 38x38px, border-radius --r, bg = --indigo-pale (use indigo for all icons)
Value: Plus Jakarta Sans 800, 1.6rem, -0.04em, color --ink (or --indigo for LKR)
Trend up: color --green with ↑ arrow
Trend down: color --red with ↓ arrow
Label: Plus Jakarta Sans 600, 0.72rem, --ink3
```

**Navigation sidebar:**
```
Background: --navy
Item default:  color rgba(255,255,255,0.5), padding 7px 9px, rounded-[8px]
Item hover:    background rgba(255,255,255,0.06), color rgba(255,255,255,0.85)
Item active:   background rgba(59,91,219,0.2), color --indigo3,
               border 1px solid rgba(59,91,219,0.3)
Section label: JetBrains Mono, 0.55rem, uppercase, rgba(255,255,255,0.25)
```

**Notification cards:**
```
Unread: border-left 3px solid --indigo (default) or semantic color
Read:   border: 1px solid --border (no left accent)
Always: border-radius --r-md, padding 13px 15px, box-shadow --s1
```

**Toggles:**
```
OFF: background --border2
ON:  background --indigo  ← always indigo, never semantic colors
Knob: 18x18px white circle, box-shadow 0 1px 4px rgba(0,0,0,0.2)
Width: 42px, height 24px, border-radius pill
```

**Progress bars:**
```
Track: height 8px, bg --bg2, border-radius pill
Fill color:
  Good (>70%):   --green
  Warning (>50%): --amber
  Bad (<50%):    --red
  Generic:       --indigo (for occupancy, usage bars)
```

**Bottom sheet modal:**
```
Overlay: rgba(0,0,0,0.5) + backdrop-blur(6px)
Sheet: background white, border-radius 20px 20px 0 0
Handle: 38x4px, --border2, rounded-full, centered
padding: 18px
```

---

## Database Schema (Supabase)

```sql
-- Tutors
tutors (
  id uuid primary key,
  phone text unique,
  name text,
  email text,
  whatsapp_number text,
  subjects jsonb,          -- [{subject, grade, individual_fee, group_fee, trial_fee}]
  availability jsonb,      -- [{day, start_time, end_time}]
  payment_instructions text,
  reschedule_policy text,  -- 'auto_24h' | 'auto_48h' | 'manual'
  noshow_policy text,      -- 'forfeit' | 'reschedule' | 'ask'
  notification_prefs jsonb,
  monthly_due_date int,    -- day of month (e.g. 5)
  grace_period_days int,
  message_count int,       -- for cost tracking
  plan text,               -- 'starter' | 'growth' | 'pro' | 'unlimited'
  created_at timestamptz
)

-- Students
students (
  id uuid primary key,
  tutor_id uuid references tutors,
  name text,
  whatsapp text,
  parent_name text,
  parent_whatsapp text,
  subject text,
  grade text,
  class_type text,         -- 'individual' | 'batch' | 'trial'
  batch_id uuid references batches,
  monthly_fee int,         -- in LKR
  fee_type text,           -- 'monthly' | 'per_session'
  status text,             -- 'active' | 'inactive' | 'blocked'
  consent_given boolean,
  consent_at timestamptz,
  created_at timestamptz
)

-- Batches (recurring group classes)
batches (
  id uuid primary key,
  tutor_id uuid references tutors,
  name text,               -- e.g. "A/L Maths 2027 Batch"
  subject text,
  grade text,
  schedule_day text,       -- e.g. "Sunday"
  schedule_time time,      -- e.g. "08:00"
  max_students int,
  monthly_fee int,         -- LKR per student
  zoom_meeting_id text,    -- recurring Zoom meeting
  status text,             -- 'active' | 'inactive'
  created_at timestamptz
)

-- Sessions
sessions (
  id uuid primary key,
  tutor_id uuid references tutors,
  student_id uuid references students,
  batch_id uuid references batches,
  session_type text,       -- 'individual' | 'batch'
  scheduled_at timestamptz,
  duration_mins int,
  zoom_link text,
  zoom_meeting_id text,
  status text,             -- 'scheduled' | 'completed' | 'no_show' | 'cancelled'
  payment_status text,     -- 'pending' | 'paid' | 'forfeited'
  notes text,
  created_at timestamptz
)

-- Payments
payments (
  id uuid primary key,
  tutor_id uuid references tutors,
  student_id uuid references students,
  session_id uuid references sessions,
  amount_lkr int,
  payment_type text,       -- 'monthly' | 'per_session'
  month_year text,         -- e.g. "2025-06" for monthly
  method text,             -- 'bank' | 'ezCash' | 'cash' | 'payhere'
  status text,             -- 'pending' | 'paid' | 'overdue' | 'blocked'
  due_date date,
  paid_at timestamptz,
  verified_by text,        -- 'tutor' | 'payhere'
  created_at timestamptz
)

-- Reminders
reminders (
  id uuid primary key,
  session_id uuid references sessions,
  student_id uuid references students,
  type text,               -- '24h' | '1h' | '30min_tutor' | 'payment_due' | 'payment_overdue'
  channel text,             -- 'whatsapp' | 'push'
  scheduled_at timestamptz,
  sent_at timestamptz,
  status text              -- 'pending' | 'sent' | 'failed'
)

-- WhatsApp Conversations
conversations (
  id uuid primary key,
  tutor_id uuid references tutors,
  student_whatsapp text,
  status text,             -- 'bot' | 'human' | 'resolved'
  context jsonb,            -- bot conversation state
  last_message_at timestamptz,
  created_at timestamptz
)

-- Message Cost Tracking
message_logs (
  id uuid primary key,
  tutor_id uuid references tutors,
  direction text,           -- 'inbound' | 'outbound'
  cost_usd decimal,
  month_year text,
  created_at timestamptz
)
```

---

## App Pages — Build in This Order

### 1. Landing Page
**File:** `src/app/page.tsx`
**Access:** Public
**Content:**
- Hero: "The operating system for Sri Lankan tuition teachers"
- Problem section: show WhatsApp chaos (before)
- Solution section: show automated flow (after)
- Features: WhatsApp bot, auto Zoom, batch management, monthly fees
- Pricing tiers: Starter LKR 990 / Growth LKR 1,990 / Pro LKR 3,490 / Unlimited LKR 4,990
- CTA: "Start Free 30-day Trial"
- No credit card required

### 2. Signup — Step 1 Basic Profile
**File:** `src/app/signup/page.tsx`
**Access:** Public
**Fields:**
- Full name
- Email
- Phone number (Sri Lanka +94 format)
- OTP verification via Supabase
- On success → redirect to /signup/subjects

### 3. Signup — Step 2 Subjects & Fees
**File:** `src/app/signup/subjects/page.tsx`
**Access:** Auth required
**Fields:**
- Add subject (dropdown: Mathematics, Science, Physics, Chemistry, English, Sinhala, ICT, Other)
- Grade level (A/L, O/L, Grade 9, Grade 8, Grade 7, Grade 6, Grade 5)
- Individual session fee (LKR)
- Group/batch fee per student (LKR)
- Trial class: Free toggle or paid amount
- Fee type: Monthly / Per session / Both
- Payment instructions (textarea — bank details, eZCash etc)
- Can add multiple subjects
- On success → redirect to /signup/settings

### 4. Signup — Step 3 Settings & WhatsApp
**File:** `src/app/signup/settings/page.tsx`
**Access:** Auth required
**Fields:**
- Weekly availability (day + time slots)
- Session duration (1hr / 1.5hr / 2hr)
- Buffer between sessions (15min / 30min)
- Reschedule policy (auto 24hr / auto 48hr / always manual)
- Max reschedules per student per month (1 / 2 / Unlimited)
- No-show policy (forfeit / offer reschedule / ask each time)
- Group minimum students to run (1 / 3 / 5 / ask me)
- Monthly fee due date (day of month)
- Grace period before blocking access (3 / 5 / 7 days)
- Notification preferences (per event: App / WhatsApp / Both)
- WhatsApp Business number connection
- On success → redirect to /dashboard

### 5. Dashboard (Main)
**File:** `src/app/dashboard/page.tsx`
**Access:** Auth required (middleware)
**Sections:**

**Header strip:**
- "Good morning, [Name]" greeting
- Today's date

**Pending actions card (top priority — shown first):**
- Payments pending verification (count + tap to verify)
- Bot needs help (count + tap to join chat)
- Students overdue on monthly fee (count)

**Stats row:**
- This month income (LKR)
- Active students count
- Sessions today
- Outstanding payments (LKR)

**Today's sessions list:**
- Time, student name, subject, type (individual/batch)
- Status: upcoming / completed / no-show
- Quick mark attendance buttons

**Upcoming this week:**
- List of next 7 days sessions

**Recent WhatsApp activity:**
- Latest student conversations
- "Join Chat" button if bot is paused

### 6. Students Page
**File:** `src/app/students/page.tsx`
**Access:** Auth required
**Features:**
- Search by name
- Filter: All / Active / Inactive / Blocked
- Filter: Subject / Grade / Class type
- Student card: name, subject, grade, fee, payment status badge
- Tap student → detail sheet:
  - Full profile
  - Payment history
  - Attendance history
  - Call / WhatsApp buttons
  - Edit / Remove buttons
- Add student button → form (name, whatsapp, parent details, subject, grade, fee, class type)

### 7. Batches Page
**File:** `src/app/batches/page.tsx`
**Access:** Auth required
**Features:**
- List of all batches
- Batch card: name, subject, grade, schedule, enrolled/max students, monthly fee
- Batch status: active / inactive
- Tap batch → detail:
  - Students enrolled list
  - Attendance per session
  - Payment status per student
  - This month paid/unpaid breakdown
- Create batch button → form:
  - Batch name
  - Subject + grade
  - Schedule day + time
  - Max students
  - Monthly fee per student
- Zoom link shown per batch (auto-generated weekly)

### 8. Sessions Page
**File:** `src/app/sessions/page.tsx`
**Access:** Auth required
**Features:**
- Calendar view (week default)
- List view toggle
- Session card: time, student/batch, subject, status, payment status
- Filter: All / Individual / Batch / Today / This week
- Tap session → detail:
  - Full session info
  - Zoom link
  - Attendance status
  - Payment status
  - Add notes button
  - Notes sent to student via WhatsApp

### 9. Payments Page
**File:** `src/app/payments/page.tsx`
**Access:** Auth required
**Features:**
- Month selector (current month default)
- Revenue summary: Collected / Expected / Outstanding (LKR)
- Collection rate progress bar
- Tabs: All / Pending / Paid / Overdue
- Per student row: name, amount, due date, status
- "Mark Paid" button → confirm modal (method: bank/cash/eZCash)
- "Send Reminder" → WhatsApp reminder to student/parent
- "Remind All Unpaid" → bulk reminder button
- Outstanding students highlighted in red

### 10. WhatsApp Chats Page
**File:** `src/app/chats/page.tsx`
**Access:** Auth required
**Features:**
- List of all student conversations
- Status badge: Bot active / Needs help / Resolved
- Unread indicator
- Tap conversation → full chat view:
  - WhatsApp-style message bubbles
  - "Join Chat" button (pauses bot)
  - Type and send manually when in human mode
  - "Hand back to bot" button
  - Bot resumes automatically

### 11. Settings Page
**File:** `src/app/settings/page.tsx`
**Access:** Auth required
**Sections:**
- Profile (name, email, phone)
- Subjects & Fees (edit all fee structures)
- Availability (weekly schedule)
- Policies (reschedule, no-show, group rules)
- Payment instructions (bank details, eZCash)
- Monthly fee settings (due date, grace period)
- Notification preferences (per event type)
- WhatsApp Business connection
- Subscription plan + usage

### 12. WhatsApp Webhook API
**File:** `src/app/api/whatsapp/webhook/route.ts`
**Access:** Public (Twilio calls this)
**Logic:**
- Receive incoming WhatsApp message from Twilio
- Look up tutor by phone number
- Check conversation status (bot / human)
- If human mode → notify tutor, store message, wait
- If bot mode → pass to Claude API with context
- Claude determines intent and generates reply
- Save conversation context to Supabase
- Send reply via Twilio
- Handle: new student, booking, payment confirm, reschedule, no-show, general questions

---

## Key Business Rules

```
STUDENT RULES:
- Students NEVER log in to any website
- Students interact 100% via WhatsApp only
- Student must reply "AGREE" to class rules before proceeding
- Consent saved to database with timestamp

PAYMENT RULES:
- No automatic payment processing in MVP
- Tutor manually verifies each payment (1 tap)
- After tutor confirms → Zoom link sent automatically
- Monthly fee reminders: 3 days before, on due date, 3 days after, 7 days after
- After grace period → student status = 'blocked' → no Zoom link sent

ZOOM RULES:
- Fresh Zoom link generated per session (not reused)
- Individual: unique link per student per session
- Batch: one link per batch per week (fresh each week)
- Link sent ONLY to students with status = 'active' + payment = 'paid'
- Dashboard shows enrolled count vs joined count
- If joined > enrolled → alert tutor → tutor can regenerate link

BOT RULES:
- Bot handles 100% of student conversations automatically
- Bot collects: name → subject → grade → class type → slot/batch → shows fee
- Bot sends class rules → waits for "AGREE" → then sends payment instructions
- If bot gets confused → auto-detect → pause bot → notify tutor (App + WhatsApp)
- Tutor joins manually → handles → hands back → bot resumes
- Student sees "Sohan sir will reply shortly" while bot is paused

NOTIFICATION RULES:
- All tutor notifications go to BOTH app push AND WhatsApp (unless tutor disabled)
- 24hr reminder → student WhatsApp + Zoom link
- 1hr reminder → student WhatsApp + Zoom link
- 30min → tutor app push + WhatsApp
- Payment pending → tutor App + WhatsApp immediately
- Bot needs help → tutor App + WhatsApp immediately with chat link

FEE RULES:
- Fees set per subject + grade + class type
- Individual fee ≠ batch fee ≠ trial fee
- Custom fee can be set per student (override)
- Monthly or per-session — tutor's choice per subject
- All amounts in LKR only

MESSAGE COST RULES:
- Track every outbound message per tutor
- Log cost in message_logs table
- Caps: Starter 500/mo, Growth 1500/mo, Pro 5000/mo, Unlimited = no cap
- Alert tutor at 80% of cap
- Alert admin if cost > 80% of tutor's revenue
```

---

## WhatsApp Bot Conversation Flow

```
Student message received
        ↓
Is conversation status = 'human'?
  YES → Store message, notify tutor (App + WA), wait
  NO  → Continue to bot
        ↓
Is this a new student (no record found)?
  YES → Start onboarding flow:
        1. Collect name
        2. Show subjects tutor teaches
        3. Student picks subject + grade
        4. Show class types + fees
        5. Student picks class type
        6. Show available slots / batches
        7. Student picks slot/batch
        8. Send class rules + consent request
        9. Wait for "AGREE"
        10. Send payment instructions with correct fee
        11. Notify tutor of new enquiry
  NO  → Existing student:
        Detect intent (reschedule / payment query / general)
        Handle accordingly
        ↓
Is bot stuck? (repeated questions, student confused)
  YES → Pause bot
        Send student: "Sir will reply shortly"
        Notify tutor: App push + WhatsApp with chat link
  NO  → Continue conversation
```

---

## Environment Variables Required

```bash
# Supabase
NEXT_PUBLIC_SUPABASE_URL=
NEXT_PUBLIC_SUPABASE_ANON_KEY=
SUPABASE_SERVICE_ROLE_KEY=

# Twilio
TWILIO_ACCOUNT_SID=
TWILIO_AUTH_TOKEN=
TWILIO_WHATSAPP_FROM=

# Claude AI
ANTHROPIC_API_KEY=

# Zoom
ZOOM_API_KEY=
ZOOM_API_SECRET=
ZOOM_ACCOUNT_ID=

# App
NEXTAUTH_SECRET=
NEXT_PUBLIC_APP_URL=https://smartclaz.com
```

---

## Middleware — Route Protection

```typescript
// src/middleware.ts
// Protect all routes except:
// - / (landing)
// - /login
// - /signup (and sub-pages)
// - /api/whatsapp/webhook

const publicRoutes = ['/', '/login', '/signup', '/api/whatsapp/webhook']
```

---

## Component Conventions

```typescript
// Always use 'use client' for interactive components
// Server components for static/data-fetching pages
// All amounts displayed as: LKR {amount.toLocaleString()}
// All dates: toLocaleDateString('en-LK')
// Phone numbers: always stored with +94 prefix
// Use shadcn/ui components where possible
// Modal/sheets: slide up from bottom (mobile-first)
// Loading states: skeleton loaders not spinners
// Empty states: friendly message with action button
// Error states: toast notifications (shadcn toast)
```

---

## Build Priority Order

```
Week 1:
  [ ] Landing page
  [ ] Signup Step 1 (basic profile + OTP)
  [ ] Signup Step 2 (subjects + fees)
  [ ] Signup Step 3 (settings + WhatsApp)
  [ ] Dashboard (main)
  [ ] Middleware (route protection)

Week 2:
  [ ] Students page
  [ ] Batches page
  [ ] Sessions page
  [ ] Payments page

Week 3:
  [ ] WhatsApp Chats page
  [ ] Settings page
  [ ] WhatsApp webhook API route
  [ ] Twilio integration

Week 4:
  [ ] Claude AI bot logic
  [ ] Zoom API integration
  [ ] Push notifications
  [ ] Reminders scheduler (Supabase Edge Functions)
  [ ] Message cost tracking
```

---

## Notes for Claude Code

- Always check Supabase types before writing queries
- Use Supabase RLS (Row Level Security) — tutors only see their own data
- All WhatsApp numbers stored with country code: +94771234567
- Monthly fee tracking: use month_year field format "YYYY-MM" (e.g. "2025-06")
- Batch Zoom links refresh every Sunday at 6am automatically (cron job)
- When in doubt about a component → use shadcn/ui
- Mobile-first responsive design — tutors use phones
- Test all forms with real Sri Lankan phone number format
- Use Supabase Realtime for dashboard live updates
```

**Note:** CLAUDE.md is significantly stale relative to the actual codebase — it describes an earlier planned architecture (`src/app/...` paths that don't exist; the real app uses `app/...` with route groups `(app)`/`(auth)`/`(onboarding)`), a `src/middleware.ts` that doesn't exist (the real middleware is `proxy.ts` at the project root, using a `proxy()` export — an unusual convention worth confirming with whoever set it up), and doesn't mention several since-added subsystems (waitlist, trial classes, CSV import, contact-change/account-recovery flows, attendance tracking, notifications table, or the overdue-payment consent system). Treat the schema/business-rules sections above as historical intent, not ground truth — §3 of this document reflects the real current schema. The signup-flow ambiguity noted below the doc previously had (it once described a single-flow wizard while the codebase had two overlapping ones) is now resolved — see the "⚠️ Live Signup Flow" callout added to the top of the actual CLAUDE.md (reproduced above) and §9.

---

## 9. Known Issues, TODOs & Incomplete Features

### Not yet wired to real external services (test/stub mode throughout)
- **WhatsApp (Twilio):** `lib/twilio.ts` is in test mode (`WHATSAPP_TEST_MODE`/`NODE_ENV=development`) — all sends just log to console + `message_logs`; the real Twilio client call is commented out pending `npm install twilio` + credentials.
- **Zoom:** `lib/zoom.ts` falls back to fake/test meeting URLs when Zoom credentials aren't configured.
- **Auth:** still email-OTP primary in several flows; multiple files note "switch to phone OTP via Twilio SMS" as pending.
- **Turnstile:** using test Cloudflare keys with a dev bypass still present (`lib/turnstile.ts`).
- **Resend email:** using Resend's test sending domain, not the verified `smartclaz.com` domain yet.
- **Web push notifications:** not implemented — several "uncomment web push" TODOs in `lib/bot/process-webhook.ts`.

### Stub API routes (log intent, don't perform the real action)
- `POST /api/batches/[id]/remind-all` — counts recipients, doesn't send.
- `POST /api/batches/[id]/send-zoom` — counts recipients, doesn't send.
- `POST /api/batches/[id]/zoom` — generates a fake/random link, not a real Zoom API call.
- `POST /api/waitlist/offer` / `POST /api/waitlist/resend` — builds the WhatsApp message text but the send is commented out.

### Architectural gaps found and partially fixed this session
- **Missing FK:** `students.batch_id → batches.id` was never actually constrained at the DB level (a migration-006 bug: the retroactive `ALTER TABLE ... ADD COLUMN IF NOT EXISTS` no-op'd because the column already existed). This broke any PostgREST query embedding `students(*, batches(*))`, including `/api/payments/verify`. **Fixed** via `20260813_fix_students_batch_fk.sql`.
- **Frozen overdue status:** Several places (Dashboard, Students, Payments, Batches, the reminders cron) used to trust the stored `payments.status`/`due_date` columns directly, which never update retroactively when a tutor changes `monthly_due_date`/`grace_period_days` in Settings. **Fixed** by introducing `lib/payment-status.ts::computeOverdueStatus()` as the single shared live-computation, used identically everywhere. Auto-vs-manual reminder consent (`tutors.auto_notify_overdue`) and strictly-manual student blocking were added as part of the same change.
- **`/api/payments/verify` error swallowing:** was collapsing any Supabase/PostgREST error (including the FK bug above) into a generic "Payment not found" 404, hiding the real cause. **Fixed** — now logs the actual error server-side.
- **`sessions/page.tsx` runtime bug:** the "Copy link" button called `showToast()` inside a child component (`SessionRow`) that never received it as a prop, breaking the production build's type-check. **Fixed.**

### Known unresolved bugs (pre-existing, out of scope for the work done this session)
- `components/BatchAttendancePanel.tsx` — TypeScript errors: `Session.batch_id` type (`string | null | undefined`) isn't assignable to the panel's expected `string | null`; an `AttendanceStatus` literal-union mismatch in two places.
- `hooks/useCountUp.ts` — TypeScript errors: a function is called with the wrong argument count in two places; `undefined` isn't assignable to a `number`-typed field.
- `app/(app)/settings/page.tsx` — a `TrialSegment` sub-component is defined **inside** the render function body in two separate places, which resets its internal state on every parent re-render (`react-hooks/static-components` violation).
- `app/(app)/payments/page.tsx`, `app/(app)/students/page.tsx` — several `useEffect` bodies call `setState()` synchronously and unconditionally (`react-hooks/set-state-in-effect` violations); functional today but flagged as a perf/cascading-render risk.
- A grab-bag of unused variables/imports flagged by ESLint across `dashboard/page.tsx`, `payments/page.tsx`, `settings/page.tsx`, `students/page.tsx`, `batches/page.tsx`, `batches/route.ts` — cosmetic, not build-blocking.

### Resolved this session
- **Two parallel signup wizards** — confirmed via `proxy.ts`'s `stepOrder` array and every page's actual "Continue" button destination that only `/signup → /signup/classes → /signup/payments → /signup/preferences → /dashboard` is live/enforced. The other chain (`subjects → groups → availability → settings`) was never linked from Step 1 and was not checked by middleware. **Deleted**, along with the dead `getCurrentTutor`/`isSignupComplete`/`getSignupRedirect` functions in `lib/auth.ts` (a second, conflicting redirect implementation that pointed at the orphaned flow, confirmed to have zero callers anywhere). `CLAUDE.md` now has an explicit callout documenting the live flow to prevent this ambiguity resurfacing.

### Structural/data-model questions worth clarifying
- **`reminders` table** exists in the schema (migration 006) but no code in the repo appears to read or write it — actual reminder-sent tracking is done via boolean flag columns directly on `sessions`/`payments` instead. Likely dead schema.
- **`design-reference/Screenshot 2026-08-06 153106.jpg`** is an untracked file in the repo whose origin/purpose is unknown.
- **Middleware naming:** the project uses `proxy.ts` (exporting a `proxy()` function) at the project root instead of Next.js's conventional `middleware.ts`/`middleware()` — this only works if the installed Next.js version supports that as an alias; worth confirming rather than assuming, since CLAUDE.md still refers to the old `src/middleware.ts` convention.

---

*End of summary. Everything above reflects the actual codebase state as read directly from source — not from CLAUDE.md's (stale) description of intended architecture.*
