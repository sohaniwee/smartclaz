-- ============================================================
-- Migration 006: Core application tables
-- Project: Smartclaz
-- Run BEFORE migrations 004 and 005
-- Run in Supabase Dashboard → SQL Editor
-- ============================================================

-- ── STUDENTS ────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS students (
  id             uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  tutor_id       uuid        NOT NULL REFERENCES tutors(id) ON DELETE CASCADE,
  name           text        NOT NULL,
  whatsapp       text        NOT NULL,
  parent_name    text,
  parent_whatsapp text,
  subject        text,
  grade          text,
  class_type     text        NOT NULL DEFAULT 'individual',
  -- 'individual' | 'group' | 'trial'
  batch_id       uuid,       -- FK to batches added after batches table created
  monthly_fee    int,        -- LKR
  fee_type       text        DEFAULT 'monthly',
  -- 'monthly' | 'per_session'
  status         text        NOT NULL DEFAULT 'active',
  -- 'active' | 'inactive' | 'blocked'
  consent_given  boolean     DEFAULT false,
  consent_at     timestamptz,
  created_at     timestamptz NOT NULL DEFAULT now()
);

-- ── BATCHES ─────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS batches (
  id                      uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  tutor_id                uuid        NOT NULL REFERENCES tutors(id) ON DELETE CASCADE,
  name                    text        NOT NULL,
  subject                 text,
  grade                   text,
  schedule_day            text,       -- 'Sunday' | 'Monday' etc.
  schedule_day_number     int         DEFAULT 1,
  -- Zoom recurrence: 1=Sunday, 2=Monday ... 7=Saturday
  schedule_time           time,       -- '08:00'
  max_students            int,
  monthly_fee             int,        -- LKR per student
  zoom_meeting_id         text,       -- recurring Zoom meeting ID
  current_zoom_link       text,       -- this week's join URL
  current_zoom_meeting_id text,       -- this week's meeting ID
  zoom_link_generated_at  timestamptz,
  status                  text        NOT NULL DEFAULT 'active',
  -- 'active' | 'inactive'
  created_at              timestamptz NOT NULL DEFAULT now()
);

-- Add FK from students to batches now that batches exists
ALTER TABLE students
  ADD COLUMN IF NOT EXISTS batch_id uuid REFERENCES batches(id) ON DELETE SET NULL;

-- ── SESSIONS ────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS sessions (
  id                    uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  tutor_id              uuid        NOT NULL REFERENCES tutors(id) ON DELETE CASCADE,
  student_id            uuid        REFERENCES students(id) ON DELETE SET NULL,
  batch_id              uuid        REFERENCES batches(id) ON DELETE SET NULL,
  session_type          text        NOT NULL DEFAULT 'individual',
  -- 'individual' | 'batch'
  scheduled_at          timestamptz NOT NULL,
  duration_mins         int         DEFAULT 60,
  zoom_link             text,
  zoom_meeting_id       text,
  status                text        NOT NULL DEFAULT 'scheduled',
  -- 'scheduled' | 'completed' | 'no_show' | 'cancelled'
  payment_status        text        NOT NULL DEFAULT 'pending',
  -- 'pending' | 'paid' | 'forfeited'
  notes                 text,
  reminder_24h_sent     boolean     DEFAULT false,
  reminder_1h_sent      boolean     DEFAULT false,
  tutor_notified_30min  boolean     DEFAULT false,
  created_at            timestamptz NOT NULL DEFAULT now()
);

-- ── PAYMENTS ────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS payments (
  id                    uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  tutor_id              uuid        NOT NULL REFERENCES tutors(id) ON DELETE CASCADE,
  student_id            uuid        REFERENCES students(id) ON DELETE SET NULL,
  session_id            uuid        REFERENCES sessions(id) ON DELETE SET NULL,
  amount_lkr            int         NOT NULL,
  payment_type          text        NOT NULL DEFAULT 'monthly',
  -- 'monthly' | 'per_session'
  month_year            text,       -- 'YYYY-MM' e.g. '2026-06'
  method                text,
  -- 'bank' | 'ezCash' | 'cash' | 'payhere'
  status                text        NOT NULL DEFAULT 'pending',
  -- 'pending' | 'paid' | 'overdue' | 'blocked'
  due_date              date,
  paid_at               timestamptz,
  verified_by           text,
  -- 'tutor' | 'payhere'
  reminder_3day_sent    boolean     DEFAULT false,
  reminder_due_sent     boolean     DEFAULT false,
  reminder_overdue_sent boolean     DEFAULT false,
  created_at            timestamptz NOT NULL DEFAULT now()
);

