/**
 * Audit logging — fire and forget (never blocks main flow).
 * Uses service role key (server-side only). NEVER call this from client
 * components in production — this module reads SUPABASE_SERVICE_ROLE_KEY.
 *
 * ✅ CURRENT: Writes to the `audit_logs` table (migration 001) via a
 *    service-role Supabase client, in addition to the existing dev console.log.
 * 📝 NOTE: audit_logs has NO `metadata` jsonb column — only
 *    entity / entity_id / old_value / new_value (both jsonb). Callers may pass
 *    an arbitrary metadata bag; it is mapped onto those columns as follows:
 *      - metadata.entity      → entity (string)
 *      - metadata.entity_id or metadata.request_id → entity_id (string)
 *      - metadata.old_value / metadata.new_value, if present, are used as-is
 *      - otherwise, remaining keys are split: anything starting with `old_`
 *        goes into old_value, everything else goes into new_value
 *    This keeps every existing call site (which passes ad-hoc keys like
 *    old_email/new_email, ip_hash/email_hash, etc.) working without changes.
 */

import { createClient } from '@supabase/supabase-js'

export type AuditAction =
  | 'signup_started'
  | 'otp_sent'
  | 'otp_verified'
  | 'otp_failed'
  | 'otp_locked'
  | 'signup_completed'
  | 'login_success'
  | 'login_failed'
  | 'profile_updated'
  | 'phone_changed'
  | 'email_changed'
  | 'session_expired'
  | 'logout'
  | 'avatar_uploaded'
  | 'suspicious_activity'
  | 'support_recovery_requested'
  | 'recovery_rate_limited'

// ── Service role client (server only) ─────────────────────────────────────────
function getServiceClient() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY
  if (!url || !key) return null
  return createClient(url, key, {
    auth: { persistSession: false, autoRefreshToken: false },
  })
}

export async function logEvent(
  tutorId: string | null,
  action: AuditAction,
  metadata?: Record<string, unknown>,
): Promise<void> {
  // Development: log to console (kept from the original stub).
  if (process.env.NODE_ENV === 'development') {
    console.log(`[audit] ${action}`, { tutorId, ...metadata })
  }

  // Fire and forget — never let audit logging break the caller's main flow.
  try {
    const supabase = getServiceClient()
    if (!supabase) return

    const meta: Record<string, unknown> = { ...(metadata ?? {}) }

    const entity =
      typeof meta.entity === 'string' ? meta.entity : null
    delete meta.entity

    const entityId =
      typeof meta.entity_id === 'string' ? meta.entity_id :
      typeof meta.request_id === 'string' ? meta.request_id :
      null
    delete meta.entity_id
    delete meta.request_id

    let oldValue: Record<string, unknown> | null = null
    let newValue: Record<string, unknown> | null = null

    if (meta.old_value !== undefined || meta.new_value !== undefined) {
      oldValue = (meta.old_value as Record<string, unknown> | undefined) ?? null
      newValue = (meta.new_value as Record<string, unknown> | undefined) ?? null
    } else if (Object.keys(meta).length > 0) {
      const oldEntries: Record<string, unknown> = {}
      const newEntries: Record<string, unknown> = {}
      for (const [k, v] of Object.entries(meta)) {
        if (k.startsWith('old_')) oldEntries[k] = v
        else newEntries[k] = v
      }
      oldValue = Object.keys(oldEntries).length > 0 ? oldEntries : null
      newValue = Object.keys(newEntries).length > 0 ? newEntries : null
    }

    await supabase.from('audit_logs').insert({
      tutor_id: tutorId,
      action,
      entity,
      entity_id: entityId,
      old_value: oldValue,
      new_value: newValue,
    })
  } catch {
    // ✅ CURRENT: Never throw — audit logging failures must not break the main flow.
  }
}
