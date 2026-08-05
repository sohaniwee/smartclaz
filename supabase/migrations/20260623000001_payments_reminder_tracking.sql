-- Add reminder tracking columns to payments table
ALTER TABLE payments
  ADD COLUMN IF NOT EXISTS reminder_count    int          NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS reminder_sent_at  timestamptz;