-- ── REMINDERS ───────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS reminders (
  id           uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  session_id   uuid        REFERENCES sessions(id) ON DELETE CASCADE,
  student_id   uuid        REFERENCES students(id) ON DELETE CASCADE,
  type         text        NOT NULL,
  -- '24h' | '1h' | '30min_tutor' | 'payment_due' | 'payment_overdue'
  channel      text        NOT NULL DEFAULT 'whatsapp',
  -- 'whatsapp' | 'push'
  scheduled_at timestamptz,
  sent_at      timestamptz,
  status       text        NOT NULL DEFAULT 'pending',
  -- 'pending' | 'sent' | 'failed'
  created_at   timestamptz NOT NULL DEFAULT now()
);

-- ── CONVERSATIONS ────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS conversations (
  id                uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  tutor_id          uuid        NOT NULL REFERENCES tutors(id) ON DELETE CASCADE,
  student_whatsapp  text        NOT NULL,
  status            text        NOT NULL DEFAULT 'bot',
  -- 'bot' | 'human' | 'resolved'
  context           jsonb       DEFAULT '{"step":"greeting"}',
  messages          jsonb       DEFAULT '[]',
  test_mode         boolean     DEFAULT false,
  last_message_at   timestamptz DEFAULT now(),
  created_at        timestamptz NOT NULL DEFAULT now()
);

-- ── MESSAGE_LOGS ─────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS message_logs (
  id         uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  tutor_id   uuid        REFERENCES tutors(id) ON DELETE SET NULL,
  direction  text        NOT NULL DEFAULT 'outbound',
  -- 'inbound' | 'outbound'
  cost_usd   decimal(10,6) DEFAULT 0,
  month_year text,       -- 'YYYY-MM'
  test_mode  boolean     DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT now()
);

-- ── ENABLE RLS ON ALL TABLES ─────────────────────────────────
ALTER TABLE students      ENABLE ROW LEVEL SECURITY;
ALTER TABLE batches       ENABLE ROW LEVEL SECURITY;
ALTER TABLE sessions      ENABLE ROW LEVEL SECURITY;
ALTER TABLE payments      ENABLE ROW LEVEL SECURITY;
ALTER TABLE reminders     ENABLE ROW LEVEL SECURITY;
ALTER TABLE conversations ENABLE ROW LEVEL SECURITY;
ALTER TABLE message_logs  ENABLE ROW LEVEL SECURITY;

-- ── RLS POLICIES — tutor sees only their own data ────────────
DROP POLICY IF EXISTS "students_own"      ON students;
DROP POLICY IF EXISTS "batches_own"       ON batches;
DROP POLICY IF EXISTS "sessions_own"      ON sessions;
DROP POLICY IF EXISTS "payments_own"      ON payments;
DROP POLICY IF EXISTS "reminders_own"     ON reminders;
DROP POLICY IF EXISTS "conversations_own" ON conversations;
DROP POLICY IF EXISTS "message_logs_own"  ON message_logs;

CREATE POLICY "students_own" ON students
  FOR ALL USING (tutor_id = auth.uid()) WITH CHECK (tutor_id = auth.uid());

CREATE POLICY "batches_own" ON batches
  FOR ALL USING (tutor_id = auth.uid()) WITH CHECK (tutor_id = auth.uid());

CREATE POLICY "sessions_own" ON sessions
  FOR ALL USING (tutor_id = auth.uid()) WITH CHECK (tutor_id = auth.uid());

CREATE POLICY "payments_own" ON payments
  FOR ALL USING (tutor_id = auth.uid()) WITH CHECK (tutor_id = auth.uid());

CREATE POLICY "reminders_own" ON reminders
  FOR ALL USING (
    student_id IN (
      SELECT id FROM students WHERE tutor_id = auth.uid()
    )
  );

CREATE POLICY "conversations_own" ON conversations
  FOR ALL USING (tutor_id = auth.uid()) WITH CHECK (tutor_id = auth.uid());

CREATE POLICY "message_logs_own" ON message_logs
  FOR ALL USING (tutor_id = auth.uid()) WITH CHECK (tutor_id = auth.uid());

-- ── PERFORMANCE INDEXES ───────────────────────────────────────
CREATE INDEX IF NOT EXISTS idx_students_tutor        ON students(tutor_id);
CREATE INDEX IF NOT EXISTS idx_batches_tutor         ON batches(tutor_id);
CREATE INDEX IF NOT EXISTS idx_sessions_tutor        ON sessions(tutor_id);
CREATE INDEX IF NOT EXISTS idx_sessions_scheduled    ON sessions(scheduled_at) WHERE status = 'scheduled';
CREATE INDEX IF NOT EXISTS idx_payments_tutor        ON payments(tutor_id);
CREATE INDEX IF NOT EXISTS idx_payments_due_date     ON payments(due_date) WHERE status = 'pending';
CREATE INDEX IF NOT EXISTS idx_conversations_tutor   ON conversations(tutor_id, student_whatsapp);
CREATE INDEX IF NOT EXISTS idx_message_logs_tutor    ON message_logs(tutor_id, month_year);
